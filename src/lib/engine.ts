import { classifyGap, daysBetween, projectNext, todayISO } from './dates';
import {
  annualize,
  convert,
  isClose,
  isMaterialIncrease,
  isStep,
  median,
  noiseFloor,
  PER_USD,
} from './money';
import { catalog, matchMerchant, normalizeText, slug, unknownName } from './merchants';
import {
  CATEGORY_META,
  type Analysis,
  type Cadence,
  type Category,
  type Decision,
  type DuplicateGroup,
  type FeeFinding,
  type FeeKind,
  type Merchant,
  type Subscription,
  type Transaction,
} from './model';

export type AnalyzeOptions = {
  today?: string;
  catalog?: Merchant[];
};

type Group = {
  merchant: Merchant | null;
  merchantId: string;
  name: string;
  category: Category;
  currency: string;
  color: string;
  guideId: string | null;
  debits: Transaction[];
  credits: Transaction[];
  autopay: boolean;
};

const REJECT_RE =
  /\b(EMI|LOAN|REPAYMENT|MUTUAL FUNDS?|ZERODHA|GROWW|UPSTOX|SIP|RD INSTALL|RECURRING DEPOSIT|ATM|CASH WDL|CASH WITHDRAW\w*|SALARY|PAYROLL|INTEREST(?:\s+CREDIT)?|DIVIDEND)\b/i;

const AUTOPAY_RE =
  /\b(AUTOPAY|AUTO[\s-]?PAY|MANDATE|NACH|STANDING INSTRUCTION|RECURRING PAYMENT)\b/i;

const FEE_RE =
  /\b(?:FOREX|FX MARKUP|FX MARGIN|FX FEE|FOREIGN CURRENCY|FOREIGN TXN(?: FEE)?|FOREIGN TRANSACTION(?: FEE)?|INTL TXN FEE|INTL FEE|INTERNATIONAL TXN FEE|INTERNATIONAL TRANSACTION FEE|CROSS[\s-]?BORDER(?: FEE)?|DYNAMIC CURRENCY|DCC|CURRENCY CONVERSION(?: FEE)?|MARKUP FEE|GST ON (?:FOREX|FX)|FCY FEE|CONVENIENCE FEE|PLATFORM FEE|PROCESSING FEE|CONVERSION FEE)\b/i;

export function isRejectedDescriptor(description: string): boolean {
  return REJECT_RE.test(description);
}

export function isAutopay(description: string): boolean {
  return AUTOPAY_RE.test(description);
}

export function isFeeDescription(description: string): boolean {
  return FEE_RE.test(description);
}

function samePosting(a: string, b: string): boolean {
  const clean = (value: string) =>
    normalizeText(value)
      .replace(/\b\d+\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return clean(a) === clean(b);
}

function feeKind(description: string): FeeKind {
  if (/GST ON/i.test(description)) return 'tax';
  if (
    /FOREX|FX |FOREIGN|INTL|INTERNATIONAL|CROSS[\s-]?BORDER|DCC|FCY|CURRENCY CONVERSION|MARKUP/i.test(
      description,
    )
  ) {
    return 'forex';
  }
  return 'other';
}

function periodDays(cadence: Cadence): number {
  if (cadence === 'monthly') return 30;
  if (cadence === 'quarterly') return 91;
  return 365;
}

export function inferCadence(dates: string[]): Cadence | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort();
  const kinds: Cadence[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const kind = classifyGap(daysBetween(sorted[i - 1]!, sorted[i]!));
    if (!kind) return null;
    kinds.push(kind === 'monthly-skip' ? 'monthly' : kind);
  }
  const first = kinds[0];
  if (!first || kinds.some((kind) => kind !== first)) return null;
  return first;
}

function amountsLookRecurring(amounts: number[], currency: string): boolean {
  if (amounts.length < 2) return true;
  let steps = 0;
  for (let i = 1; i < amounts.length; i += 1) {
    const previous = amounts[i - 1]!;
    const current = amounts[i]!;
    if (isClose(previous, current, currency)) continue;
    if (isStep(previous, current, currency)) {
      steps += 1;
      if (steps > 2) return false;
      continue;
    }
    return false;
  }
  return true;
}

function suppressDoublePosts(debits: Transaction[]): Transaction[] {
  const sorted = [...debits].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  const kept: Transaction[] = [];
  for (const debit of sorted) {
    const duplicate = kept.some(
      (existing) =>
        samePosting(existing.description, debit.description) &&
        isClose(existing.amount, debit.amount, debit.currency) &&
        Math.abs(daysBetween(existing.date, debit.date)) <= 2,
    );
    if (!duplicate) kept.push(debit);
  }
  return kept;
}

