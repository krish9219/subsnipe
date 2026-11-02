import { describe, expect, it } from 'vitest';
import { parseStatement } from './csv';
import { dedupeTransactions } from './dedupe';
import { analyze } from './engine';
import { buildSampleFiles } from './sample';

describe('sample statements', () => {
  const today = new Date(2026, 10, 1);
  const files = buildSampleFiles(today);
  const parsed = files.map((file) => parseStatement(file.text, file.name));
  const transactions = dedupeTransactions(parsed.flatMap((file) => file.transactions));
  const analysis = analyze(transactions, { today: '2026-11-01' });

  it('imports both files without a mapping prompt', () => {
    expect(parsed.every((file) => file.error == null && !file.detection.needsMapping)).toBe(true);
    expect(parsed.map((file) => file.detection.formatName)).toEqual(['HDFC Bank', 'Chase']);
  });

  it('finds the scripted subscriptions, hike, trial, fees, and overlaps', () => {
    const ids = analysis.subscriptions
      .filter((sub) => !sub.possiblyEnded)
      .map((sub) => sub.merchantId);
    for (const id of [
      'netflix',
      'spotify',
      'youtube-music',
      'youtube-premium',
      'jiohotstar',
      'amazon-prime',
      'airtel',
      'jio',
      'sonyliv',
      'swiggy-one',
      'chatgpt',
      'adobe',
      'icloud',
      'notion',
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(ids.filter((id) => id === 'netflix').length).toBe(2);
    expect(analysis.subscriptions.some((sub) => sub.merchantId.startsWith('unknown:'))).toBe(true);
    const hiked = analysis.subscriptions.find(
      (sub) => sub.merchantId === 'netflix' && sub.latestAmount === 249,
    );
    expect(hiked?.priceHike?.from).toBe(199);
    expect(
      analysis.subscriptions.find((sub) => sub.merchantId === 'sonyliv')?.trial?.trialAmount,
    ).toBe(2);
    expect(analysis.subscriptions.find((sub) => sub.merchantId === 'chatgpt')?.currency).toBe(
      'USD',
    );
    expect(analysis.fees.length).toBeGreaterThanOrEqual(2);
    expect(analysis.fees.some((fee) => fee.subscriptionId)).toBe(true);
    expect(analysis.duplicates.some((group) => group.category === 'music')).toBe(true);
    expect(analysis.displayCurrency).toBe('INR');
    expect(analysis.fxApproximate).toBe(true);
    const names = analysis.subscriptions.map((sub) => sub.name.toLowerCase()).join(' ');
    expect(names).not.toContain('marketplace');
    expect(names).not.toContain('coffee');
    expect(analysis.subscriptions.some((sub) => /swiggy order/i.test(sub.name))).toBe(false);
  });

  it('dedupes overlapping rows only when they come from another file', () => {
    const otherFile = transactions.map((tx) => ({ ...tx, id: `${tx.id}-b`, source: 'other-file' }));
    expect(dedupeTransactions([...transactions, ...otherFile])).toHaveLength(transactions.length);
    expect(dedupeTransactions([...transactions, ...transactions])).toHaveLength(
      transactions.length * 2,
    );
  });
});
