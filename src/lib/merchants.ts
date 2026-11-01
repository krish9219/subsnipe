import aliasCases from '../data/alias-cases.json';
import merchantData from '../data/merchants.json';
import { isCategory, type Category, type Merchant } from './model';

type MerchantInput = {
  id: string;
  name: string;
  category: string;
  color: string;
  aliases: string[];
  typicalCadence?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  guideId?: string;
  website?: string;
  recurringByDefault?: boolean;
  excludeAliases?: string[];
};

export function normalizeText(input: string): string {
  return input
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

export function loadCatalog(input: MerchantInput[] = merchantData as MerchantInput[]): Merchant[] {
  const seen = new Set<string>();
  return input.map((merchant) => {
    if (seen.has(merchant.id)) throw new Error(`Duplicate merchant id ${merchant.id}`);
    seen.add(merchant.id);
    if (!isCategory(merchant.category)) {
      throw new Error(`Unknown category ${merchant.category} on ${merchant.id}`);
    }
    return {
      id: merchant.id,
      name: merchant.name,
      category: merchant.category as Category,
      color: merchant.color,
      aliases: merchant.aliases,
      excludeAliases: merchant.excludeAliases ?? [],
      recurringByDefault: merchant.recurringByDefault ?? true,
      typicalCadence: merchant.typicalCadence ?? 'monthly',
      guideId: merchant.guideId ?? merchant.id,
      website: merchant.website ?? null,
    };
  });
}

let cached: Merchant[] | null = null;

export function catalog(): Merchant[] {
  cached ??= loadCatalog();
  return cached;
}

export function matchMerchant(description: string, list = catalog()): Merchant | null {
  const haystack = normalizeText(description);
  if (!haystack) return null;
  let best: { merchant: Merchant; length: number } | null = null;
  for (const merchant of list) {
    const blocked = merchant.excludeAliases.some((phrase) =>
      containsPhrase(haystack, normalizeText(phrase)),
    );
    if (blocked) {
      const rescued = merchant.aliases.some((alias) => {
        const phrase = normalizeText(alias);
        return (
          phrase.length >
            Math.max(...merchant.excludeAliases.map((item) => normalizeText(item).length)) &&
          containsPhrase(haystack, phrase)
        );
      });
      if (!rescued) continue;
    }
    for (const alias of merchant.aliases) {
      const phrase = normalizeText(alias);
      if (phrase.length < 3) continue;
      if (!containsPhrase(haystack, phrase)) continue;
      if (!best || phrase.length > best.length) best = { merchant, length: phrase.length };
    }
  }
  return best?.merchant ?? null;
}

const STRIP_TOKENS = new Set([
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'NACH',
  'ACH',
  'ECS',
  'SI',
  'POS',
  'ECOM',
  'VISA',
  'MASTERCARD',
  'RUPAY',
  'AUTOPAY',
  'AUTO',
  'PAY',
  'MANDATE',
  'DR',
  'CR',
  'PAYMENT',
  'REF',
  'INR',
  'USD',
  'EUR',
  'GBP',
  'OKSBI',
  'OKICICI',
  'OKHDFCBANK',
  'YBL',
  'AXL',
  'IBL',
  'PAYTM',
  'PTM',
]);

export function unknownName(description: string): string {
  const tokens = description
    .split(/[^A-Za-z0-9@]+/)
    .map((part) => part.toUpperCase())
    .filter(
      (token) =>
        token.length > 1 &&
        !token.includes('@') &&
        !STRIP_TOKENS.has(token) &&
        !/^OK[A-Z0-9]{2,}$/.test(token) &&
        !/^\d+$/.test(token),
    );
  const unique: string[] = [];
  for (const token of tokens) {
    if (unique[unique.length - 1] !== token) unique.push(token);
  }
  const withoutGlued = unique.filter((token, index, all) => {
    const rest = all.filter((_, item) => item !== index).join('');
    return token !== rest;
  });
  const name = (withoutGlued.length > 0 ? withoutGlued : unique).slice(0, 3).join(' ');
  if (!name) return '';
  return name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const ALIAS_CASES = aliasCases as [string, string | null][];
