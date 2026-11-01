import { normalizeText } from './merchants';
import type { Transaction } from './model';

export function dedupeTransactions(list: Transaction[]): Transaction[] {
  const seen = new Set<string>();
  const kept: Transaction[] = [];
  for (const tx of list) {
    const key = [
      tx.date,
      tx.direction,
      tx.amount.toFixed(2),
      tx.currency,
      normalizeText(tx.description),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(tx);
  }
  return kept;
}
