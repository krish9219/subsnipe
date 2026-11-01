import { describe, expect, it } from 'vitest';
import { addMonthsISO } from './dates';
import { analyze, projectSavings } from './engine';
import type { Transaction } from './model';

let seq = 0;

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'date' | 'description' | 'amount'>,
): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    direction: 'debit',
    currency: 'INR',
    source: 'test',
    ...partial,
  };
}

function series(
  start: string,
  count: number,
  step: number,
  amount: number | ((index: number) => number),
  description: string,
  currency = 'INR',
): Transaction[] {
  const rows: Transaction[] = [];
  let date = start;
  for (let index = 0; index < count; index += 1) {
    rows.push(
      tx({
        date,
        description,
        amount: typeof amount === 'function' ? amount(index) : amount,
        currency,
      }),
    );
    date = addMonthsISO(date, step);
  }
  return rows;
}

describe('detection engine', () => {
  it('finds a monthly subscription and a price hike', () => {
    const analysis = analyze(
      series('2026-03-04', 8, 1, (index) => (index < 4 ? 199 : 249), 'UPI-NETFLIX-PAYTM'),
      { today: '2026-11-01' },
    );
    const netflix = analysis.subscriptions.find((sub) => sub.merchantId === 'netflix');
    expect(netflix).toBeTruthy();
    expect(netflix?.cadence).toBe('monthly');
    expect(netflix?.latestAmount).toBe(249);
    expect(netflix?.annualized).toBe(249 * 12);
    expect(netflix?.priceHike?.from).toBe(199);
    expect(netflix?.priceHike?.to).toBe(249);
    expect(netflix?.confidence).toBe('high');
    expect(netflix?.possiblyEnded).toBe(false);
    expect(netflix && netflix.nextDate > '2026-11-01').toBe(true);
  });

  it('keeps two interleaved Netflix plans apart', () => {
    const rows = [
      ...series('2026-01-04', 6, 1, 199, 'NETFLIX MOBILE'),
      ...series('2026-01-06', 6, 1, 649, 'NETFLIX COM PREMIUM'),
    ];
    const analysis = analyze(rows, { today: '2026-07-01' });
    const plans = analysis.subscriptions.filter(
      (sub) => sub.merchantId === 'netflix' && !sub.possiblyEnded,
    );
    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.latestAmount).sort((a, b) => a - b)).toEqual([199, 649]);
    expect(
      analysis.duplicates.some(
        (group) => group.kind === 'merchant' && group.merchantId === 'netflix',
      ),
    ).toBe(true);
  });

  it('flags duplicate music services and streaming overlap', () => {
    const analysis = analyze(
      [
        ...series('2026-01-09', 4, 1, 119, 'SPOTIFY'),
        ...series('2026-01-12', 4, 1, 99, 'YOUTUBE MUSIC'),
        ...series('2026-01-04', 4, 1, 649, 'NETFLIX'),
        ...series('2026-01-05', 4, 1, 299, 'JIOHOTSTAR'),
      ],
      { today: '2026-05-01' },
    );
    const music = analysis.duplicates.find(
      (group) => group.kind === 'category' && group.category === 'music',
    );
    const streaming = analysis.duplicates.find(
      (group) => group.kind === 'category' && group.category === 'streaming',
    );
    expect(music?.subscriptionIds.length).toBe(2);
    expect(streaming && streaming.subscriptionIds.length >= 2).toBe(true);
    expect(music?.keepCheapestSavings).toBeGreaterThan(0);
  });

  it('spots a free trial that became a paid plan', () => {
    const analysis = analyze(
      [
        tx({ date: '2026-07-06', description: 'SONYLIV FREE TRIAL', amount: 2 }),
        ...series('2026-07-20', 3, 1, 299, 'SONYLIV PREMIUM'),
      ],
      { today: '2026-11-01' },
    );
    const sony = analysis.subscriptions.find((sub) => sub.merchantId === 'sonyliv');
    expect(sony?.trial).toMatchObject({ trialAmount: 2, paidAmount: 299 });
    expect(sony?.charges.every((charge) => charge.amount === 299)).toBe(true);
  });

  it('does not treat one-off spends, salary, or ATM withdrawals as subscriptions', () => {
    const analysis = analyze(
      [
        tx({ date: '2026-01-03', description: 'UPI-SWIGGY ORDER-FOOD', amount: 420 }),
        tx({ date: '2026-02-18', description: 'UPI-SWIGGY ORDER-FOOD', amount: 90 }),
        tx({ date: '2026-04-02', description: 'UPI-SWIGGY ORDER-FOOD', amount: 640 }),
        tx({ date: '2026-03-11', description: 'AMAZON MARKETPLACE BLR', amount: 1849 }),
        tx({
          date: '2026-03-17',
          description: 'AMAZON MARKETPLACE REFUND',
          amount: 1849,
          direction: 'credit',
        }),
        tx({
          date: '2026-05-01',
          description: 'NEFT SALARY ACME',
          amount: 140000,
          direction: 'credit',
        }),
        tx({ date: '2026-05-02', description: 'ATM CASH WDL', amount: 4000 }),
        tx({ date: '2026-01-08', description: 'UPI-CAFE COFFEE DAY', amount: 80 }),
        tx({ date: '2026-01-15', description: 'UPI-CAFE COFFEE DAY', amount: 240 }),
        tx({ date: '2026-01-22', description: 'UPI-CAFE COFFEE DAY', amount: 65 }),
        tx({ date: '2026-01-29', description: 'UPI-CAFE COFFEE DAY', amount: 310 }),
      ],
      { today: '2026-06-01' },
    );
    expect(analysis.subscriptions).toHaveLength(0);
  });

  it('requires repeated evidence for unknown merchants, with a lower bar for mandates', () => {
    const once = analyze(
      [tx({ date: '2026-01-01', description: 'UPI-ACME WIDGET', amount: 499 })],
      {
        today: '2026-06-01',
      },
    );
    expect(once.subscriptions).toHaveLength(0);

    const pair = analyze(series('2026-01-25', 2, 1, 499, 'ACME WIDGET STORE'), {
      today: '2026-06-01',
    });
    expect(pair.subscriptions).toHaveLength(0);

    const mandated = analyze(series('2026-01-25', 2, 1, 499, 'NACH DR ACME CLOUD MANDATE'), {
      today: '2026-06-01',
    });
    expect(mandated.subscriptions).toHaveLength(1);
    expect(mandated.subscriptions[0]?.known).toBe(false);

    const steady = analyze(series('2026-01-25', 4, 1, 499, 'ACME CLOUD HOSTING'), {
      today: '2026-06-01',
    });
    expect(steady.subscriptions).toHaveLength(1);
    expect(steady.subscriptions[0]?.cadence).toBe('monthly');
  });

  it('accepts a single charge only for a known subscription merchant', () => {
    const analysis = analyze([tx({ date: '2026-10-04', description: 'NETFLIX', amount: 649 })], {
      today: '2026-11-01',
    });
    expect(analysis.subscriptions).toHaveLength(1);
    expect(analysis.subscriptions[0]?.confidence).toBe('low');
    expect(analysis.subscriptions[0]?.assumedCadence).toBe(true);
  });

  it('detects quarterly and yearly cadences', () => {
    const analysis = analyze(
      [
        ...series('2025-01-08', 4, 3, 54.99, 'ADOBE CREATIVE CLOUD', 'USD'),
        ...series('2024-10-15', 2, 12, 1499, 'AMAZON PRIME MEMBERSHIP'),
      ],
      { today: '2026-02-01' },
    );
    expect(analysis.subscriptions.find((sub) => sub.merchantId === 'adobe')?.cadence).toBe(
      'quarterly',
    );
    expect(
      analysis.subscriptions.find((sub) => sub.merchantId === 'adobe')?.annualized,
    ).toBeCloseTo(54.99 * 4);
    expect(analysis.subscriptions.find((sub) => sub.merchantId === 'amazon-prime')?.cadence).toBe(
      'yearly',
    );
    expect(
      analysis.subscriptions.find((sub) => sub.merchantId === 'amazon-prime')?.annualized,
    ).toBe(1499);
  });

  it('links forex fees and keeps them out of the subscription list', () => {
    const analysis = analyze(
      [
        ...series('2026-01-16', 4, 1, 20, 'OPENAI *CHATGPT SUBSCR', 'USD'),
        ...series('2026-01-04', 4, 1, 649, 'NETFLIX'),
        tx({ date: '2026-02-16', description: 'FOREX MARKUP FEE', amount: 53.4 }),
        tx({ date: '2026-02-16', description: 'GST ON FOREX MARKUP', amount: 9.61 }),
        tx({ date: '2026-03-02', description: 'CONVENIENCE FEE', amount: 15 }),
      ],
      { today: '2026-05-01' },
    );
    expect(analysis.subscriptions.some((sub) => /forex|convenience/i.test(sub.name))).toBe(false);
    expect(analysis.fees).toHaveLength(3);
    const markup = analysis.fees.find((fee) => fee.description.includes('FOREX MARKUP'));
    expect(markup?.kind).toBe('forex');
    expect(markup?.subscriptionId).toBeTruthy();
    expect(analysis.fees.find((fee) => fee.description.includes('GST'))?.kind).toBe('tax');
    expect(analysis.fxApproximate).toBe(true);
    expect(analysis.displayCurrency).toBe('INR');
  });

  it('drops a refunded charge and marks a long-quiet series as possibly ended', () => {
    const rows = series('2025-01-04', 4, 1, 649, 'NETFLIX');
    rows.push(
      tx({ date: '2025-03-06', description: 'NETFLIX REFUND', amount: 649, direction: 'credit' }),
    );
    const analysis = analyze(rows, { today: '2026-11-01' });
    const netflix = analysis.subscriptions.find((sub) => sub.merchantId === 'netflix');
    expect(netflix?.charges.some((charge) => charge.date === '2025-03-04')).toBe(false);
    expect(netflix?.possiblyEnded).toBe(true);
    const savings = projectSavings(analysis, {});
    expect(savings.activeCount).toBe(0);
  });

  it('turns cancel decisions into a before and after', () => {
    const analysis = analyze(
      [
        ...series('2026-01-04', 4, 1, 649, 'NETFLIX'),
        ...series('2026-01-09', 4, 1, 119, 'SPOTIFY'),
      ],
      { today: '2026-05-01' },
    );
    const spotify = analysis.subscriptions.find((sub) => sub.merchantId === 'spotify');
    const savings = projectSavings(analysis, { [spotify!.id]: 'cancel' });
    expect(savings.before).toBe(649 * 12 + 119 * 12);
    expect(savings.savings).toBe(119 * 12);
    expect(savings.after).toBe(649 * 12);
    const ignored = projectSavings(analysis, { [spotify!.id]: 'ignore' });
    expect(ignored.before).toBe(649 * 12);
    expect(ignored.activeCount).toBe(1);
  });

  it('does not call fx noise a price hike', () => {
    const analysis = analyze(
      series('2026-01-16', 4, 1, (index) => 1784 + index, 'NETFLIX'),
      {
        today: '2026-06-01',
      },
    );
    expect(analysis.subscriptions[0]?.priceHike).toBeNull();
  });
});
