import { applyScanRequest, type ScanRequest } from '../lib/scanJob';

type Envelope = ScanRequest & { id: number };

self.onmessage = (event: MessageEvent<Envelope>) => {
  const { id, ...request } = event.data;
  try {
    const result = applyScanRequest(request);
    self.postMessage({ id, ok: true, ...result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Scan failed',
    });
  }
};
