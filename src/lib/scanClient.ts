import { analyze } from './engine';
import { applyScanRequest, type ScanRequest } from './scanJob';
import type { Analysis, Transaction } from './model';
import type { ColumnMapping, StatementParse } from './csv';

type Response = {
  id: number;
  ok: boolean;
  error?: string;
  parsed?: StatementParse;
  analysis?: Analysis;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: Response) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('../workers/scan.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Response>) => {
      const waiter = pending.get(event.data.id);
      if (!waiter) return;
      pending.delete(event.data.id);
      if (event.data.ok) waiter.resolve(event.data);
      else waiter.reject(new Error(event.data.error ?? 'Scan failed'));
    };
    worker.onerror = () => {
      for (const waiter of pending.values()) waiter.reject(new Error('Worker failed'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function request(message: ScanRequest): Promise<Response> {
  const current = getWorker();
  if (!current) return Promise.reject(new Error('No worker'));
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    current.postMessage({ id, ...message });
  });
}

export async function parseOffThread(
  text: string,
  source: string,
  options?: { delimiter?: string; mapping?: ColumnMapping; currency?: string },
): Promise<StatementParse> {
  try {
    const response = await request({
      op: 'parse',
      text,
      source,
      delimiter: options?.delimiter,
      mapping: options?.mapping,
      currency: options?.currency,
    });
    if (!response.parsed) throw new Error('Empty parse');
    return response.parsed;
  } catch {
    return applyScanRequest({
      op: 'parse',
      text,
      source,
      delimiter: options?.delimiter,
      mapping: options?.mapping,
      currency: options?.currency,
    }).parsed!;
  }
}

export async function analyzeOffThread(
  transactions: Transaction[],
  today: string,
): Promise<Analysis> {
  try {
    const response = await request({ op: 'analyze', transactions, today });
    if (!response.analysis) throw new Error('Empty analysis');
    return response.analysis;
  } catch {
    return analyze(transactions, { today });
  }
}
