import { parseStatement } from '../lib/csv';
import { applyScanRequest, type ScanRequest } from '../lib/scanJob';

type SheetRequest = { op: 'sheet'; data: ArrayBuffer; source: string };
type Envelope = (ScanRequest | SheetRequest) & { id: number };

self.onmessage = (event: MessageEvent<Envelope>) => {
  const { id, ...request } = event.data;
  void (async () => {
    try {
      if (request.op === 'sheet') {
        const { spreadsheetToCsv } = await import('../lib/spreadsheet');
        const text = await spreadsheetToCsv(request.data);
        self.postMessage({ id, ok: true, text, parsed: parseStatement(text, request.source) });
        return;
      }
      self.postMessage({ id, ok: true, ...applyScanRequest(request) });
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : 'Scan failed',
      });
    }
  })();
};
