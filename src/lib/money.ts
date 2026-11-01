/** Units of each currency per 1 USD. Static display rates, not a market feed. */
export const PER_USD: Record<string, number> = {
  USD: 1,
  INR: 84.7,
  EUR: 0.92,
  GBP: 0.76,
  AED: 3.67,
  SGD: 1.32,
  AUD: 1.52,
  CAD: 1.39,
  JPY: 152,
  CHF: 0.88,
  NZD: 1.68,
  HKD: 7.8,
  SAR: 3.75,
  QAR: 3.64,
  THB: 34,
  MYR: 4.45,
  LKR: 300,
  NPR: 135,
  BDT: 120,
};

const FLOOR: Record<string, number> = {
  INR: 15,
  USD: 1,
  EUR: 1,
  GBP: 1,
  AED: 4,
  SGD: 1,
  JPY: 100,
};

const NOISE: Record<string, number> = {
  INR: 20,
  USD: 0.99,
  EUR: 0.99,
  GBP: 0.99,
  JPY: 100,
};

export function moneyFloor(currency: string): number {
  return FLOOR[currency] ?? 1;
}

export function noiseFloor(currency: string): number {
  return NOISE[currency] ?? 0.5;
}

export function isClose(a: number, b: number, currency: string): boolean {
  const diff = Math.abs(a - b);
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return diff <= moneyFloor(currency) || diff / base <= 0.08;
}

/** A price change large enough to be a hike or drop, but still one plan. */
export function isStep(from: number, to: number, currency: string): boolean {
  if (from <= 0 || to <= 0) return false;
  if (isClose(from, to, currency)) return false;
  const ratio = to / from;
  return ratio >= 0.55 && ratio <= 2.2;
}

export function isMaterialIncrease(from: number, to: number, currency: string): boolean {
  if (to <= from || from <= 0) return false;
  const diff = to - from;
  const minimum = currency === 'JPY' ? 5 : 0.5;
  return diff / from >= 0.05 && diff >= minimum;
}

export function convert(amount: number, from: string, to: string): number | null {
  const fromRate = PER_USD[from];
  const toRate = PER_USD[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

export type ParsedMoney = {
  amount: number;
  suffix: 'dr' | 'cr' | null;
  currency: string | null;
};

export function parseMoneyCell(raw: string): ParsedMoney | null {
  let value = raw.trim();
  if (!value || value === '-' || value === '—' || value === '–') return null;

  let currency: string | null = null;
  const code =
    /\b(INR|USD|EUR|GBP|JPY|AED|SGD|AUD|CAD|CHF|NZD|HKD|SAR|QAR|THB|MYR|LKR|NPR|BDT)\b/i.exec(
      value,
    );
  if (code) {
    currency = code[1]!.toUpperCase();
    value = value.replace(code[0], ' ');
  }
  if (value.includes('₹') || /\brs\.?/i.test(value)) currency = currency ?? 'INR';
  if (value.includes('€')) currency = currency ?? 'EUR';
  if (value.includes('£')) currency = currency ?? 'GBP';
  if (value.includes('$')) currency = currency ?? 'USD';
  if (value.includes('¥')) currency = currency ?? 'JPY';
  value = value
    .replace(/[₹€£$¥]/g, ' ')
    .replace(/\brs\.?/gi, ' ')
    .trim();

  let suffix: 'dr' | 'cr' | null = null;
  const suffixMatch = /(dr|cr|debit|credit)\s*$/i.exec(value);
  if (suffixMatch) {
    suffix = /^cr|credit/i.test(suffixMatch[1]!) ? 'cr' : 'dr';
    value = value.slice(0, suffixMatch.index).trim();
  }

  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1).trim();
  }
  value = value.replace(/\s+/g, '');
  if (!value) return null;

  const numeric = normalizeNumeric(value);
  if (numeric == null || !Number.isFinite(numeric)) return null;
  if (negative && !suffix) suffix = 'dr';
  return { amount: Math.abs(numeric), suffix, currency };
}

function normalizeNumeric(value: string): number | null {
  const hasDot = value.includes('.');
  const hasComma = value.includes(',');
  let normalized = value;
  if (hasDot && hasComma) {
    if (value.lastIndexOf('.') > value.lastIndexOf(',')) normalized = value.replace(/,/g, '');
    else normalized = value.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(value) || /^\d{1,2}(,\d{2})+,\d{3}$/.test(value)) {
      normalized = value.replace(/,/g, '');
    } else if (/^\d+,\d{2}$/.test(value)) normalized = value.replace(',', '.');
    else normalized = value.replace(/,/g, '');
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

export function formatMoney(amount: number, currency: string, digits?: number): string {
  const fraction =
    digits ?? (currency === 'JPY' || Math.abs(amount - Math.round(amount)) < 0.001 ? 0 : 2);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(fraction)}`;
  }
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function annualize(
  amount: number,
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'yearly',
): number {
  if (cadence === 'weekly') return amount * 52;
  if (cadence === 'monthly') return amount * 12;
  if (cadence === 'quarterly') return amount * 4;
  return amount;
}
