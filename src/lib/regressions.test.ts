import { describe, expect, it } from 'vitest';
import { parseStatement, detectDelimiter, LIMITS } from './csv';
import { addDaysISO, inferDateOrder, parseDate } from './dates';
import { analyze, isRejectedDescriptor, projectSavings } from './engine';
import {
  passwordWasWrong,
  transactionsFromItems,
  transactionsFromLines,
  itemsToLines,
  type PdfTextItem,
} from './pdf';
import { applyScanRequest } from './scanJob';
import { unknownName, matchMerchant } from './merchants';
import { buildSharePayload } from './share';
import type { Transaction } from './model';

let seq = 0;
function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'date' | 'description' | 'amount'>,
): Transaction {
  seq += 1;
  return {
    id: `r${seq}`,
    direction: 'debit',
    currency: 'INR',
    source: 'file-a',
    ...partial,
  };
}

function monthly(
  start: string,
  count: number,
  amount: number,
  description: string,
  extra?: Partial<Transaction>,
) {
  const rows: Transaction[] = [];
  let date = start;
  for (let index = 0; index < count; index += 1) {
    rows.push(tx({ date, description, amount, ...extra }));
    const [year, month, day] = date.split('-').map(Number);
    const next = new Date(Date.UTC(year!, (month ?? 1) - 1 + 1, day ?? 1));
    date = next.toISOString().slice(0, 10);
  }
  return rows;
}

function item(text: string, x: number, y: number, page = 1): PdfTextItem {
  return { str: text, transform: [1, 0, 0, 1, x, y], width: Math.max(20, text.length * 4), page };
}

