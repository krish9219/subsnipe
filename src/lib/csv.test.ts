import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv, parseStatement } from './csv';
import { parseMoneyCell } from './money';

describe('money cells', () => {
  it('parses Indian, US, and European amounts', () => {
    expect(parseMoneyCell('1,299.00')?.amount).toBe(1299);
    expect(parseMoneyCell('₹1,23,456.50')?.amount).toBe(123456.5);
    expect(parseMoneyCell('₹1,23,456.50')?.currency).toBe('INR');
    expect(parseMoneyCell('(1,299.00)')?.suffix).toBe('dr');
    expect(parseMoneyCell('1299.00 Dr')?.suffix).toBe('dr');
    expect(parseMoneyCell('500.00 Cr')?.suffix).toBe('cr');
    expect(parseMoneyCell('-$20.00')).toMatchObject({ amount: 20, currency: 'USD', suffix: 'dr' });
    expect(parseMoneyCell('12,50')?.amount).toBe(12.5);
    expect(parseMoneyCell('1.234,56')?.amount).toBe(1234.56);
    expect(parseMoneyCell('—')).toBeNull();
  });
});

describe('csv parsing', () => {
  it('handles quotes, BOMs, and delimiters', () => {
    const text = '\uFEFFDate;Narration;Amount\n01/04/2026;"NETFLIX, MOBILE";649.00\n';
    expect(detectDelimiter(text)).toBe(';');
    const rows = parseCsv(text);
    expect(rows[1]?.[1]).toBe('NETFLIX, MOBILE');
  });

  it('reads an HDFC-style statement past the preamble', () => {
    const text = [
      'Account Name,Sample',
      'Account Number,XXXX',
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '04/01/2026,UPI-NETFLIX-PAYTM,,04/01/2026,"1,299.00",,50000.00',
      '04/02/2026,"NACH-AIRTEL POSTPAID, AUTOPAY",,04/02/2026,999.00,,49001.00',
      '01/03/2026,NEFT SALARY,,01/03/2026,,145000.00,194001.00',
    ].join('\n');
    const parsed = parseStatement(text, 'hdfc.csv');
    expect(parsed.detection.needsMapping).toBe(false);
    expect(parsed.detection.formatName).toBe('HDFC Bank');
    expect(parsed.error).toBeNull();
    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0]).toMatchObject({
      date: '2026-01-04',
      direction: 'debit',
      amount: 1299,
      currency: 'INR',
    });
    expect(parsed.transactions[2]?.direction).toBe('credit');
    expect(parsed.transactions[1]?.description).toContain('AIRTEL');
  });

  it('uses MDY for a Chase export and signed amounts', () => {
    const text = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '03/08/2026,03/08/2026,ADOBE CREATIVE CLOUD,Shopping,Sale,-$54.99,',
      '03/28/2026,03/28/2026,AUTOPAY PAYMENT THANK YOU,Payment,Payment,$54.99,',
    ].join('\n');
    const parsed = parseStatement(text, 'chase.csv');
    expect(parsed.detection.formatName).toBe('Chase');
    expect(parsed.transactions[0]).toMatchObject({
      date: '2026-03-08',
      direction: 'debit',
      currency: 'USD',
    });
    expect(parsed.transactions[1]).toMatchObject({
      date: '2026-03-28',
      direction: 'credit',
      currency: 'USD',
    });
  });

  it('reads an ICICI remarks export', () => {
    const text = [
      'S No.,Value Date,Transaction Date,Transaction Remarks,Withdrawal Amount (INR),Deposit Amount (INR),Balance (INR)',
      '1,02/05/2026,01/05/2026,UPI-SPOTIFY INDIA,119.00,,1000.00',
    ].join('\n');
    const parsed = parseStatement(text, 'icici.csv');
    expect(parsed.detection.formatId).toBe('icici');
    expect(parsed.transactions[0]).toMatchObject({
      date: '2026-05-01',
      amount: 119,
      description: 'UPI-SPOTIFY INDIA',
    });
  });

  it('asks for a mapping when the file has no header', () => {
    const parsed = parseStatement('hello world\nthis is not a statement\n', 'notes.txt');
    expect(parsed.detection.needsMapping).toBe(true);
    expect(parsed.transactions).toHaveLength(0);
  });

  it('reports an empty file', () => {
    expect(parseStatement('   ', 'empty.csv').error).toMatch(/empty/i);
  });

  it('parses a few thousand rows without dropping the real charge', () => {
    const lines = ['Date,Narration,Withdrawal Amt.,Deposit Amt.'];
    for (let index = 0; index < 1500; index += 1) {
      lines.push(`0${(index % 9) + 1}/01/2026,UPI-RANDOM SHOP ${index},${(index % 17) + 10}.00,`);
    }
    lines.push('04/06/2026,NETFLIX,649.00,');
    const parsed = parseStatement(lines.join('\n'), 'big.csv');
    expect(
      parsed.transactions.some((row) => row.description === 'NETFLIX' && row.amount === 649),
    ).toBe(true);
  });
});
