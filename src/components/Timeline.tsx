import { formatDisplayDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Decision, Subscription } from '@/lib/model';

type Event = {
  date: string;
  name: string;
  amount: number;
  currency: string;
  expected: boolean;
  color: string;
};

export function Timeline({
  subs,
  decisions,
}: {
  subs: Subscription[];
  decisions: Record<string, Decision>;
}) {
  const events: Event[] = [];
  for (const sub of subs) {
    if (decisions[sub.id] === 'ignore') continue;
    for (const charge of sub.charges) {
      events.push({
        date: charge.date,
        name: sub.name,
        amount: charge.amount,
        currency: sub.currency,
        expected: false,
        color: sub.color,
      });
    }
    if (!sub.possiblyEnded) {
      events.push({
        date: sub.nextDate,
        name: sub.name,
        amount: sub.latestAmount,
        currency: sub.currency,
        expected: true,
        color: sub.color,
      });
    }
  }
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const key = event.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const months = [...groups.keys()].sort().reverse();
  if (months.length === 0) {
    return <p className="text-sm text-muted">No charges to put on a timeline yet.</p>;
  }
  return (
    <ol className="space-y-8">
      {months.map((month) => {
        const items = (groups.get(month) ?? []).sort((a, b) => b.date.localeCompare(a.date));
        const label = formatDisplayDate(`${month}-01`).replace(/^\d+\s/, '');
        return (
          <li key={month}>
            <h3 className="font-serif text-2xl tracking-tight">{label}</h3>
            <ul className="mt-3 space-y-2 border-l border-line pl-4">
              {items.map((item, index) => (
                <li
                  key={`${item.name}-${item.date}-${index}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: item.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {item.name}
                      <span className="text-muted"> · {formatDisplayDate(item.date)}</span>
                      {item.expected ? <span className="text-marigold"> · expected</span> : null}
                    </span>
                  </span>
                  <span className="num shrink-0">{formatMoney(item.amount, item.currency)}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