function applyRefunds(debits: Transaction[], credits: Transaction[]): Transaction[] {
  const pool = [...credits];
  const kept: Transaction[] = [];
  for (const debit of debits) {
    const index = pool.findIndex(
      (credit) =>
        Math.abs(daysBetween(credit.date, debit.date)) <= 21 &&
        isClose(credit.amount, debit.amount, debit.currency),
    );
    if (index >= 0) pool.splice(index, 1);
    else kept.push(debit);
  }
  return kept;
}

function buildTracks(debits: Transaction[]): Transaction[][] {
  const sorted = [...debits].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  const tracks: Transaction[][] = [];
  for (const debit of sorted) {
    let best: { index: number; score: number } | null = null;
    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index]!;
      const last = track[track.length - 1]!;
      const gap = daysBetween(last.date, debit.date);
      const kind = classifyGap(gap);
      if (!kind) continue;
      if (track.length >= 2) {
        const established = inferCadence(track.map((charge) => charge.date));
        const normalized = kind === 'monthly-skip' ? 'monthly' : kind;
        if (established && normalized !== established) continue;
      }
      const close = isClose(last.amount, debit.amount, debit.currency);
      if (kind === 'monthly-skip' && !close) continue;
      const step = isStep(last.amount, debit.amount, debit.currency);
      if (!close && !step) continue;
      const closerTrack = tracks.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          isClose(other[other.length - 1]!.amount, debit.amount, debit.currency),
      );
      if (!close && closerTrack) continue;
      const score =
        (close ? 3 : 1) - Math.abs(debit.amount - last.amount) / Math.max(last.amount, 1);
      if (!best || score > best.score) best = { index, score };
    }
    if (best) tracks[best.index]!.push(debit);
    else tracks.push([debit]);
  }
  return tracks;
}

function detectHike(charges: Transaction[]): Subscription['priceHike'] {
  let hike: Subscription['priceHike'] = null;
  for (let i = 1; i < charges.length; i += 1) {
    const current = charges[i]!;
    const previous = charges[i - 1]!;
    if (!isMaterialIncrease(previous.amount, current.amount, current.currency)) continue;
    const after = charges.slice(i);
    if (!after.every((charge) => isClose(charge.amount, current.amount, current.currency)))
      continue;
    const from = median(charges.slice(0, i).map((charge) => charge.amount));
    if (!isMaterialIncrease(from, current.amount, current.currency)) continue;
    hike = {
      from,
      to: current.amount,
      percent: ((current.amount - from) / from) * 100,
      on: current.date,
    };
  }
  return hike;
}

function detectTrial(debits: Transaction[], currency: string): Subscription['trial'] {
  const sorted = [...debits].sort((a, b) => a.date.localeCompare(b.date));
  const floor = noiseFloor(currency);
  for (let i = 0; i < sorted.length; i += 1) {
    const charge = sorted[i]!;
    const trialish =
      charge.amount < floor ||
      /\b(TRIAL|INTRO|PROMOTIONAL|PROMO PERIOD)\b/i.test(charge.description);
    if (!trialish) continue;
    const next = sorted.slice(i + 1).find((candidate) => {
      const gap = daysBetween(charge.date, candidate.date);
      return gap >= 1 && gap <= 45 && candidate.amount >= Math.max(charge.amount * 3, floor);
    });
    if (!next) continue;
    return {
      trialAmount: charge.amount,
      paidAmount: next.amount,
      trialDate: charge.date,
      paidDate: next.date,
    };
  }
  return null;
}

function chooseDisplayCurrency(subs: Subscription[]): { currency: string; approximate: boolean } {
  const active = subs.filter((sub) => !sub.possiblyEnded);
  const currencies = new Set(active.map((sub) => sub.currency));
  if (currencies.size === 0) return { currency: 'INR', approximate: false };
  if (currencies.has('INR')) return { currency: 'INR', approximate: currencies.size > 1 };
  let best = active[0]!.currency;
  let bestUsd = -1;
  for (const currency of currencies) {
    const total = active
      .filter((sub) => sub.currency === currency)
      .reduce((sum, sub) => sum + (convert(sub.annualized, currency, 'USD') ?? 0), 0);
    if (total > bestUsd) {
      bestUsd = total;
      best = currency;
    }
  }
  return { currency: best, approximate: currencies.size > 1 || !PER_USD[best] };
}

