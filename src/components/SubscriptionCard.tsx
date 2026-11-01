import { motion, useReducedMotion } from 'framer-motion';
import { cadenceLabel, cadenceNoun, formatDisplayDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { CATEGORY_META, type Decision, type Subscription } from '@/lib/model';
import { Initial } from '@/components/chrome';
import { cn } from '@/lib/cn';

const DECISIONS: { id: Decision; label: string }[] = [
  { id: 'keep', label: 'Keep' },
  { id: 'cancel', label: 'Cancel' },
  { id: 'unsure', label: 'Unsure' },
];

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 0.01) {
    return <span className="text-xs text-muted">Steady price</span>;
  }
  const width = 128;
  const height = 36;
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 6) + 3;
    const y = height - 4 - ((value - min) / span) * (height - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1]?.split(',') ?? ['0', '0'];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-32 text-accent"
      role="img"
      aria-label="Price history"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(' ')}
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="currentColor" />
    </svg>
  );
}

export function SubscriptionCard({
  sub,
  decision,
  onDecision,
  onGuide,
  index,
}: {
  sub: Subscription;
  decision: Decision;
  onDecision: (decision: Decision) => void;
  onGuide: () => void;
  index: number;
}) {
  const reduce = useReducedMotion();
  const noun = cadenceNoun(sub.cadence);
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03 }}
      className={cn('panel p-4 sm:p-5', decision === 'cancel' && 'opacity-80')}
      style={{ boxShadow: `inset 3px 0 0 ${sub.color}, var(--shadow)` }}
    >
      <div className="flex gap-3">
        <Initial name={sub.name} color={sub.color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium leading-tight">{sub.name}</h3>
              <p className="mt-1 text-sm text-muted">
                {CATEGORY_META[sub.category].label} · {cadenceLabel(sub.cadence)} ·{' '}
                {sub.confidence === 'high'
                  ? 'High confidence'
                  : sub.confidence === 'medium'
                    ? 'Medium confidence'
                    : 'Low confidence'}
                {sub.autopay ? ' · Autopay' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-3xl leading-none tracking-tight num">
                {formatMoney(sub.latestAmount, sub.currency)}
              </p>
              <p className="mt-1 text-xs text-muted num">
                / {noun} · {formatMoney(sub.annualized, sub.currency)}/yr
              </p>
            </div>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted">Last </dt>
              <dd className="inline">{formatDisplayDate(sub.lastDate)}</dd>
            </div>
            <div>
              <dt className="inline text-muted">Next </dt>
              <dd className="inline">
                {sub.possiblyEnded ? '—' : formatDisplayDate(sub.nextDate)}
              </dd>
            </div>
          </dl>

          {sub.priceHike && (
            <p className="mt-3 text-sm text-warn">
              Price hike {formatMoney(sub.priceHike.from, sub.currency)} →{' '}
              {formatMoney(sub.priceHike.to, sub.currency)} ({Math.round(sub.priceHike.percent)}%)
              from {formatDisplayDate(sub.priceHike.on)}.
            </p>
          )}
          {sub.trial && (
            <p className="mt-2 text-sm text-marigold">
              Trial of {formatMoney(sub.trial.trialAmount, sub.currency)} on{' '}
              {formatDisplayDate(sub.trial.trialDate)} became{' '}
              {formatMoney(sub.trial.paidAmount, sub.currency)}.
            </p>
          )}
          {sub.assumedCadence && (
            <p className="mt-2 text-sm text-muted">
              Only one charge on a known service. The cadence is assumed. Upload more months for a
              firmer read.
            </p>
          )}
          {!sub.known && (
            <p className="mt-2 text-sm text-muted">
              Not in the merchant catalog. It repeated often enough to look like a subscription.
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Sparkline values={sub.charges.map((charge) => charge.amount)} />
            <div
              role="radiogroup"
              aria-label={`Decision for ${sub.name}`}
              className="grid grid-cols-3 rounded-full border border-line p-1 text-sm"
            >
              {DECISIONS.map((option) => {
                const checked = decision === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => onDecision(option.id)}
                    onKeyDown={(event) => {
                      const order = DECISIONS.map((item) => item.id);
                      const current = order.indexOf(option.id);
                      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        onDecision(order[(current + 1) % order.length] ?? 'unsure');
                      }
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        onDecision(order[(current - 1 + order.length) % order.length] ?? 'unsure');
                      }
                    }}
                    className={cn(
                      'rounded-full px-3 py-1.5',
                      checked && option.id === 'cancel' && 'bg-bad text-white',
                      checked && option.id === 'keep' && 'bg-good text-white',
                      checked && option.id === 'unsure' && 'bg-ink text-bg',
                      !checked && 'text-muted hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <button
              type="button"
              className="font-medium text-accent underline-offset-2 hover:underline"
              onClick={onGuide}
            >
              How to cancel
            </button>
            <button
              type="button"
              className="text-muted hover:text-ink"
              onClick={() => onDecision('ignore')}
            >
              Not a subscription
            </button>
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">
              {sub.charges.length} charge{sub.charges.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 space-y-1">
              {sub.charges.map((charge) => (
                <li key={`${charge.date}-${charge.amount}`} className="flex justify-between gap-3">
                  <span className="truncate text-muted">{formatDisplayDate(charge.date)}</span>
                  <span className="num">{formatMoney(charge.amount, sub.currency)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </motion.article>
  );
}
