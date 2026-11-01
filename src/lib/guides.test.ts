import { describe, expect, it } from 'vitest';
import { loadGuides } from './guides';
import { catalog } from './merchants';

describe('cancel guides', () => {
  it('covers at least 25 services with official links and steps', () => {
    const guides = loadGuides();
    expect(guides.length).toBeGreaterThanOrEqual(25);
    const keys = new Set(
      catalog().flatMap((merchant) =>
        [merchant.id, merchant.guideId].filter((value): value is string => Boolean(value)),
      ),
    );
    for (const guide of guides) {
      expect(keys.has(guide.merchantId), guide.id).toBe(true);
      expect(guide.officialUrl.startsWith('https://')).toBe(true);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.summary.length).toBeGreaterThan(40);
      expect(guide.note).toBeTruthy();
    }
  });
});
