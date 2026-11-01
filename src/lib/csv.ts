import bankFormats from '../data/bankFormats.json';
import { inferDateOrder, parseDate, type DateOrder } from './dates';
import { parseMoneyCell } from './money';
import type { Direction, Transaction } from './model';

export const LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxRows: 100_000,
};

type Field =
  | 'date'
  | 'description'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'direction'
  | 'currency'
  | 'balance'
  | 'reference';

const FIELDS: Field[] = [
  'date',
  'description',
  'debit',
  'credit',
  'amount',
  'direction',
  'currency',
  'balance',
  'reference',
];

export type SignConvention = 'auto' | 'debit-negative' | 'debit-positive';

type BankFormat = {
  id: string;
  name: string;
  country: string;
  dateOrder: DateOrder;
  matchHeaders: string[];
  aliases: Partial<Record<Field, string[]>>;
  defaultCurrency?: string;
  signConvention?: SignConvention;
};

const FORMATS = bankFormats as BankFormat[];

const BASE_ALIASES: Record<Field, string[]> = {
  date: [
    'date',
    'txn date',
    'transaction date',
    'trans date',
    'value date',
    'value dt',
    'posted date',
    'posting date',
    'post date',
    'tran date',
    'post date',
  ],
  description: [
    'narration',
    'description',
    'particulars',
    'remarks',
    'transaction remarks',
    'transaction details',
    'transaction description',
    'details',
    'narrative',
    'memo',
  ],
  debit: [
    'withdrawal amt',
    'withdrawal amount',
    'withdrawal amount inr',
    'withdrawal',
    'withdrawals',
    'debit',
    'dr amount',
    'money out',
    'paid out',
    'outflow',
  ],
  credit: [
    'deposit amt',
    'deposit amount',
    'deposit amount inr',
    'deposit',
    'deposits',
    'credit',
    'cr amount',
    'money in',
    'inflow',
  ],
  amount: ['amount', 'transaction amount', 'amt'],
  direction: ['dr cr', 'cr dr', 'debit credit', 'credit debit', 'type', 'transaction type'],
  currency: ['currency', 'ccy', 'curr'],
  balance: [
    'closing balance',
    'balance',
    'balance inr',
    'available balance',
    'running balance',
    'bal',
  ],
  reference: [
    'chq ref no',
    'cheque no',
    'ref no',
    'reference',
    'chq no',
    'utr',
    'ref no cheque no',
  ],
};

function aliasesFor(field: Field): string[] {
  const extra = FORMATS.flatMap((format) => format.aliases[field] ?? []);
  return [...new Set([...BASE_ALIASES[field], ...extra.map(normalizeHeader)])];
}

const ALIASES: Record<Field, string[]> = {
  date: aliasesFor('date'),
  description: aliasesFor('description'),
  debit: aliasesFor('debit'),
  credit: aliasesFor('credit'),
  amount: aliasesFor('amount'),
  direction: aliasesFor('direction'),
  currency: aliasesFor('currency'),
  balance: aliasesFor('balance'),
  reference: aliasesFor('reference'),
};

export type ColumnMapping = {
  headerIndex: number;
  date: number | null;
  description: number | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  direction: number | null;
  currency: number | null;
  dateOrder: DateOrder;
  signConvention: SignConvention;
};

export type ColumnDetection = {
  headerIndex: number;
  mapping: ColumnMapping;
  formatName: string | null;
  formatId: string | null;
  needsMapping: boolean;
  headers: string[];
  defaultCurrency: string;
};

export type StatementParse = {
  transactions: Transaction[];
  detection: ColumnDetection;
  warnings: string[];
  error: string | null;
  rows: string[][];
};

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_./]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectDelimiter(text: string): string {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const counts = lines
      .map((line) => countDelimiter(line, delimiter))
      .filter((count) => count > 0);
    if (counts.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    let mode = 0;
    let modeCount = 0;
    for (const [count, times] of frequency) {
      if (times > modeCount || (times === modeCount && count > mode)) {
        mode = count;
        modeCount = times;
      }
    }
    const score = modeCount * 20 + mode;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) count += 1;
  }
  return count;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += char;
    } else if (char === '"') inQuotes = true;
    else if (char === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((current) => current.some((value) => value.length > 0));
}

