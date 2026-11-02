import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStatement } from './csv';
import { spreadsheetToCsv } from './spreadsheet';

describe('excel import', () => {
  it('keeps real Excel date cells as ISO dates for an ICICI sheet', async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        'Transaction Date',
        'Value Date',
        'Transaction Remarks',
        'Withdrawal Amount (INR)',
        'Deposit Amount (INR)',
        'Balance (INR)',
      ],
      [new Date(2026, 0, 4), new Date(2026, 0, 4), 'NETFLIX', 649, '', 10000],
      [new Date(2026, 5, 4), new Date(2026, 5, 4), 'NETFLIX', 649, '', 9000],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'Statement');
    const data = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const csv = await spreadsheetToCsv(data);
    expect(csv).not.toMatch(/\b1\/4\/26\b/);
    const parsed = parseStatement(csv, 'icici.xlsx');
    expect(parsed.detection.formatId).toBe('icici');
    expect(parsed.transactions.map((row) => row.date)).toEqual(['2026-01-04', '2026-06-04']);
  });

  it('reads a spreadsheet as a statement', async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.'],
      ['04/01/2026', 'NETFLIX', 649, ''],
      ['04/02/2026', 'SPOTIFY', 119, ''],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'Statement');
    const data = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const csv = await spreadsheetToCsv(data);
    const parsed = parseStatement(csv, 'statement.xlsx');
    expect(parsed.transactions.map((row) => row.description)).toEqual(['NETFLIX', 'SPOTIFY']);
    expect(parsed.error).toBeNull();
  });
});
