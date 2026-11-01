import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LIMITS,
  detectColumns,
  detectDelimiter,
  parseCsv,
  readFileText,
  type ColumnDetection,
  type ColumnMapping,
} from '@/lib/csv';
import { dedupeTransactions } from '@/lib/dedupe';
import { analyze } from '@/lib/engine';
import { extractPdf } from '@/lib/pdf';
import { buildSampleFiles } from '@/lib/sample';
import { analyzeOffThread, parseOffThread } from '@/lib/scanClient';
import { spreadsheetToCsv } from '@/lib/spreadsheet';
import {
  databaseExists,
  idbDelete,
  idbGet,
  idbSet,
  toSaved,
  WORKSPACE_KEY,
  type SavedWorkspace,
} from '@/lib/storage';
import { todayISO } from '@/lib/dates';
import type { Analysis, Decision, Transaction } from '@/lib/model';

export type FileRecord = {
  id: string;
  name: string;
  formatName: string | null;
  count: number;
  warnings: string[];
  rows: string[][] | null;
  detection: ColumnDetection | null;
  rawText: string | null;
};

export type MapJob = {
  fileId: string;
  name: string;
  text: string;
  delimiter: string;
  rows: string[][];
  detection: ColumnDetection;
};

export type PasswordAsk = {
  name: string;
  wrong: boolean;
  resolve: (value: string | null) => void;
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
  passwordAsk: PasswordAsk | null;
  answerPassword: (value: string | null) => void;
  setJobDelimiter: (delimiter: string) => void;
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
  const [passwordAsk, setPasswordAsk] = useState<PasswordAsk | null>(null);
  const [analysisState, setAnalysis] = useState<Analysis>(() => analyze([]));
  const skipSave = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const pushBanner = useCallback((tone: Banner['tone'], text: string) => {
    setBanners((current) => [{ id: uid(), tone, text }, ...current].slice(0, 4));
  }, []);

  useEffect(() => {
    let cancel = false;
    databaseExists()
      .then((exists) => (exists ? idbGet<SavedWorkspace>(WORKSPACE_KEY) : null))
      .then((saved) => {
        if (cancel || !saved || saved.version !== 1 || saved.transactions.length === 0) return;
        setTransactions(saved.transactions);
        setFiles(
          saved.files.map((file) => ({
            ...file,
            warnings: [],
            rows: null,
            detection: null,
            rawText: null,
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
    if (!hydrated || !persist || skipSave.current) return;
    saveTimer.current = window.setTimeout(() => {
      if (skipSave.current) return;
      const snapshot = toSaved({
        transactions,
        files: files.map(({ id, name, formatName, count }) => ({ id, name, formatName, count })),
        decisions,
      });
      void idbSet(WORKSPACE_KEY, snapshot).catch(() => {
        pushBanner('warn', 'Could not save on this device.');
      });
    }, 300);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [hydrated, persist, transactions, files, decisions, pushBanner]);

  const analyzedLocally = transactions.length < 2000;
  const localAnalysis = useMemo(
    () => (analyzedLocally ? analyze(transactions, { today: todayISO() }) : null),
    [analyzedLocally, transactions],
  );
  useEffect(() => {
    if (analyzedLocally) return;
    let cancel = false;
    void analyzeOffThread(transactions, todayISO()).then((next) => {
      if (!cancel) setAnalysis(next);
    });
    return () => {
      cancel = true;
    };
  }, [analyzedLocally, transactions]);
  const analysis = localAnalysis ?? analysisState;

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

  const askPassword = useCallback((name: string, wrong: boolean) => {
    return new Promise<string | null>((resolve) => {
      setPasswordAsk({ name, wrong, resolve });
    });
  }, []);

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
          const lower = file.name.toLowerCase();
          const pdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
          if (pdf) {
            const buffer = await file.arrayBuffer();
            const result = await extractPdf(buffer, id, (wrong) => askPassword(file.name, wrong));
            if (result.error) {
              pushBanner('warn', `${file.name}: ${result.error}`);
              continue;
            }
            commit(
              {
                id,
                name: file.name,
                formatName: 'PDF (beta)',
                count: result.transactions.length,
                warnings: result.warnings,
                rows: null,
                detection: null,
                rawText: null,
              },
              result.transactions,
            );
            continue;
          }
          const sheet = lower.endsWith('.xlsx') || lower.endsWith('.xls');
          const text = sheet
            ? await spreadsheetToCsv(await file.arrayBuffer())
            : await readFileText(file);
          const parsed = await parseOffThread(text, id);
          if (parsed.error) {
            pushBanner('warn', `${file.name}: ${parsed.error}`);
            continue;
          }
          if (parsed.detection.needsMapping) {
            jobs.push({
              fileId: id,
              name: file.name,
              text,
              delimiter: detectDelimiter(text),
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
              rawText: text,
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
    [askPassword, commit, pushBanner],
  );

  const loadSample = useCallback(() => {
    const samples = buildSampleFiles(new Date());
    void (async () => {
      for (const sample of samples) {
        const id = uid();
        const parsed = await parseOffThread(sample.text, id);
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
            rawText: sample.text,
          },
          parsed.transactions,
        );
      }
    })();
  }, [commit, pushBanner]);

  const finishJob = useCallback(
    (mapping: ColumnMapping | null, currency: string) => {
      const job = queue[0];
      if (!job) return;
      void (async () => {
        if (!mapping) {
          pushBanner('info', `Skipped ${job.name}.`);
        } else {
          const parsed = await parseOffThread(job.text, job.fileId, {
            mapping,
            currency,
            delimiter: job.delimiter,
          });
          if (parsed.transactions.length === 0) {
            pushBanner('warn', `${job.name}: no transactions for that mapping.`);
          } else {
            commit(
              {
                id: job.fileId,
                name: job.name,
                formatName: job.detection.formatName,
                count: parsed.transactions.length,
                warnings: parsed.warnings,
                rows: parsed.rows,
                detection: { ...job.detection, mapping, needsMapping: false },
                rawText: job.text,
              },
              parsed.transactions,
            );
          }
        }
        setQueue((current) => current.slice(1));
      })();
    },
    [commit, pushBanner, queue],
  );

  const setJobDelimiter = useCallback((delimiter: string) => {
    setQueue((current) =>
      current.map((job, index) => {
        if (index !== 0 || !job.text) return job;
        const rows = parseCsv(job.text, delimiter);
        return { ...job, delimiter, rows, detection: detectColumns(rows) };
      }),
    );
  }, []);

  const remap = useCallback(
    (fileId: string) => {
      const file = files.find((item) => item.id === fileId);
      if (!file?.rows || !file.detection || !file.rawText) return;
      setQueue((current) => [
        {
          fileId: file.id,
          name: file.name,
          text: file.rawText!,
          delimiter: detectDelimiter(file.rawText!),
          rows: file.rows!,
          detection: file.detection!,
        },
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
    skipSave.current = true;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    setPersist(false);
    setTransactions([]);
    setFiles([]);
    setDecisions({});
    setRestored(false);
    setQueue([]);
    try {
      await idbDelete();
      pushBanner('info', 'Statement data on this device is gone.');
    } catch {
      pushBanner(
        'warn',
        'The scan on screen was cleared, but the browser could not delete saved storage.',
      );
    }
  }, [pushBanner]);

  const answerPassword = useCallback(
    (value: string | null) => {
      passwordAsk?.resolve(value);
      setPasswordAsk(null);
    },
    [passwordAsk],
  );

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
      passwordAsk,
      answerPassword,
      setJobDelimiter,
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
      passwordAsk,
      answerPassword,
      setJobDelimiter,
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
