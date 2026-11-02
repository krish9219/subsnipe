import { describe, expect, it } from 'vitest';
import { itemsToLines, transactionsFromLines } from './pdf';

describe('pdf text extraction', () => {
  it('joins positioned glyphs into transaction lines and ignores the balance', () => {
    const lines = itemsToLines([
      { str: '04/01/2026', transform: [1, 0, 0, 1, 40, 700], width: 70 },
      { str: 'NETFLIX.COM', transform: [1, 0, 0, 1, 130, 700], width: 80 },
      { str: '649.00', transform: [1, 0, 0, 1, 320, 700], width: 40 },
      { str: '12,400.00', transform: [1, 0, 0, 1, 420, 700], width: 60 },
      { str: '09/01/2026', transform: [1, 0, 0, 1, 40, 680], width: 70 },
      { str: 'SPOTIFY', transform: [1, 0, 0, 1, 130, 680], width: 50 },
      { str: '119.00', transform: [1, 0, 0, 1, 320, 680], width: 40 },
    ]);
    const transactions = transactionsFromLines(lines, 'statement.pdf');
    expect(transactions.map((tx) => [tx.description, tx.amount])).toEqual([
      ['NETFLIX.COM', 649],
      ['SPOTIFY', 119],
    ]);
    expect(transactions.every((tx) => tx.currency === 'INR')).toBe(true);
  });

  it('returns nothing for prose', () => {
    expect(
      transactionsFromLines(['This PDF is a letter.', 'No table here.'], 'letter.pdf'),
    ).toEqual([]);
  });
});
