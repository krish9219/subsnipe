export type Guide = {
  id: string;
  merchantId: string;
  title: string;
  officialUrl: string;
  summary: string;
  steps: string[];
  note: string | null;
};

export function parseGuide(raw: string, fallbackId: string): Guide {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw.trim());
  if (!match) throw new Error(`Guide ${fallbackId} is missing front matter`);
  const front: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    front[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  const steps: string[] = [];
  const prose: string[] = [];
  let note: string | null = null;
  for (const line of match[2]!.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const step = /^(?:\d+)\.\s+(.*)$/.exec(trimmed);
    if (step) steps.push(step[1]!);
    else if (trimmed.startsWith('Note:')) note = trimmed.replace(/^Note:\s*/, '');
    else prose.push(trimmed);
  }
  if (!front.merchantId || !front.title || !front.officialUrl) {
    throw new Error(`Guide ${fallbackId} needs merchantId, title, and officialUrl`);
  }
  return {
    id: fallbackId,
    merchantId: front.merchantId,
    title: front.title,
    officialUrl: front.officialUrl,
    summary: prose.join(' '),
    steps,
    note,
  };
}

const modules = import.meta.glob('../../content/guides/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function fileId(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.md$/, '');
}

export function loadGuides(): Guide[] {
  return Object.entries(modules)
    .map(([path, raw]) => parseGuide(raw as string, fileId(path)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

let cached: Map<string, Guide> | null = null;

export function guidesByMerchant(): Map<string, Guide> {
  if (cached) return cached;
  cached = new Map(loadGuides().map((guide) => [guide.merchantId, guide]));
  return cached;
}

export function guideFor(guideId: string | null): Guide | null {
  if (!guideId) return null;
  return guidesByMerchant().get(guideId) ?? null;
}