function linkFees(fees: FeeFinding[], subs: Subscription[]): FeeFinding[] {
  return fees.map((fee) => {
    let best: { id: string; score: number } | null = null;
    for (const sub of subs) {
      let distance = Infinity;
      for (const charge of sub.charges) {
        distance = Math.min(distance, Math.abs(daysBetween(charge.date, fee.date)));
      }
      if (distance > 3) continue;
      const mentioned = fee.description.toUpperCase().includes(sub.name.toUpperCase()) ? -0.4 : 0;
      const score = distance + mentioned;
      if (!best || score < best.score) best = { id: sub.id, score };
    }
    return { ...fee, subscriptionId: best?.id ?? null };
  });
}

export function analyze(transactions: Transaction[], options: AnalyzeOptions = {}): Analysis {
  const today = options.today ?? todayISO();
  const list = options.catalog ?? catalog();
  const fees: FeeFinding[] = [];
  const groups = new Map<string, Group>();
  let ignoredCount = 0;
  let debitCount = 0;

  transactions.forEach((tx, index) => {
    if (tx.direction === 'debit') debitCount += 1;
    if (tx.direction === 'debit' && isFeeDescription(tx.description)) {
      fees.push({
        id: `fee-${index}-${tx.date}`,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        kind: feeKind(tx.description),
        subscriptionId: null,
      });
      return;
    }
    if (isRejectedDescriptor(tx.description)) {
      ignoredCount += 1;
      return;
    }
    const merchant = matchMerchant(tx.description, list);
    const cleaned = merchant?.name ?? unknownName(tx.description);
    if (!merchant && cleaned.length < 3) {
      ignoredCount += 1;
      return;
    }
    const merchantId = merchant?.id ?? `unknown:${slug(cleaned)}`;
    const key = `${merchantId}|${tx.currency}`;
    const group = groups.get(key) ?? {
      merchant,
      merchantId,
      name: cleaned,
      category: merchant?.category ?? 'other',
      currency: tx.currency,
      color: merchant?.color ?? '#0f5e5b',
      guideId: merchant?.guideId ?? null,
      debits: [],
      credits: [],
      autopay: false,
    };
    group.autopay = group.autopay || isAutopay(tx.description);
    if (tx.direction === 'debit') group.debits.push(tx);
    else group.credits.push(tx);
    groups.set(key, group);
  });

  const subscriptions: Subscription[] = [];

  for (const group of groups.values()) {
    const refunded = applyRefunds(group.debits, group.credits);
    const debits = suppressDoublePosts(refunded).filter(
      (debit) => debit.amount >= noiseFloor(group.currency),
    );
    const trial = detectTrial(group.debits, group.currency);
    const tracks = buildTracks(debits);
    tracks.forEach((track, trackIndex) => {
      const ordered = [...track].sort((a, b) => a.date.localeCompare(b.date));
      const amounts = ordered.map((charge) => charge.amount);
      if (!amountsLookRecurring(amounts, group.currency)) return;
      let cadence = inferCadence(ordered.map((charge) => charge.date));
      let assumedCadence = false;
      let confidence: Subscription['confidence'] = ordered.length >= 3 ? 'high' : 'medium';
      if (!cadence) {
        if (!(group.merchant?.recurringByDefault && ordered.length === 1)) return;
        cadence = group.merchant?.typicalCadence ?? 'monthly';
        assumedCadence = true;
        confidence = 'low';
      } else if (!group.merchant && ordered.length < (group.autopay ? 2 : 3)) {
        return;
      }
      const latest = ordered[ordered.length - 1]!;
      const first = ordered[0]!;
      const stale =
        daysBetween(latest.date, today) > periodDays(cadence) * 1.75 && latest.date <= today;
      const medianAmount = median(amounts);
      const id = `${group.merchantId}|${group.currency}|${cadence}|${Math.round(medianAmount)}|${trackIndex}`;
      subscriptions.push({
        id,
        merchantId: group.merchantId,
        name: group.name,
        category: group.category,
        known: Boolean(group.merchant),
        currency: group.currency,
        cadence,
        confidence,
        assumedCadence,
        charges: ordered.map((charge) => ({
          date: charge.date,
          amount: charge.amount,
          description: charge.description,
        })),
        latestAmount: latest.amount,
        annualized: annualize(latest.amount, cadence),
        annualizedDisplay: null,
        firstDate: first.date,
        lastDate: latest.date,
        nextDate: projectNext(latest.date, cadence, today),
        possiblyEnded: stale,
        priceHike: detectHike(ordered),
        trial:
          trial &&
          ordered.some(
            (charge) =>
              charge.date === trial.paidDate &&
              isClose(charge.amount, trial.paidAmount, group.currency),
          )
            ? trial
            : null,
        autopay: group.autopay,
        guideId: group.guideId,
        color: group.color,
      });
    });
  }

  markReplaced(subscriptions);

  const { currency: displayCurrency, approximate } = chooseDisplayCurrency(subscriptions);
  for (const sub of subscriptions) {
    sub.annualizedDisplay = convert(sub.annualized, sub.currency, displayCurrency);
  }

  const linkedFees = linkFees(fees, subscriptions);
  const duplicates = findDuplicates(subscriptions.filter((sub) => !sub.possiblyEnded));
  const usedCharges = subscriptions.reduce((sum, sub) => sum + sub.charges.length, 0);

  subscriptions.sort((a, b) => (b.annualizedDisplay ?? 0) - (a.annualizedDisplay ?? 0));

  return {
    subscriptions,
    duplicates,
    fees: linkedFees.sort((a, b) => b.date.localeCompare(a.date)),
    displayCurrency,
    fxApproximate: approximate,
    transactionCount: transactions.length,
    debitCount,
    subscriptionChargeCount: usedCharges,
    ignoredCount,
  };
}

