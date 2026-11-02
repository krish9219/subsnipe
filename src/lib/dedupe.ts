import { normalizeText } from './merchants';
import type { Transaction } from './model';

export function dedupeTransactions(list: Transaction[]): Transaction[] {
  const seen = new Map<string, string>();
  const kept: Transaction[] = [];
  for (const tx of list) {
    const key = [
      tx.date,
      tx.direction,
      tx.amount.toFixed(2),
      tx.currency,
      normalizeText(tx.description),
    ].join('|');
    const prior = seen.get(key);
    if (prior != null && prior !== tx.source) continue;
    if (prior == null) seen.set(key, tx.source);
    kept.push(tx);
  }
  return kept;
}
