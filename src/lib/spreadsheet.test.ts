import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStatement } from './csv';
import { spreadsheetToCsv } from './spreadsheet';

describe('excel import', () => {
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
