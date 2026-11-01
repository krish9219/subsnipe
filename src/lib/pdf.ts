import { parseDate } from './dates';
import { LIMITS } from './csv';
import { parseMoneyCell } from './money';
import type { Transaction } from './model';

export type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

export function itemsToLines(items: PdfTextItem[]): string[] {
  const positioned = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? Math.max(item.str.length * 4, 4),
    }));
  const lines: { y: number; parts: typeof positioned }[] = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (line) line.parts.push(item);
    else lines.push({ y: item.y, parts: [item] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((line) => {
      const parts = [...line.parts].sort((a, b) => a.x - b.x);
      let text = '';
      let cursor = -Infinity;
      for (const part of parts) {
        const gap = part.x - cursor;
        if (text && gap > 1.5) text += ' ';
        text += part.str;
        cursor = part.x + part.width;
      }
      return text.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

const DATE_RE =
  /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{2,4}|[A-Za-z]{3,9}[ -]\d{1,2},?[ -]\d{2,4})/;

const MONEY_RE =
  /(?:₹|rs\.?|inr|usd|eur|gbp|\$|€|£)?\s*\(?-?\d[\d,]*(?:\.\d{1,2})?\)?(?:\s*(?:dr|cr))?/gi;

export function transactionsFromLines(
  lines: string[],
  source: string,
  defaultCurrency = 'INR',
): Transaction[] {
  const transactions: Transaction[] = [];
  lines.forEach((line, index) => {
    if (/narration|withdrawal amt|transaction date/i.test(line) && /date/i.test(line)) return;
    const dateMatch = DATE_RE.exec(line);
    if (!dateMatch || dateMatch.index == null) return;
    const date = parseDate(dateMatch[1] ?? '', 'auto');
    if (!date) return;
    const rest = line.slice(dateMatch.index + dateMatch[0].length);
    const tokens = [...rest.matchAll(MONEY_RE)]
      .map((match) => ({
        raw: match[0],
        index: match.index ?? 0,
        parsed: parseMoneyCell(match[0]),
      }))
      .filter(
        (token) => token.parsed && token.parsed.amount > 0 && token.parsed.amount < 10_000_000,
      );
    if (tokens.length === 0) return;
    let chosen = tokens[0]!;
    if (tokens.length >= 2) {
      const last = tokens[tokens.length - 1]!;
      const earlier =
        tokens.slice(0, -1).find((token) => (token.parsed?.amount ?? 0) > 0) ?? tokens[0]!;
      chosen = last.parsed!.amount >= earlier.parsed!.amount ? earlier : last;
    }
    const description = rest
      .slice(0, chosen.index)
      .replace(/[|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (description.length < 2 || !chosen.parsed) return;
    transactions.push({
      id: `${source}:pdf:${index}`,
      date,
      description,
      amount: chosen.parsed.amount,
      direction: chosen.parsed.suffix === 'cr' ? 'credit' : 'debit',
      currency: chosen.parsed.currency ?? defaultCurrency,
      source,
    });
  });
  return transactions;
}

export type PdfExtract = {
  transactions: Transaction[];
  warnings: string[];
  error: string | null;
};

export async function extractPdf(data: ArrayBuffer, source: string): Promise<PdfExtract> {
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
    const doc = await task.promise;
    const pageCount = Math.min(doc.numPages, 25);
    const warnings: string[] = [];
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
        });
      }
    }
    await doc.cleanup();
    await task.destroy();
    const transactions = transactionsFromLines(itemsToLines(items), source);
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
        error: 'This PDF is password protected. Export a CSV instead.',
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