function scoreHeader(cell: string, field: Field): number {
  const normalized = normalizeHeader(cell);
  if (!normalized) return 0;
  if (field === 'amount' && /(withdrawal|deposit|debit|credit|balance|\bbal\b)/.test(normalized)) {
    return 0;
  }
  const aliases = ALIASES[field];
  const exact = aliases.includes(normalized);
  if (exact && field === 'date' && /(value|post|posted)/.test(normalized)) return 0.72;
  if (exact) return 1;
  for (const alias of aliases) {
    if (alias.length >= 6 && (normalized.includes(alias) || alias.includes(normalized)))
      return 0.86;
  }
  return 0;
}

function matchFormat(header: string[]): BankFormat | null {
  const norms = new Set(header.map(normalizeHeader));
  let best: { format: BankFormat; score: number } | null = null;
  for (const format of FORMATS) {
    const needed = format.matchHeaders.map(normalizeHeader);
    if (!needed.every((headerName) => norms.has(headerName))) continue;
    if (!best || needed.length > best.score) best = { format, score: needed.length };
  }
  return best?.format ?? null;
}

function emptyMapping(headerIndex: number): ColumnMapping {
  return {
    headerIndex,
    date: null,
    description: null,
    debit: null,
    credit: null,
    amount: null,
    direction: null,
    currency: null,
    dateOrder: 'auto',
    signConvention: 'auto',
  };
}

