import aliasCases from '../data/alias-cases.json';
import merchantData from '../data/merchants.json';
import { isCategory, type Category, type Merchant } from './model';

type MerchantInput = {
  id: string;
  name: string;
  category: string;
  color: string;
  aliases: string[];
  typicalCadence?: 'monthly' | 'quarterly' | 'yearly';
  guideId?: string;
  website?: string;
  recurringByDefault?: boolean;
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
  const tokens = normalizeText(description)
    .split(' ')
    .filter((token) => token.length > 1 && !STRIP_TOKENS.has(token) && !/^\d+$/.test(token));
  const name = tokens.slice(0, 4).join(' ');
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
