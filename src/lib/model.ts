export const CATEGORIES = [
  'streaming',
  'music',
  'telecom',
  'cloud',
  'productivity',
  'ai',
  'news',
  'fitness',
  'food',
  'gaming',
  'shopping',
  'finance',
  'education',
  'security',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type Direction = 'debit' | 'credit';

export type Decision = 'keep' | 'cancel' | 'unsure' | 'ignore';

export type Confidence = 'high' | 'medium' | 'low';

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: Direction;
  currency: string;
  source: string;
};

export type Merchant = {
  id: string;
  name: string;
  category: Category;
  color: string;
  aliases: string[];
  excludeAliases: string[];
  recurringByDefault: boolean;
  typicalCadence: Cadence;
  guideId: string | null;
  website: string | null;
};

export type ChargePoint = {
  date: string;
  amount: number;
  description: string;
};

export type PriceHike = {
  from: number;
  to: number;
  percent: number;
  on: string;
};

export type TrialConversion = {
  trialAmount: number;
  paidAmount: number;
  trialDate: string;
  paidDate: string;
};

export type Subscription = {
  id: string;
  merchantId: string;
  name: string;
  category: Category;
  known: boolean;
  currency: string;
  cadence: Cadence;
  confidence: Confidence;
  assumedCadence: boolean;
  charges: ChargePoint[];
  latestAmount: number;
  annualized: number;
  annualizedDisplay: number | null;
  firstDate: string;
  lastDate: string;
  nextDate: string;
  possiblyEnded: boolean;
  priceHike: PriceHike | null;
  trial: TrialConversion | null;
  autopay: boolean;
  guideId: string | null;
  color: string;
  /** Recurring person-to-person transfers stay out of the yearly headline. */
  kind: 'subscription' | 'possible-transfer';
};

export type FeeKind = 'forex' | 'tax' | 'other';

export type FeeFinding = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  kind: FeeKind;
  subscriptionId: string | null;
};

export type DuplicateGroup = {
  id: string;
  kind: 'category' | 'merchant';
  severity: 'likely' | 'possible';
  category: Category;
  merchantId: string | null;
  name: string | null;
  subscriptionIds: string[];
  keepCheapestSavings: number | null;
};

export type DuplicatePosting = {
  date: string;
  description: string;
  amount: number;
  currency: string;
  count: number;
  source: string;
};

export type Analysis = {
  subscriptions: Subscription[];
  duplicates: DuplicateGroup[];
  fees: FeeFinding[];
  duplicatePostings: DuplicatePosting[];
  displayCurrency: string;
  fxApproximate: boolean;
  transactionCount: number;
  debitCount: number;
  subscriptionChargeCount: number;
  ignoredCount: number;
};

export type CategoryMeta = {
  label: string;
  overlap: 'likely' | 'possible' | 'none';
};

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  streaming: { label: 'Streaming', overlap: 'likely' },
  music: { label: 'Music', overlap: 'likely' },
  telecom: { label: 'Telecom', overlap: 'possible' },
  cloud: { label: 'Cloud', overlap: 'likely' },
  productivity: { label: 'Productivity', overlap: 'likely' },
  ai: { label: 'AI', overlap: 'likely' },
  news: { label: 'News', overlap: 'likely' },
  fitness: { label: 'Fitness', overlap: 'likely' },
  food: { label: 'Food memberships', overlap: 'likely' },
  gaming: { label: 'Gaming', overlap: 'likely' },
  shopping: { label: 'Shopping', overlap: 'none' },
  finance: { label: 'Finance', overlap: 'none' },
  education: { label: 'Education', overlap: 'possible' },
  security: { label: 'Security', overlap: 'possible' },
  other: { label: 'Other', overlap: 'none' },
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