function markReplaced(subscriptions: Subscription[]): void {
  const groups = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    const key = `${sub.merchantId}|${sub.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), sub]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const earlier of list) {
      const successor = list.find(
        (other) =>
          other !== earlier &&
          other.firstDate > earlier.lastDate &&
          isMaterialIncrease(earlier.latestAmount, other.latestAmount, earlier.currency),
      );
      if (!successor) continue;
      earlier.possiblyEnded = true;
      if (!successor.priceHike) {
        successor.priceHike = {
          from: earlier.latestAmount,
          to: successor.latestAmount,
          percent: ((successor.latestAmount - earlier.latestAmount) / earlier.latestAmount) * 100,
          on: successor.firstDate,
        };
      }
    }
  }
}

function findDuplicates(subscriptions: Subscription[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const byCategory = new Map<Category, Subscription[]>();
  const byMerchant = new Map<string, Subscription[]>();
  for (const sub of subscriptions) {
    byCategory.set(sub.category, [...(byCategory.get(sub.category) ?? []), sub]);
    const key = `${sub.merchantId}|${sub.currency}`;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), sub]);
  }

  for (const [category, subs] of byCategory) {
    const meta = CATEGORY_META[category];
    if (meta.overlap === 'none') continue;
    const merchants = new Set(subs.map((sub) => sub.merchantId));
    if (merchants.size < 2) continue;
    groups.push({
      id: `cat:${category}`,
      kind: 'category',
      severity: meta.overlap === 'likely' ? 'likely' : 'possible',
      category,
      merchantId: null,
      name: null,
      subscriptionIds: subs.map((sub) => sub.id),
      keepCheapestSavings: savingsIfKeepCheapest(subs),
    });
  }

  for (const [, subs] of byMerchant) {
    if (subs.length < 2) continue;
    const first = subs[0]!;
    groups.push({
      id: `merchant:${first.merchantId}:${first.currency}`,
      kind: 'merchant',
      severity: 'likely',
      category: first.category,
      merchantId: first.merchantId,
      name: first.name,
      subscriptionIds: subs.map((sub) => sub.id),
      keepCheapestSavings: savingsIfKeepCheapest(subs),
    });
  }
  return groups;
}

function savingsIfKeepCheapest(subs: Subscription[]): number | null {
  const values = subs.map((sub) => sub.annualizedDisplay);
  if (values.some((value) => value == null)) return null;
  const amounts = values as number[];
  const cheapest = Math.min(...amounts);
  return amounts.reduce((sum, amount) => sum + amount, 0) - cheapest;
}

export type Savings = {
  before: number;
  after: number;
  savings: number;
  cancelCount: number;
  activeCount: number;
  partial: boolean;
};

export function projectSavings(analysis: Analysis, decisions: Record<string, Decision>): Savings {
  const counted = analysis.subscriptions.filter(
    (sub) => !sub.possiblyEnded && decisions[sub.id] !== 'ignore',
  );
  const partial = counted.some((sub) => sub.annualizedDisplay == null);
  const before = counted.reduce((sum, sub) => sum + (sub.annualizedDisplay ?? 0), 0);
  const savings = counted
    .filter((sub) => decisions[sub.id] === 'cancel')
    .reduce((sum, sub) => sum + (sub.annualizedDisplay ?? 0), 0);
  return {
    before,
    after: Math.max(0, before - savings),
    savings,
    cancelCount: counted.filter((sub) => decisions[sub.id] === 'cancel').length,
    activeCount: counted.length,
    partial,
  };
}
