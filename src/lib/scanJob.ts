import { parseStatement, type ColumnMapping, type StatementParse } from './csv';
import { analyze } from './engine';
import type { Analysis, Transaction } from './model';

export type ScanRequest =
  | {
      op: 'parse';
      text: string;
      source: string;
      delimiter?: string;
      mapping?: ColumnMapping;
      currency?: string;
    }
  | { op: 'analyze'; transactions: Transaction[]; today: string };

export function applyScanRequest(request: ScanRequest): {
  parsed?: StatementParse;
  analysis?: Analysis;
} {
  if (request.op === 'parse') {
    return {
      parsed: parseStatement(
        request.text,
        request.source,
        request.mapping,
        request.currency ?? 'INR',
        request.delimiter,
      ),
    };
  }
  return { analysis: analyze(request.transactions, { today: request.today }) };
}