function assignColumns(header: string[], headerIndex: number): ColumnMapping {
  const pairs: { field: Field; index: number; score: number }[] = [];
  header.forEach((cell, index) => {
    for (const field of FIELDS) {
      const score = scoreHeader(cell, field);
      if (score >= 0.75) pairs.push({ field, index, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.index - b.index);
  const usedField = new Set<Field>();
  const usedIndex = new Set<number>();
  const chosen = emptyMapping(headerIndex);
  for (const pair of pairs) {
    if (usedField.has(pair.field) || usedIndex.has(pair.index)) continue;
    usedField.add(pair.field);
    usedIndex.add(pair.index);
    if (pair.field === 'date') chosen.date = pair.index;
    if (pair.field === 'description') chosen.description = pair.index;
    if (pair.field === 'debit') chosen.debit = pair.index;
    if (pair.field === 'credit') chosen.credit = pair.index;
    if (pair.field === 'amount') chosen.amount = pair.index;
    if (pair.field === 'direction') chosen.direction = pair.index;
    if (pair.field === 'currency') chosen.currency = pair.index;
  }
  return chosen;
}

function guessFromContent(rows: string[][]): ColumnMapping {
  const width = Math.max(...rows.map((row) => row.length), 0);
  const mapping = emptyMapping(-1);
  let bestDate = { index: -1, hits: 0 };
  let bestAmount = { index: -1, hits: 0 };
  let bestText = { index: -1, score: 0 };
  for (let index = 0; index < width; index += 1) {
    let dateHits = 0;
    let amountHits = 0;
    let textScore = 0;
    for (const row of rows.slice(0, 20)) {
      const cell = row[index] ?? '';
      if (parseDate(cell, 'auto')) dateHits += 1;
      if (parseMoneyCell(cell)) amountHits += 1;
      if (cell.length > 8 && !parseMoneyCell(cell) && !parseDate(cell, 'auto'))
        textScore += cell.length;
    }
    if (dateHits > bestDate.hits) bestDate = { index, hits: dateHits };
    if (amountHits > bestAmount.hits) bestAmount = { index, hits: amountHits };
    if (textScore > bestText.score) bestText = { index, score: textScore };
  }
  if (bestDate.hits >= 2) mapping.date = bestDate.index;
  if (bestAmount.hits >= 2) mapping.amount = bestAmount.index;
  if (bestText.score > 0) mapping.description = bestText.index;
  return mapping;
}

export function detectColumns(rows: string[][]): ColumnDetection {
  let headerIndex = 0;
  let bestScore = -1;
  const scan = rows.slice(0, 40);
  scan.forEach((row, index) => {
    const strong = row.filter((cell) =>
      FIELDS.some((field) => scoreHeader(cell, field) >= 0.8),
    ).length;
    if (strong > bestScore) {
      bestScore = strong;
      headerIndex = index;
    }
  });

  if (bestScore < 2) {
    const mapping = guessFromContent(rows);
    return {
      headerIndex: -1,
      mapping,
      formatName: null,
      formatId: null,
      needsMapping: true,
      headers: (rows[0] ?? []).map((_, index) => `Column ${index + 1}`),
      defaultCurrency: 'INR',
    };
  }

  const headers = rows[headerIndex] ?? [];
  const format = matchFormat(headers);
  const mapping = assignColumns(headers, headerIndex);
  const defaultCurrency = format?.defaultCurrency ?? 'INR';
  if (format?.signConvention) mapping.signConvention = format.signConvention;
  if (format && format.dateOrder !== 'auto') mapping.dateOrder = format.dateOrder;
  const hasAmount = mapping.debit != null || mapping.credit != null || mapping.amount != null;
  let needsMapping = mapping.date == null || mapping.description == null || !hasAmount;
  if (!needsMapping && mapping.date != null && mapping.dateOrder === 'auto') {
    const samples = rows
      .slice(headerIndex + 1)
      .map((row) => row[mapping.date!] ?? '')
      .filter(Boolean)
      .slice(0, 40);
    const inferred = inferDateOrder(samples);
    const numeric = samples.some((sample) => /^\d{1,2}[-/.]\d{1,2}[-/.]/.test(sample.trim()));
    if (inferred === 'ambiguous' && numeric) needsMapping = true;
    else if (inferred !== 'ambiguous') mapping.dateOrder = inferred;
  }
  if (!needsMapping && !format) {
    const sample = rows.slice(headerIndex + 1, headerIndex + 13).filter((row) => row.some(Boolean));
    const parsed = sample.filter((row) => parseDate(row[mapping.date!] ?? '', mapping.dateOrder));
    if (sample.length >= 4 && parsed.length / sample.length < 0.5) needsMapping = true;
  }
  return {
    headerIndex,
    mapping,
    formatName: format?.name ?? null,
    formatId: format?.id ?? null,
    needsMapping,
    headers,
    defaultCurrency,
  };
}

function directionFrom(value: string): Direction | null {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return null;
  if (/^(dr|debit|withdrawal|sale|purchase|pos|money out|outflow|charge)$/.test(normalized)) {
    return 'debit';
  }
  if (/^(cr|credit|deposit|payment|refund|reversal|money in|inflow|return)$/.test(normalized)) {
    return 'credit';
  }
  if (normalized.includes('debit')) return 'debit';
  if (normalized.includes('credit')) return 'credit';
  return null;
}

function cell(row: string[], index: number | null): string {
  if (index == null) return '';
  return row[index] ?? '';
}

export function transactionsFromMapping(
  rows: string[][],
  mapping: ColumnMapping,
  source: string,
  defaultCurrency = 'INR',
): { transactions: Transaction[]; warnings: string[] } {
  const warnings: string[] = [];
  const start = mapping.headerIndex >= 0 ? mapping.headerIndex + 1 : 0;
  const allBody = rows.slice(start);
  const body =
    allBody.length > LIMITS.maxRows ? allBody.slice(allBody.length - LIMITS.maxRows) : allBody;
  if (allBody.length > LIMITS.maxRows) {
    warnings.push(`Kept the most recent ${LIMITS.maxRows.toLocaleString('en-IN')} rows.`);
  }
  const transactions: Transaction[] = [];
  let skipped = 0;
  const amountIndex = mapping.amount;
  const signed =
    amountIndex != null &&
    body.some((row) => {
      const raw = (row[amountIndex] ?? '').trim();
      const parsed = parseMoneyCell(raw);
      return Boolean(parsed && parsed.suffix === 'dr' && /^[-(]/.test(raw));
    });

  body.forEach((row, index) => {
    const date = parseDate(cell(row, mapping.date), mapping.dateOrder);
    const description = cell(row, mapping.description).replace(/\s+/g, ' ').trim();
    if (!date || !description) {
      if (row.some(Boolean)) skipped += 1;
      return;
    }
    const currencyCell = cell(row, mapping.currency).trim().toUpperCase();
    let direction: Direction | null = null;
    let amount = 0;
    let currency: string | null = isIsoCurrency(currencyCell) ? currencyCell : null;

    const debit = mapping.debit != null ? parseMoneyCell(cell(row, mapping.debit)) : null;
    const credit = mapping.credit != null ? parseMoneyCell(cell(row, mapping.credit)) : null;
    if ((debit && debit.amount > 0) || (credit && credit.amount > 0)) {
      if (
        debit &&
        debit.amount > 0 &&
        !(credit && credit.amount > 0 && credit.amount > debit.amount)
      ) {
        direction = 'debit';
        amount = debit.amount;
        currency = currency ?? debit.currency;
      } else if (credit && credit.amount > 0) {
        direction = 'credit';
        amount = credit.amount;
        currency = currency ?? credit.currency;
      }
    } else if (mapping.amount != null) {
      const parsed = parseMoneyCell(cell(row, mapping.amount));
      if (!parsed || parsed.amount === 0) {
        skipped += 1;
        return;
      }
      amount = parsed.amount;
      currency = currency ?? parsed.currency;
      const fromColumn = directionFrom(cell(row, mapping.direction));
      direction = fromColumn ?? signedDirection(parsed.suffix, mapping.signConvention, signed);
    }

    if (!direction || amount <= 0 || amount > 10_000_000) {
      skipped += 1;
      return;
    }
    transactions.push({
      id: `${source}:${index}:${date}:${amount}`,
      date,
      description,
      amount,
      direction,
      currency: currency ?? defaultCurrency,
      source,
    });
  });
  if (skipped > 0)
    warnings.push(`Skipped ${skipped} row${skipped === 1 ? '' : 's'} without a date or amount.`);
  return { transactions, warnings };
}

export function isIsoCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function signedDirection(
  suffix: 'dr' | 'cr' | null,
  convention: SignConvention,
  columnHasNegatives: boolean,
): Direction {
  if (suffix === 'cr') return 'credit';
  const negative = suffix === 'dr';
  const mode =
    convention === 'auto' ? (columnHasNegatives ? 'debit-negative' : 'debit-positive') : convention;
  if (mode === 'debit-negative') return negative ? 'debit' : 'credit';
  return negative ? 'credit' : 'debit';
}

export function parseStatement(
  text: string,
  source: string,
  override?: ColumnMapping,
  defaultCurrency = 'INR',
  delimiter?: string,
): StatementParse {
  if (!text.trim()) {
    const detection = detectColumns([]);
    return {
      transactions: [],
      detection,
      warnings: [],
      error: 'This file is empty.',
      rows: [],
    };
  }
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) {
    return {
      transactions: [],
      detection: detectColumns([]),
      warnings: [],
      error: 'No rows found. Check that this is a CSV, TSV, or text export.',
      rows,
    };
  }
  const detection = detectColumns(rows);
  const mapping = override ?? detection.mapping;
  if ((override ? false : detection.needsMapping) && !override) {
    return {
      transactions: [],
      detection,
      warnings: [],
      error: null,
      rows,
    };
  }
  const { transactions, warnings } = transactionsFromMapping(
    rows,
    mapping,
    source,
    override ? defaultCurrency : detection.defaultCurrency || defaultCurrency,
  );
  return {
    transactions,
    detection: { ...detection, mapping, needsMapping: false },
    warnings,
    error: transactions.length === 0 ? 'No transactions found with those columns.' : null,
    rows,
  };
}

export function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer);
}
