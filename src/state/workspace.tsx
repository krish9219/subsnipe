import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LIMITS,
  parseStatement,
  readFileText,
  transactionsFromMapping,
  type ColumnDetection,
  type ColumnMapping,
} from '@/lib/csv';
import { dedupeTransactions } from '@/lib/dedupe';
import { analyze } from '@/lib/engine';
import { extractPdf } from '@/lib/pdf';
import { buildSampleFiles } from '@/lib/sample';
import {
  idbClear,
  idbGet,
  idbSet,
  toSaved,
  WORKSPACE_KEY,
  type SavedWorkspace,
} from '@/lib/storage';
import { todayISO } from '@/lib/dates';
import type { Decision, Transaction } from '@/lib/model';

export type FileRecord = {
  id: string;
  name: string;
  formatName: string | null;
  count: number;
  warnings: string[];
  rows: string[][] | null;
  detection: ColumnDetection | null;
};

export type MapJob = {
  fileId: string;
  name: string;
  rows: string[][];
  detection: ColumnDetection;
};

export type Banner = { id: string; tone: 'info' | 'warn' | 'bad'; text: string };

type WorkspaceValue = {
  transactions: Transaction[];
  files: FileRecord[];
  decisions: Record<string, Decision>;
  persist: boolean;
  restored: boolean;
  hydrated: boolean;
  busy: boolean;
  banners: Banner[];
  mapJob: MapJob | null;
  mapLeft: number;
  analysis: ReturnType<typeof analyze>;
  ingest: (files: File[]) => Promise<void>;
  loadSample: () => void;
  confirmMapping: (mapping: ColumnMapping, currency: string) => void;
  skipMapping: () => void;
  remap: (fileId: string) => void;
  removeFile: (fileId: string) => void;
  setDecision: (id: string, decision: Decision) => void;
  saveLocally: () => Promise<void>;
  wipe: () => Promise<void>;
  dismissBanner: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function uid(): string {
  return crypto.randomUUID();
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [persist, setPersist] = useState(false);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [queue, setQueue] = useState<MapJob[]>([]);

  const pushBanner = useCallback((tone: Banner['tone'], text: string) => {
    setBanners((current) => [{ id: uid(), tone, text }, ...current].slice(0, 4));
  }, []);

  useEffect(() => {
    let cancel = false;
    idbGet<SavedWorkspace>(WORKSPACE_KEY)
      .then((saved) => {
        if (cancel || !saved || saved.version !== 1 || saved.transactions.length === 0) return;
        setTransactions(saved.transactions);
        setFiles(
          saved.files.map((file) => ({
            ...file,
            warnings: [],
            rows: null,
            detection: null,
          })),
        );
        setDecisions(saved.decisions);
        setPersist(true);
        setRestored(true);
      })
      .catch(() => {
        pushBanner('warn', 'Saved scans on this device could not be read.');
      })
      .finally(() => {
        if (!cancel) setHydrated(true);
      });
    return () => {
      cancel = true;
    };
  }, [pushBanner]);

  useEffect(() => {
    if (!hydrated || !persist) return;
    const handle = window.setTimeout(() => {
      const snapshot = toSaved({
        transactions,
        files: files.map(({ id, name, formatName, count }) => ({ id, name, formatName, count })),
        decisions,
      });
      void idbSet(WORKSPACE_KEY, snapshot).catch(() => {
        pushBanner('warn', 'Could not save on this device.');
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [hydrated, persist, transactions, files, decisions, pushBanner]);

  const analysis = useMemo(() => analyze(transactions, { today: todayISO() }), [transactions]);

  const commit = useCallback(
    (file: FileRecord, rows: Transaction[]) => {
      setFiles((current) => [...current.filter((item) => item.id !== file.id), file]);
      setTransactions((current) =>
        dedupeTransactions([...current.filter((tx) => tx.source !== file.id), ...rows]),
      );
      for (const warning of file.warnings) pushBanner('info', `${file.name}: ${warning}`);
    },
    [pushBanner],
  );

  const ingest = useCallback(
    async (list: File[]) => {
      setBusy(true);
      const jobs: MapJob[] = [];
      try {
        for (const file of list) {
          if (file.size > LIMITS.maxBytes) {
            pushBanner('bad', `${file.name} is over 15 MB. Export a smaller CSV.`);
            continue;
          }
          const id = uid();
          const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          if (pdf) {
            const buffer = await file.arrayBuffer();
            const result = await extractPdf(buffer, id);
            if (result.error) {
              pushBanner('warn', `${file.name}: ${result.error}`);
              continue;
            }
            commit(
              {
                id,
                name: file.name,
                formatName: 'PDF',
                count: result.transactions.length,
                warnings: result.warnings,
                rows: null,
                detection: null,
              },
              result.transactions,
            );
            continue;
          }
          const text = await readFileText(file);
          const parsed = parseStatement(text, id);
          if (parsed.error) {
            pushBanner('warn', `${file.name}: ${parsed.error}`);
            continue;
          }
          if (parsed.detection.needsMapping) {
            jobs.push({
              fileId: id,
              name: file.name,
              rows: parsed.rows,
              detection: parsed.detection,
            });
            continue;
          }
          commit(
            {
              id,
              name: file.name,
              formatName: parsed.detection.formatName,
              count: parsed.transactions.length,
              warnings: parsed.warnings,
              rows: parsed.rows,
              detection: parsed.detection,
            },
            parsed.transactions,
          );
        }
        if (jobs.length) setQueue((current) => [...current, ...jobs]);
      } catch {
        pushBanner('bad', 'One of those files could not be read.');
      } finally {
        setBusy(false);
      }
    },
    [commit, pushBanner],
  );

  const loadSample = useCallback(() => {
    const samples = buildSampleFiles(new Date());
    for (const sample of samples) {
      const id = uid();
      const parsed = parseStatement(sample.text, id);
      if (parsed.error || parsed.detection.needsMapping) {
        pushBanner('bad', `Sample file failed: ${parsed.error ?? 'columns need a mapping'}`);
        continue;
      }
      commit(
        {
          id,
          name: sample.name,
          formatName: parsed.detection.formatName,
          count: parsed.transactions.length,
          warnings: parsed.warnings,
          rows: parsed.rows,
          detection: parsed.detection,
        },
        parsed.transactions,
      );
    }
  }, [commit, pushBanner]);

  const finishJob = useCallback(
    (mapping: ColumnMapping | null, currency: string) => {
      const job = queue[0];
      if (!job) return;
      if (!mapping) {
        pushBanner('info', `Skipped ${job.name}.`);
      } else {
        const { transactions: rows, warnings } = transactionsFromMapping(
          job.rows,
          mapping,
          job.fileId,
          currency,
        );
        if (rows.length === 0) pushBanner('warn', `${job.name}: no transactions for that mapping.`);
        else {
          commit(
            {
              id: job.fileId,
              name: job.name,
              formatName: job.detection.formatName,
              count: rows.length,
              warnings,
              rows: job.rows,
              detection: { ...job.detection, mapping, needsMapping: false },
            },
            rows,
          );
        }
      }
      setQueue((current) => current.slice(1));
    },
    [commit, pushBanner, queue],
  );

  const remap = useCallback(
    (fileId: string) => {
      const file = files.find((item) => item.id === fileId);
      if (!file?.rows || !file.detection) return;
      setQueue((current) => [
        { fileId: file.id, name: file.name, rows: file.rows!, detection: file.detection! },
        ...current.filter((job) => job.fileId !== file.id),
      ]);
    },
    [files],
  );

  const removeFile = useCallback((fileId: string) => {
    setFiles((current) => current.filter((file) => file.id !== fileId));
    setTransactions((current) => current.filter((tx) => tx.source !== fileId));
  }, []);

  const saveLocally = useCallback(async () => {
    setPersist(true);
    const snapshot = toSaved({
      transactions,
      files: files.map(({ id, name, formatName, count }) => ({ id, name, formatName, count })),
      decisions,
    });
    await idbSet(WORKSPACE_KEY, snapshot);
    pushBanner('info', 'Saved on this device. Nothing was uploaded.');
  }, [decisions, files, pushBanner, transactions]);

  const wipe = useCallback(async () => {
    await idbClear();
    setTransactions([]);
    setFiles([]);
    setDecisions({});
    setPersist(false);
    setRestored(false);
    setQueue([]);
    pushBanner('info', 'Statement data on this device is gone.');
  }, [pushBanner]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      transactions,
      files,
      decisions,
      persist,
      restored,
      hydrated,
      busy,
      banners,
      mapJob: queue[0] ?? null,
      mapLeft: queue.length,
      analysis,
      ingest,
      loadSample,
      confirmMapping: (mapping, currency) => finishJob(mapping, currency),
      skipMapping: () => finishJob(null, 'INR'),
      remap,
      removeFile,
      setDecision: (id, decision) => setDecisions((current) => ({ ...current, [id]: decision })),
      saveLocally,
      wipe,
      dismissBanner: (id) => setBanners((current) => current.filter((banner) => banner.id !== id)),
    }),
    [
      analysis,
      banners,
      busy,
      decisions,
      files,
      finishJob,
      hydrated,
      ingest,
      loadSample,
      persist,
      queue,
      remap,
      removeFile,
      restored,
      saveLocally,
      transactions,
      wipe,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace missing');
  return value;
}
