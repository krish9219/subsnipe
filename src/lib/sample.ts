import { addDaysISO, shiftMonth } from './dates';

type InrRow = { date: string; narration: string; debit?: number; credit?: number };
type UsdRow = { date: string; description: string; amount: number; type: 'Sale' | 'Payment' };

function dmy(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function mdy(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

function months(today: Date, count: number, day: number): string[] {
  const dates: string[] = [];
  for (let offset = count; offset >= 1; offset -= 1) {
    const iso = shiftMonth(today, -offset, day);
    if (iso) dates.push(iso);
  }
  return dates;
}

function renderInr(rows: InrRow[]): string {
  const header = [
    'Account Name,Sample User',
    'Account Number,XXXX0000',
    '',
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  ];
  const body = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row, index) => {
      const narration = /[",]/.test(row.narration)
        ? `"${row.narration.replace(/"/g, '""')}"`
        : row.narration;
      const debit = row.debit != null ? row.debit.toFixed(2) : '';
      const credit = row.credit != null ? row.credit.toFixed(2) : '';
      const balance = (250000 - index * 137.25).toFixed(2);
      return `${dmy(row.date)},${narration},,${dmy(row.date)},${debit},${credit},${balance}`;
    });
  return [...header, ...body].join('\n');
}

function renderUsd(rows: UsdRow[]): string {
  const header = 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo';
  const body = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const amount = `${row.type === 'Sale' ? '-' : ''}$${row.amount.toFixed(2)}`;
      return `${mdy(row.date)},${mdy(row.date)},${row.description},Shopping,${row.type},${amount},`;
    });
  return [header, ...body].join('\n');
}

export type SampleFile = { name: string; text: string };

/** Synthetic statements anchored to `today` so the demo never goes stale. */
export function buildSampleFiles(today = new Date()): SampleFile[] {
  const inr: InrRow[] = [];
  const mobile = months(today, 8, 4);
  mobile.forEach((date, index) => {
    const amount = index < mobile.length - 4 ? 199 : 249;
    inr.push({ date, narration: 'UPI-NETFLIX-MOBILE-PAYTM', debit: amount });
  });
  months(today, 8, 7).forEach((date) => {
    inr.push({ date, narration: 'NACH DR NETFLIX COM PREMIUM', debit: 649 });
  });
  months(today, 8, 9).forEach((date) => {
    inr.push({ date, narration: 'UPI-SPOTIFY INDIA-OKICICI', debit: 119 });
  });
  months(today, 8, 12).forEach((date) => {
    inr.push({ date, narration: 'UPI-YOUTUBE MUSIC-AUTOPAY', debit: 99 });
  });
  months(today, 6, 14).forEach((date) => {
    inr.push({ date, narration: 'UPI-YOUTUBE PREMIUM-GOOGLE', debit: 189 });
  });
  for (const offset of [12, 9, 6, 3]) {
    const date = shiftMonth(today, -offset, 5);
    if (date) inr.push({ date, narration: 'UPI-JIOHOTSTAR-AUTOPAY', debit: 299 });
  }
  for (const offset of [13, 1]) {
    const date = shiftMonth(today, -offset, 15);
    if (date) inr.push({ date, narration: 'AMAZON PRIME MEMBERSHIP', debit: 1499 });
  }
  months(today, 6, 2).forEach((date) => {
    inr.push({ date, narration: 'NACH-AIRTEL POSTPAID, AUTOPAY', debit: 999 });
  });
  months(today, 6, 18).forEach((date) => {
    inr.push({ date, narration: 'UPI-JIO PREPAID-MYJIO', debit: 666 });
  });
  const premium = months(today, 3, 20);
  const firstPremium = premium[0];
  if (firstPremium) {
    inr.push({
      date: addDaysISO(firstPremium, -14),
      narration: 'SONYLIV FREE TRIAL',
      debit: 2,
    });
  }
  premium.forEach((date) => inr.push({ date, narration: 'SONYLIV PREMIUM', debit: 299 }));
  months(today, 4, 22).forEach((date) => {
    inr.push({ date, narration: 'SWIGGY ONE MEMBERSHIP', debit: 149 });
  });
  months(today, 4, 25).forEach((date) => {
    inr.push({ date, narration: 'NACH DR ACME CLOUD MANDATE 998877', debit: 499 });
  });

  const forexDates = months(today, 5, 16);
  forexDates.forEach((date) => {
    inr.push({ date, narration: 'FOREX MARKUP FEE', debit: 53.4 });
    inr.push({ date, narration: 'GST ON FOREX MARKUP', debit: 9.61 });
  });

  const market = shiftMonth(today, -2, 11);
  if (market) {
    inr.push({ date: market, narration: 'AMAZON MARKETPLACE BLR', debit: 1849 });
    inr.push({ date: addDaysISO(market, 6), narration: 'AMAZON MARKETPLACE REFUND', credit: 1849 });
  }
  [
    [-1, 3, 420],
    [-1, 21, 265],
    [-2, 8, 510],
    [-3, 16, 188],
    [-4, 27, 640],
    [-5, 6, 95],
  ].forEach(([offset, day, amount]) => {
    const date = shiftMonth(today, offset!, day!);
    if (date) inr.push({ date, narration: 'UPI-SWIGGY ORDER-FOOD', debit: amount });
  });
  [0, 6, 13, 20].forEach((dayOffset, index) => {
    const anchor = shiftMonth(today, -1, 8);
    if (!anchor) return;
    inr.push({
      date: addDaysISO(anchor, dayOffset),
      narration: 'UPI-CAFE COFFEE DAY',
      debit: [80, 240, 65, 310][index],
    });
  });
  const salary = shiftMonth(today, -1, 1);
  if (salary) inr.push({ date: salary, narration: 'NEFT SALARY ACME PVT LTD', credit: 145000 });
  const atm = shiftMonth(today, -1, 19);
  if (atm) inr.push({ date: atm, narration: 'ATM CASH WDL HDFC', debit: 5000 });
  const uber = shiftMonth(today, -2, 13);
  if (uber) inr.push({ date: uber, narration: 'UPI-UBER TRIP-BLR', debit: 286 });
  const basket = shiftMonth(today, -3, 9);
  if (basket) inr.push({ date: basket, narration: 'UPI-BIGBASKET-GROCERY', debit: 1240 });

  const usd: UsdRow[] = [];
  months(today, 5, 16).forEach((date) => {
    usd.push({ date, description: 'OPENAI *CHATGPT SUBSCR', amount: 20, type: 'Sale' });
  });
  for (const offset of [9, 6, 3]) {
    const date = shiftMonth(today, -offset, 8);
    if (date) usd.push({ date, description: 'ADOBE CREATIVE CLOUD', amount: 54.99, type: 'Sale' });
  }
  months(today, 6, 21).forEach((date) => {
    usd.push({ date, description: 'APPLE ICLOUD', amount: 2.99, type: 'Sale' });
  });
  months(today, 4, 3).forEach((date) => {
    usd.push({ date, description: 'NOTION LABS INC', amount: 12, type: 'Sale' });
  });
  const payment = shiftMonth(today, -1, 28);
  if (payment)
    usd.push({
      date: payment,
      description: 'AUTOPAY PAYMENT THANK YOU',
      amount: 90,
      type: 'Payment',
    });

  return [
    { name: 'Sample HDFC savings.csv', text: renderInr(inr) },
    { name: 'Sample Chase card.csv', text: renderUsd(usd) },
  ];
}