describe('review regressions', () => {
  it('keeps PDF rows on separate pages apart', () => {
    const items = [
      item('01/04/2026', 10, 100, 1),
      item('NETFLIX', 80, 100, 1),
      item('649.00', 200, 100, 1),
      item('02/04/2026', 10, 100, 2),
      item('SPOTIFY', 80, 100, 2),
      item('119.00', 200, 100, 2),
    ];
    const lines = itemsToLines(items);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('NETFLIX');
    expect(lines[1]).toContain('SPOTIFY');
    expect(transactionsFromLines(lines, 'statement.pdf')).toHaveLength(2);
  });

  it('reads an HDFC PDF row by column instead of the value date or the balance', () => {
    const items = [
      item('Date', 40, 700),
      item('Narration', 140, 700),
      item('Chq./Ref.No.', 300, 700),
      item('Value Dt', 430, 700),
      item('Withdrawal Amt.', 530, 700),
      item('Deposit Amt.', 660, 700),
      item('Closing Balance', 790, 700),
      item('04/01/26', 40, 680),
      item('UPI-NETFLIX-PAYTM', 140, 680),
      item('0000412345678901', 300, 680),
      item('04/01/26', 430, 680),
      item('649.00', 530, 680),
      item('50,000.00', 790, 680),
      item('05/01/26', 40, 660),
      item('NEFT CREDIT SALARY', 140, 660),
      item('05/01/26', 430, 660),
      item('1000.00', 660, 660),
      item('51,000.00', 790, 660),
    ];
    const transactions = transactionsFromItems(items, 'hdfc.pdf');
    expect(transactions.find((row) => row.description.includes('NETFLIX'))).toMatchObject({
      amount: 649,
      direction: 'debit',
    });
    expect(transactions.find((row) => row.description.includes('SALARY'))?.direction).toBe(
      'credit',
    );
    expect(passwordWasWrong(2)).toBe(true);
    expect(passwordWasWrong(1)).toBe(false);
  });

  it('infers a headerless PDF deposit from the balance delta', () => {
    const lines = [
      '01/04/2026 BALANCE B/F 100000.00',
      '02/04/2026 UPI CREDIT 50000.00 150000.00',
      '03/04/2026 NETFLIX 649.00 149351.00',
    ];
    const transactions = transactionsFromLines(lines, 'plain.pdf');
    expect(transactions.find((row) => row.description.includes('CREDIT'))).toMatchObject({
      amount: 50000,
      direction: 'credit',
    });
    expect(transactions.find((row) => row.description.includes('NETFLIX'))).toMatchObject({
      amount: 649,
      direction: 'debit',
    });
  });

  it('reads a plain positive-charge Amex file as USD spend', () => {
    const csv = [
      'Date,Description,Amount',
      '03/15/2026,NETFLIX,15.49',
      '04/15/2026,NETFLIX,15.49',
      '05/15/2026,NETFLIX,15.49',
      '05/20/2026,PAYMENT RECEIVED,-100.00',
    ].join('\n');
    const parsed = parseStatement(csv, 'amex-plain.csv');
    expect(parsed.detection.needsMapping).toBe(false);
    expect(parsed.detection.defaultCurrency).toBe('USD');
    expect(parsed.transactions.find((row) => row.description === 'NETFLIX')).toMatchObject({
      direction: 'debit',
      currency: 'USD',
      date: '2026-03-15',
    });
    expect(parsed.transactions.find((row) => row.description.includes('PAYMENT'))?.direction).toBe(
      'credit',
    );
  });

  it('treats Amex charges as debits and Chase amounts without a dollar sign as USD', () => {
    const amex = [
      'Date,Description,Card Member,Account #,Amount',
      '03/08/2026,NETFLIX,A SAMPLE,0001,15.49',
      '04/08/2026,NETFLIX,A SAMPLE,0001,15.49',
      '05/08/2026,NETFLIX,A SAMPLE,0001,15.49',
      '05/20/2026,PAYMENT RECEIVED,A SAMPLE,0001,-100.00',
    ].join('\n');
    const parsedAmex = parseStatement(amex, 'amex.csv');
    expect(parsedAmex.detection.formatId).toBe('amex');
    expect(parsedAmex.transactions.find((row) => row.description === 'NETFLIX')).toMatchObject({
      direction: 'debit',
      currency: 'USD',
      amount: 15.49,
      date: '2026-03-08',
    });
    expect(
      parsedAmex.transactions.find((row) => row.description.includes('PAYMENT'))?.direction,
    ).toBe('credit');
    const analysis = analyze(parsedAmex.transactions, { today: '2026-06-01' });
    expect(
      analysis.subscriptions.some((sub) => sub.merchantId === 'netflix' && sub.currency === 'USD'),
    ).toBe(true);

    const chase = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '03/08/2026,03/08/2026,NETFLIX,Shopping,Sale,-15.49,',
    ].join('\n');
    const parsedChase = parseStatement(chase, 'chase.csv');
    expect(parsedChase.transactions[0]).toMatchObject({
      currency: 'USD',
      direction: 'debit',
      amount: 15.49,
    });
  });

  it('picks one date order for the column and strips trailing times', () => {
    expect(parseDate('01/01/2026 10:22', 'MDY')).toBe('2026-01-01');
    expect(parseDate('15/03/2026 23:01:05', 'DMY')).toBe('2026-03-15');
    const csv = [
      'Date,Description,Amount',
      '03/15/2026,NETFLIX,15.49',
      '04/05/2026,NETFLIX,15.49',
      '05/15/2026,NETFLIX,15.49',
      '06/05/2026,NETFLIX,15.49',
    ].join('\n');
    const parsed = parseStatement(csv, 'us.csv');
    expect(parsed.detection.needsMapping).toBe(false);
    expect(parsed.detection.mapping.dateOrder).toBe('MDY');
    expect(parsed.transactions.map((row) => row.date)).toEqual([
      '2026-03-15',
      '2026-04-05',
      '2026-05-15',
      '2026-06-05',
    ]);
    const ambiguous = [
      '04/05/2026,NETFLIX,10',
      '05/06/2026,NETFLIX,10',
      '06/04/2026,NETFLIX,10',
    ].join('\n');
    expect(
      parseStatement(`Date,Description,Amount\n${ambiguous}`, 'maybe.csv').detection.needsMapping,
    ).toBe(true);
    expect(inferDateOrder(['03/15/2026', '04/05/2026'])).toBe('MDY');
  });

  it('does not treat SIPs, EMIs, insurance, or rent as subscriptions', () => {
    const rows = [
      ...monthly('2026-01-04', 4, 5000, 'ACH D- INDIAN CLEARING CORP-ICCLGROWW'),
      ...monthly('2026-01-05', 4, 2000, 'NACH DR BSE LIMITED MF'),
      ...monthly('2026-01-06', 4, 3500, 'ACH D- BAJAJ FINANCE LTD'),
      ...monthly('2026-01-07', 4, 1800, 'NACH LIC OF INDIA PREMIUM'),
      ...monthly('2026-01-08', 4, 20000, 'NEFT-HOUSE RENT LANDLORD'),
      ...monthly('2026-01-09', 4, 15000, 'UPI-RAHUL SHARMA-OKAXIS'),
    ];
    const analysis = analyze(rows, { today: '2026-05-15' });
    const names = analysis.subscriptions.map((sub) => sub.name.toUpperCase());
    expect(names.join(' ')).not.toMatch(/GROWW|BSE|BAJAJ|LIC|RENT/);
    const rent = analysis.subscriptions.find((sub) => sub.kind === 'possible-transfer');
    expect(rent?.name).toBe('Rahul Sharma');
    expect(projectSavings(analysis, {}).activeCount).toBe(0);
    const person = analysis.subscriptions.find((sub) => sub.kind === 'possible-transfer');
    expect(projectSavings(analysis, {}, new Set([person!.id])).activeCount).toBe(1);
    const fitness = analyze(monthly('2026-03-02', 4, 2500, 'ANYTIME FITNESS INDIRANAGAR'), {
      today: '2026-07-15',
    });
    expect(fitness.subscriptions[0]?.kind).toBe('subscription');
    const cursor = analyze(monthly('2026-03-02', 4, 40, 'CURSOR AI POWERED', { currency: 'USD' }), {
      today: '2026-07-15',
    });
    expect(cursor.subscriptions[0]?.kind).toBe('subscription');
    const loan = analyze(monthly('2026-03-02', 4, 12500, 'NACH-DR-HDFC BANK LTD-LN12345'), {
      today: '2026-07-15',
    });
    expect(loan.subscriptions).toHaveLength(0);
    const zoomcar = analyze(monthly('2026-03-02', 4, 999, 'ZOOMCAR RENT SUBSCRIPTION'), {
      today: '2026-07-15',
    });
    expect(zoomcar.subscriptions[0]?.kind).toBe('subscription');
    expect(isRejectedDescriptor('ZOOMCAR RENT SUBSCRIPTION')).toBe(false);
    expect(isRejectedDescriptor('NEFT-HOUSE RENT LANDLORD')).toBe(true);
    expect(
      analysis.subscriptions.every(
        (sub) => sub.kind === 'possible-transfer' || sub.confidence === 'low',
      ),
    ).toBe(true);
  });

  it('scores delimiters across the file when the first line is a preamble', () => {
    const text = [
      'Account Name,Sample User',
      'Date;Narration;Withdrawal Amt.;Deposit Amt.',
      '04/01/2026;NETFLIX;649.00;',
    ].join('\n');
    expect(detectDelimiter(text)).toBe(';');
    const parsed = parseStatement(text, 'semi.csv');
    expect(parsed.transactions[0]?.description).toContain('NETFLIX');
    expect(parsed.transactions[0]?.amount).toBe(649);
  });

  it('keeps a weekly charge as one plan', () => {
    const rows: Transaction[] = [];
    let date = '2026-03-01';
    for (let index = 0; index < 6; index += 1) {
      rows.push(tx({ date, description: 'NETFLIX', amount: 300 }));
      date = addDaysISO(date, 7);
    }
    const analysis = analyze(rows, { today: '2026-05-01' });
    const plans = analysis.subscriptions.filter((sub) => sub.merchantId === 'netflix');
    expect(plans).toHaveLength(1);
    expect(plans[0]?.cadence).toBe('weekly');
    expect(plans[0]?.annualized).toBe(300 * 52);
    expect(analysis.duplicates.filter((group) => group.merchantId === 'netflix')).toHaveLength(0);
  });

  it('flags identical charges inside one file and only drops them across files', () => {
    const rows = [
      tx({ date: '2026-03-09', description: 'SPOTIFY', amount: 119 }),
      tx({ date: '2026-03-09', description: 'SPOTIFY', amount: 119 }),
      ...monthly('2026-04-09', 3, 119, 'SPOTIFY'),
    ];
    const analysis = analyze(rows, { today: '2026-08-01' });
    expect(analysis.duplicatePostings).toEqual([
      expect.objectContaining({ description: 'SPOTIFY', amount: 119, count: 2 }),
    ]);
    expect(analysis.subscriptions.filter((sub) => sub.merchantId === 'spotify')).toHaveLength(1);
  });

  it('flags a small relative price hike and the same service in two currencies', () => {
    const rows = [
      ...monthly('2026-01-04', 2, 119, 'SPOTIFY'),
      ...monthly('2026-03-04', 2, 129, 'SPOTIFY'),
      ...monthly('2026-03-04', 3, 15.49, 'NETFLIX', { currency: 'USD' }),
      ...monthly('2026-03-06', 3, 649, 'NETFLIX'),
    ];
    const analysis = analyze(rows, { today: '2026-06-15' });
    expect(
      analysis.subscriptions.find((sub) => sub.merchantId === 'spotify')?.priceHike,
    ).toMatchObject({
      from: 119,
      to: 129,
    });
    const netflix = analysis.duplicates.find(
      (group) => group.kind === 'merchant' && group.merchantId === 'netflix',
    );
    expect(netflix?.subscriptionIds).toHaveLength(2);
  });

  it('keeps a decision id stable when the price changes', () => {
    const early = analyze(monthly('2026-01-04', 4, 199, 'NETFLIX'), { today: '2026-06-01' });
    const later = analyze(
      [...monthly('2026-01-04', 4, 199, 'NETFLIX'), ...monthly('2026-05-04', 2, 249, 'NETFLIX')],
      { today: '2026-08-01' },
    );
    expect(later.subscriptions[0]?.id).toBe(early.subscriptions[0]?.id);
    expect(later.subscriptions[0]?.id.includes('|224|')).toBe(false);
  });

  it('strips UPI handles from unknown payees and only shares known merchant names', () => {
    expect(unknownName('UPI-Rahul Sharma-rahulsharma@okaxis')).toBe('Rahul Sharma');
    expect(unknownName('UPI-Anil Kumar-Anil')).toBe('Anil Kumar');
    expect(matchMerchant('APPLE.COM/BILL')?.id).toBe('apple-bill');
    expect(matchMerchant('GOOGLE *YOUTUBE*')?.id).toBe('youtube-premium');
    expect(matchMerchant('AIRTEL PAYMENTS BANK')).toBeNull();
    const analysis = analyze(
      [
        ...monthly('2026-03-09', 4, 15000, 'UPI-RAHUL SHARMA-OKAXIS'),
        ...monthly('2026-03-04', 4, 649, 'NETFLIX'),
      ],
      { today: '2026-07-15' },
    );
    const shared = buildSharePayload(analysis, {}, true);
    expect(shared.merchants?.map((merchant) => merchant.name)).toEqual(['Netflix']);
    expect(JSON.stringify(shared)).not.toContain('Rahul');
  });

  it('runs the worker job on a statement and keeps the newest rows past the cap', () => {
    const parsed = applyScanRequest({
      op: 'parse',
      text: 'Date,Narration,Withdrawal Amt.,Deposit Amt.\n04/01/2026,NETFLIX,649.00,\n',
      source: 'job.csv',
    });
    expect(parsed.analysis).toBeUndefined();
    expect(parsed.parsed?.transactions[0]?.description).toContain('NETFLIX');
    const lines = ['Date,Narration,Withdrawal Amt.,Deposit Amt.'];
    for (let index = 0; index < LIMITS.maxRows + 1; index += 1) {
      lines.push(`01/01/2020,OLD ${index},1.00,`);
    }
    lines.push('04/06/2026,NETFLIX,649.00,');
    const capped = parseStatement(lines.join('\n'), 'huge.csv');
    expect(capped.warnings.some((warning) => /most recent/i.test(warning))).toBe(true);
    expect(capped.transactions.some((row) => row.description === 'NETFLIX')).toBe(true);
    expect(capped.transactions.some((row) => row.description === 'OLD 0')).toBe(false);
  });
});
