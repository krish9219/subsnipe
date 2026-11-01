import { cadenceLabel } from './dates';
import { projectSavings } from './engine';
import { CATEGORY_META, type Analysis, type Decision } from './model';

export type ShareMerchant = {
  name: string;
  detail: string;
};

export type SharePayload = {
  annualized: number;
  currency: string;
  count: number;
  savings: number;
  categories: { label: string; count: number }[];
  merchants: ShareMerchant[] | null;
  approximate: boolean;
};

export function buildSharePayload(
  analysis: Analysis,
  decisions: Record<string, Decision>,
  includeMerchants: boolean,
): SharePayload {
  const savings = projectSavings(analysis, decisions);
  const active = analysis.subscriptions.filter(
    (sub) => !sub.possiblyEnded && decisions[sub.id] !== 'ignore',
  );
  const counts = new Map<string, number>();
  for (const sub of active) {
    const label = CATEGORY_META[sub.category].label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return {
    annualized: savings.before,
    currency: analysis.displayCurrency,
    count: savings.activeCount,
    savings: savings.savings,
    categories,
    approximate: analysis.fxApproximate,
    merchants: includeMerchants
      ? active.slice(0, 8).map((sub) => ({
          name: sub.name,
          detail: `${cadenceLabel(sub.cadence)}`,
        }))
      : null,
  };
}
