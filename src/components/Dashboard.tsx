import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { GuideDialog, PrivacyDialog, ShareDialog, WipeDialog } from '@/components/Dialogs';
import { Dropzone } from '@/components/Dropzone';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { Timeline } from '@/components/Timeline';
import { Button } from '@/components/chrome';
import { projectSavings } from '@/lib/engine';
import { CATEGORY_META, type Category } from '@/lib/model';
import { formatMoney } from '@/lib/money';
import { useWorkspace } from '@/state/workspace';

function useCount(value: number): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce) {
      fromRef.current = value;
      return;
    }
    const origin = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - (1 - t) ** 3;
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduce, value]);

  return reduce ? value : shown;
}

export function Dashboard() {
  const workspace = useWorkspace();
  const {
    analysis,
    decisions,
    setDecision,
    files,
    removeFile,
    remap,
    loadSample,
    saveLocally,
    persist,
  } = workspace;
  const savings = projectSavings(analysis, decisions);
  const shown = useCount(savings.before);
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [shareOpen, setShareOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [guideId, setGuideId] = useState<string | null>(null);

  const active = analysis.subscriptions.filter(
    (sub) => !sub.possiblyEnded && decisions[sub.id] !== 'ignore',
  );
  const quiet = analysis.subscriptions.filter(
    (sub) => sub.possiblyEnded && decisions[sub.id] !== 'ignore',
  );
  const ignored = analysis.subscriptions.filter((sub) => decisions[sub.id] === 'ignore');
  const filtered = useMemo(
    () =>
      active.filter((sub) => {
        if (category !== 'all' && sub.category !== category) return false;
        if (query && !sub.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [active, category, query],
  );

  const categories = [...new Set(active.map((sub) => sub.category))];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <section className="panel overflow-hidden p-5 sm:p-8" aria-labelledby="spend-heading">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Annualized from this scan
            </p>
            <h1
              id="spend-heading"
              className="mt-2 font-serif text-5xl tracking-tight sm:text-7xl"
              aria-live="polite"
            >
              <span className="num">{formatMoney(shown, analysis.displayCurrency, 0)}</span>
            </h1>
            <p className="mt-2 text-muted">
              a year across {savings.activeCount} subscription{savings.activeCount === 1 ? '' : 's'}
              {analysis.fxApproximate ? ' · other currencies use approximate rates' : ''}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Potential savings
            </p>
            {savings.cancelCount === 0 ? (
              <p className="mt-2 text-sm leading-relaxed">
                Mark Cancel on anything you do not want. The yearly total updates as you go.
              </p>
            ) : (
              <>
                <p className="mt-2 font-serif text-3xl tracking-tight num">
                  {formatMoney(savings.before, analysis.displayCurrency, 0)}
                  <span className="text-muted"> → </span>
                  {formatMoney(savings.after, analysis.displayCurrency, 0)}
                </p>
                <p className="mt-1 text-sm text-good">
                  {formatMoney(savings.savings, analysis.displayCurrency)} a year if those{' '}
                  {savings.cancelCount} stop renewing.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Stat
          label="Price hikes"
          value={analysis.subscriptions.filter((sub) => sub.priceHike).length}
        />
        <Stat
          label="Trials that converted"
          value={analysis.subscriptions.filter((sub) => sub.trial).length}
        />
        <Stat label="Overlaps" value={analysis.duplicates.length} />
        <Stat label="Fees spotted" value={analysis.fees.length} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {files.map((file) => (
          <span
            key={file.id}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-elev px-3 py-1"
          >
            <span>
              {file.name}
              <span className="text-muted"> · {file.count}</span>
              {file.formatName ? <span className="text-muted"> · {file.formatName}</span> : null}
            </span>
            {file.rows && (
              <button
                type="button"
                className="text-accent underline-offset-2 hover:underline"
                onClick={() => remap(file.id)}
              >
                Columns
              </button>
            )}
            <button
              type="button"
              className="text-muted underline-offset-2 hover:text-ink hover:underline"
              onClick={() => removeFile(file.id)}
              aria-label={`Remove ${file.name}`}
            >
              Remove
            </button>
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Dropzone compact />
        <Button variant="quiet" size="sm" onClick={loadSample}>
          Add sample
        </Button>
        <Button variant="quiet" size="sm" onClick={() => void saveLocally()}>
          {persist ? 'Saved on this device' : 'Save on this device'}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setShareOpen(true)}>
          Share summary
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPrivacyOpen(true)}>
          Privacy
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWipeOpen(true)}>
          Wipe everything
        </Button>
      </div>

      {analysis.duplicates.length > 0 && (
        <section className="mt-8" aria-labelledby="overlap-heading">
          <h2 id="overlap-heading" className="font-serif text-2xl tracking-tight">
            Overlaps
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {analysis.duplicates.map((group) => {
              const names = [
                ...new Set(
                  group.subscriptionIds
                    .map((id) => {
                      const sub = analysis.subscriptions.find((item) => item.id === id);
                      if (!sub) return null;
                      if (group.kind === 'merchant') {
                        return `${sub.name} ${formatMoney(sub.latestAmount, sub.currency)}`;
                      }
                      return sub.name;
                    })
                    .filter((name): name is string => Boolean(name)),
                ),
              ].join(', ');
              const title =
                group.kind === 'merchant'
                  ? `${group.name} shows up more than once`
                  : `${CATEGORY_META[group.category].label} plans that overlap`;
              return (
                <li key={group.id} className="rounded-2xl border border-line p-4">
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-muted">{names}</p>
                  {group.keepCheapestSavings != null && group.keepCheapestSavings > 0 && (
                    <p className="mt-2 text-sm">
                      Keeping only the cheapest frees about{' '}
                      {formatMoney(
                        group.keepCheapestSavings,
                        analysis.displayCurrency,
                        analysis.displayCurrency === 'INR' || analysis.displayCurrency === 'JPY'
                          ? 0
                          : undefined,
                      )}{' '}
                      a year.
                    </p>
                  )}
                  {group.severity === 'possible' && (
                    <p className="mt-2 text-xs text-muted">
                      This overlap is common. Two phone plans can both be real.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {analysis.fees.length > 0 && (
        <section className="mt-8" aria-labelledby="fee-heading">
          <h2 id="fee-heading" className="font-serif text-2xl tracking-tight">
            Fees in this statement
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {analysis.fees.map((fee) => {
              const linked = analysis.subscriptions.find((sub) => sub.id === fee.subscriptionId);
              return (
                <li
                  key={fee.id}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    {fee.description}
                    <span className="text-muted">
                      {' '}
                      · {fee.kind}
                      {linked ? ` · near ${linked.name}` : ''}
                    </span>
                  </span>
                  <span className="num">{formatMoney(fee.amount, fee.currency)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Result view"
          className="inline-flex rounded-full border border-line p-1"
        >
          {(['list', 'timeline'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`rounded-full px-4 py-1.5 text-sm ${view === id ? 'bg-ink text-bg' : 'text-muted'}`}
              onClick={() => setView(id)}
            >
              {id === 'list' ? 'List' : 'Timeline'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="search-subs">
            Search subscriptions
          </label>
          <input
            id="search-subs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="field w-40"
          />
          <select
            aria-label="Filter by category"
            className="field w-auto"
            value={category}
            onChange={(event) => setCategory(event.target.value as 'all' | Category)}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_META[item].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {view === 'timeline' ? (
        <div className="mt-6" role="tabpanel">
          <Timeline subs={filtered} decisions={decisions} />
        </div>
      ) : (
        <div className="mt-6 space-y-3" role="tabpanel">
          {filtered.length === 0 && (
            <p className="text-sm text-muted">Nothing matches that filter.</p>
          )}
          {filtered.map((sub, index) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              index={index}
              decision={decisions[sub.id] ?? 'unsure'}
              onDecision={(decision) => setDecision(sub.id, decision)}
              onGuide={() => setGuideId(sub.guideId ?? 'missing')}
            />
          ))}
        </div>
      )}

      {quiet.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted">
            No charge lately ({quiet.length})
          </summary>
          <div className="mt-3 space-y-3">
            {quiet.map((sub, index) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                index={index}
                decision={decisions[sub.id] ?? 'unsure'}
                onDecision={(decision) => setDecision(sub.id, decision)}
                onGuide={() => setGuideId(sub.guideId ?? 'missing')}
              />
            ))}
          </div>
        </details>
      )}

      {ignored.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">
            Dismissed ({ignored.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {ignored.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-3">
                <span>{sub.name}</span>
                <button
                  type="button"
                  className="text-accent"
                  onClick={() => setDecision(sub.id, 'unsure')}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Read {analysis.transactionCount} transactions. {analysis.subscriptionChargeCount} charges
        sit on subscriptions. The rest look like one-offs, transfers, or income. This is a
        heuristic, not advice — a loan EMI or rent can look recurring, and a single month of history
        is a weaker read.
      </p>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <WipeDialog open={wipeOpen} onClose={() => setWipeOpen(false)} />
      <GuideDialog guideId={guideId} onClose={() => setGuideId(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-line bg-elev px-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span> <span className="num font-medium">{value}</span>
    </div>
  );
}
