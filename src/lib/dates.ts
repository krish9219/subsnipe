import type { Cadence } from './model';

export function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}

export function dateToISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(now = new Date()): string {
  return dateToISO(now);
}

export function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type DateOrder = 'DMY' | 'MDY' | 'YMD' | 'auto';

export function toISODate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function stripDateTime(raw: string): string {
  return raw
    .trim()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i, '')
    .trim();
}

/** One order for a whole column. Ambiguous when every numeric date could be either way, or the rows disagree. */
export function inferDateOrder(values: string[]): 'DMY' | 'MDY' | 'ambiguous' {
  let dmy = 0;
  let mdy = 0;
  for (const raw of values) {
    const value = stripDateTime(raw);
    const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(value);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dmy += 1;
    else if (second > 12 && first <= 12) mdy += 1;
  }
  if (dmy > 0 && mdy > 0) return 'ambiguous';
  if (mdy > 0) return 'MDY';
  if (dmy > 0) return 'DMY';
  return 'ambiguous';
}

export function parseDate(raw: string, order: DateOrder = 'auto'): string | null {
  const value = stripDateTime(raw);
  if (!value) return null;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(value);
  if (match) return toISODate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[ -/]([A-Za-z]{3,9})[ -/](\d{2,4})$/.exec(value);
  if (match) {
    const month = MONTHS[match[2]!.slice(0, 3).toLowerCase()];
    if (!month) return null;
    return toISODate(expandYear(Number(match[3])), month, Number(match[1]));
  }

  match = /^([A-Za-z]{3,9})[ -/](\d{1,2})[ -/](\d{2,4})$/.exec(value);
  if (match) {
    const month = MONTHS[match[1]!.slice(0, 3).toLowerCase()];
    if (!month) return null;
    return toISODate(expandYear(Number(match[3])), month, Number(match[2]));
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(value);
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  const year = expandYear(Number(match[3]));
  if (order === 'YMD') return null;
  const monthFirst = order === 'MDY' || (order === 'auto' && a <= 12 && b > 12);
  const day = monthFirst ? b : a;
  const month = monthFirst ? a : b;
  return toISODate(year, month, day);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy!, (fm ?? 1) - 1, fd ?? 1);
  const end = Date.UTC(ty!, (tm ?? 1) - 1, td ?? 1);
  return Math.round((end - start) / 86_400_000);
}

export function addMonthsISO(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const zero = (month ?? 1) - 1 + months;
  const nextYear = (year ?? 1970) + Math.floor(zero / 12);
  const nextMonth = ((zero % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day ?? 1, lastDay);
  return toISODate(nextYear, nextMonth + 1, nextDay) ?? iso;
}

export function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

export function shiftMonth(today: Date, delta: number, day: number): string | null {
  const anchor = new Date(today.getFullYear(), today.getMonth() + delta, 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const result = new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(day, last));
  const iso = dateToISO(result);
  if (iso >= dateToISO(today)) return null;
  return iso;
}

export function projectNext(last: string, cadence: Cadence, today: string): string {
  if (cadence === 'weekly') {
    let next = addDaysISO(last, 7);
    let guard = 0;
    while (next <= today && guard < 520) {
      next = addDaysISO(next, 7);
      guard += 1;
    }
    return next;
  }
  const step = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12;
  let next = addMonthsISO(last, step);
  let guard = 0;
  while (next <= today && guard < 240) {
    next = addMonthsISO(next, step);
    guard += 1;
  }
  return next;
}

export function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function cadenceLabel(cadence: Cadence): string {
  if (cadence === 'weekly') return 'Weekly';
  if (cadence === 'monthly') return 'Monthly';
  if (cadence === 'quarterly') return 'Quarterly';
  return 'Yearly';
}

export function cadenceNoun(cadence: Cadence): string {
  if (cadence === 'weekly') return 'week';
  if (cadence === 'monthly') return 'month';
  if (cadence === 'quarterly') return 'quarter';
  return 'year';
}

export function classifyGap(
  days: number,
): 'weekly' | 'monthly' | 'monthly-skip' | 'quarterly' | 'yearly' | null {
  const gap = Math.abs(days);
  if (gap >= 6 && gap <= 9) return 'weekly';
  if (gap >= 26 && gap <= 35) return 'monthly';
  if (gap >= 54 && gap <= 70) return 'monthly-skip';
  if (gap >= 80 && gap <= 100) return 'quarterly';
  if (gap >= 340 && gap <= 390) return 'yearly';
  return null;
}
