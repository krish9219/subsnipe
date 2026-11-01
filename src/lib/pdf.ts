import { parseDate } from './dates';
import { LIMITS, normalizeHeader } from './csv';
import { parseMoneyCell } from './money';
import type { Transaction } from './model';

export type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  page?: number;
};

type Cell = { x: number; text: string; width: number };
type PdfRow = { y: number; cells: Cell[] };
type ColumnRole =
  'date' | 'description' | 'debit' | 'credit' | 'balance' | 'reference' | 'valueDate';

export function itemsToLines(items: PdfTextItem[]): string[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const page = item.page ?? 0;
    byPage.set(page, [...(byPage.get(page) ?? []), item]);
  }
  return [...byPage.keys()]
    .sort((a, b) => a - b)
    .flatMap((page) => linesOnPage(byPage.get(page) ?? []));
}

function linesOnPage(items: PdfTextItem[]): string[] {
  return rowsOnPage(items).map((row) =>
    [...row.cells]
      .sort((a, b) => a.x - b.x)
      .map((cell) => cell.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function rowsOnPage(items: PdfTextItem[]): PdfRow[] {
  const rows: PdfRow[] = [];
  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const width = item.width ?? Math.max(text.length * 4, 4);
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    const cell = { x, text, width };
    if (row) row.cells.push(cell);
    else rows.push({ y, cells: [cell] });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

function roleForHeader(text: string): ColumnRole | null {
  const normalized = normalizeHeader(text);
  if (!normalized) return null;
  if (/value/.test(normalized) && /date|dt/.test(normalized)) return 'valueDate';
  if (/^(date|transaction date|txn date|tran date)$/.test(normalized)) return 'date';
  if (/narration|description|particulars|remarks/.test(normalized)) return 'description';
  if (/withdrawal|debit/.test(normalized)) return 'debit';
  if (/deposit/.test(normalized) || (normalized === 'credit' && !normalized.includes('debit')))
    return 'credit';
  if (/balance|^bal$/.test(normalized)) return 'balance';
  if (/chq|cheque|ref/.test(normalized)) return 'reference';
  return null;
}

function headerColumns(row: PdfRow): { role: ColumnRole; x: number }[] | null {
  const columns = row.cells
    .map((cell) => ({ role: roleForHeader(cell.text), x: cell.x }))
    .filter((column): column is { role: ColumnRole; x: number } => column.role != null);
  if (!columns.some((column) => column.role === 'date')) return null;
  if (
    !columns.some(
      (column) =>
        column.role === 'description' || column.role === 'debit' || column.role === 'credit',
    )
  ) {
    return null;
  }
  return columns;
}

function nearestRole(x: number, columns: { role: ColumnRole; x: number }[]): ColumnRole {
  let best = columns[0]!;
  let bestDistance = Math.abs(x - best.x);
  for (const column of columns) {
    const distance = Math.abs(x - column.x);
    if (distance < bestDistance) {
      best = column;
      bestDistance = distance;
    }
  }
  return best.role;
}

function isReferenceToken(token: string): boolean {
  const digits = token.replace(/\D/g, '');
  return digits.length >= 8 && !/[.,]/.test(token);
}

function isDateToken(token: string): boolean {
  return parseDate(token, 'auto') != null;
}

type DraftLine = {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  suffix: 'dr' | 'cr' | null;
  currency: string | null;
  anchor: boolean;
};

function draftFromLine(line: string): DraftLine | null {
  if (/narration|withdrawal amt|transaction date/i.test(line) && /date/i.test(line)) return null;
  const parts = line.split(/\s+/).filter(Boolean);
  const dateIndex = parts.findIndex((part) => isDateToken(part));
  if (dateIndex < 0) return null;
  const date = parseDate(parts[dateIndex] ?? '', 'auto');
  if (!date) return null;
  const rest = parts.slice(dateIndex + 1);
  const descriptionParts: string[] = [];
  const amounts: { amount: number; suffix: 'dr' | 'cr' | null; currency: string | null }[] = [];
  for (const part of rest) {
    if (isDateToken(part) || isReferenceToken(part)) continue;
    const parsed = parseMoneyCell(part);
    const looksLikeMoney = parsed && /[.,₹$€£]|[A-Z]{3}|\d+\.\d/.test(part);
    if (parsed && looksLikeMoney && parsed.amount > 0 && parsed.amount < 10_000_000)
      amounts.push(parsed);
    else if (amounts.length === 0) descriptionParts.push(part);
  }
  if (amounts.length === 0) return null;
  const description = descriptionParts.join(' ').trim();
  const anchor =
    amounts.length === 1 && /\b(balance|b\/f|opening|brought forward)\b/i.test(description);
  const chosen =
    amounts.length >= 2 && amounts[amounts.length - 1]!.amount >= amounts[0]!.amount
      ? amounts[0]!
      : amounts[amounts.length - 1]!;
  const balance =
    amounts.length >= 2 ? amounts[amounts.length - 1]!.amount : anchor ? amounts[0]!.amount : null;
  if (!anchor && description.length < 2) return null;
  return {
    date,
    description,
    amount: chosen.amount,
    balance,
    suffix: chosen.suffix,
    currency: chosen.currency,
    anchor,
  };
}

function directionFromBalance(
  previous: number | null,
  balance: number | null,
  amount: number,
  suffix: 'dr' | 'cr' | null,
): 'debit' | 'credit' {
  if (suffix === 'cr') return 'credit';
  if (previous != null && balance != null) {
    const delta = balance - previous;
    const gap = Math.abs(Math.abs(delta) - amount);
    if (gap <= 1 || gap / Math.max(amount, 1) <= 0.02) return delta >= 0 ? 'credit' : 'debit';
  }
  return 'debit';
}

export function transactionsFromLines(
  lines: string[],
  source: string,
  defaultCurrency = 'INR',
): Transaction[] {
  const drafts = lines
    .map((line) => draftFromLine(line))
    .filter((line): line is DraftLine => line != null);
  const transactions: Transaction[] = [];
  let previous: number | null = null;
  drafts.forEach((draft, index) => {
    if (draft.anchor) {
      if (draft.balance != null) previous = draft.balance;
      return;
    }
    const direction = directionFromBalance(previous, draft.balance, draft.amount, draft.suffix);
    if (draft.balance != null) previous = draft.balance;
    transactions.push({
      id: `${source}:pdf:${index}:${draft.date}`,
      date: draft.date,
      description: draft.description,
      amount: draft.amount,
      direction,
      currency: draft.currency ?? defaultCurrency,
      source,
    });
  });
  return transactions;
}

export function transactionsFromItems(
  items: PdfTextItem[],
  source: string,
  defaultCurrency = 'INR',
): Transaction[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items)
    byPage.set(item.page ?? 0, [...(byPage.get(item.page ?? 0) ?? []), item]);
  const transactions: Transaction[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const rows = rowsOnPage(byPage.get(page) ?? []);
    const headerIndex = rows.findIndex((row) => headerColumns(row));
    const columns = headerIndex >= 0 ? headerColumns(rows[headerIndex]!) : null;
    if (!columns) {
      transactions.push(
        ...transactionsFromLines(linesOnPage(byPage.get(page) ?? []), source, defaultCurrency),
      );
      continue;
    }
    rows.forEach((row, index) => {
      if (index === headerIndex) return;
      const buckets = new Map<ColumnRole, string[]>();
      for (const cell of row.cells) {
        const role = nearestRole(cell.x, columns);
        buckets.set(role, [...(buckets.get(role) ?? []), cell.text]);
      }
      const date =
        parseDate((buckets.get('date') ?? []).join(' '), 'DMY') ??
        parseDate((buckets.get('date') ?? []).join(' '), 'auto');
      const description = (buckets.get('description') ?? []).join(' ').replace(/\s+/g, ' ').trim();
      const debit = parseMoneyCell((buckets.get('debit') ?? []).join(' '));
      const credit = parseMoneyCell((buckets.get('credit') ?? []).join(' '));
      if (!date || description.length < 2) return;
      const direction =
        debit && debit.amount > 0 ? 'debit' : credit && credit.amount > 0 ? 'credit' : null;
      const parsed = direction === 'debit' ? debit : credit;
      if (!direction || !parsed || parsed.amount <= 0) return;
      transactions.push({
        id: `${source}:pdf:${page}:${index}`,
        date,
        description,
        amount: parsed.amount,
        direction,
        currency: parsed.currency ?? defaultCurrency,
        source,
      });
    });
  }
  return transactions;
}

export type PdfPasswordPrompt = (wrong: boolean) => Promise<string | null>;

export function passwordWasWrong(reason: number): boolean {
  return reason === 2;
}

export type PdfExtract = {
  transactions: Transaction[];
  warnings: string[];
  error: string | null;
};

export async function extractPdf(
  data: ArrayBuffer,
  source: string,
  askPassword?: PdfPasswordPrompt,
): Promise<PdfExtract> {
  if (data.byteLength > LIMITS.maxBytes) {
    return {
      transactions: [],
      warnings: [],
      error: 'That PDF is over 15 MB. Export a CSV instead.',
    };
  }
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data));
    const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, verbosity: 0 });
    task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
      if (!askPassword) {
        void task.destroy();
        return;
      }
      void askPassword(passwordWasWrong(reason)).then((password) => {
        if (password) updatePassword(password);
        else void task.destroy();
      });
    };
    const doc = await task.promise;
    const pageCount = Math.min(doc.numPages, 25);
    const warnings = ['PDF import is in beta. A CSV export is more reliable.'];
    if (doc.numPages > 25) warnings.push('Only the first 25 pages were read.');
    const items: PdfTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        items.push({
          str: item.str,
          transform: item.transform,
          width: item.width,
          height: item.height,
          page: pageNumber,
        });
      }
    }
    await doc.cleanup();
    await task.destroy();
    const transactions = transactionsFromItems(items, source);
    if (transactions.length === 0) {
      return {
        transactions: [],
        warnings,
        error:
          'No transactions found in this PDF. Scans and unusual layouts need a CSV export — SubSnipe only reads text embedded in the file.',
      };
    }
    return { transactions, warnings, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF read failed';
    if (/password/i.test(message)) {
      return {
        transactions: [],
        warnings: [],
        error: 'This PDF needs a password, and none was provided.',
      };
    }
    return {
      transactions: [],
      warnings: [],
      error:
        'Could not read this PDF. Export a CSV from your bank if it is a scan or a statement image.',
    };
  }
}
