import { describe, expect, it } from 'vitest';
import { ALIAS_CASES, catalog, loadCatalog, matchMerchant, unknownName } from './merchants';

describe('merchant catalog', () => {
  it('loads unique merchants and matches the longest alias', () => {
    const list = loadCatalog();
    expect(new Set(list.map((merchant) => merchant.id)).size).toBe(list.length);
    expect(list.length).toBeGreaterThan(40);
    for (const [description, id] of ALIAS_CASES) {
      expect(matchMerchant(description, list)?.id ?? null).toBe(id);
    }
  });

  it('cleans mandate descriptors down to a merchant name', () => {
    expect(unknownName('NACH DR ACME CLOUD MANDATE 998877')).toBe('Acme Cloud');
    expect(
      catalog().some((merchant) => merchant.aliases.some((alias) => alias.trim().length < 3)),
    ).toBe(false);
  });
});
