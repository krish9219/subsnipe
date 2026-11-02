import { ShieldCheck, Sparkles, TimerReset, Waypoints } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/chrome';
import { Dropzone } from '@/components/Dropzone';
import { useWorkspace } from '@/state/workspace';

const findings = [
  {
    title: 'Recurring charges',
    copy: 'Monthly, quarterly, and yearly patterns, with room for a late debit or a rupee of jitter.',
  },
  {
    title: 'Trials that flipped',
    copy: 'A ₹2 or $1 authorization followed by the real price is called out, not buried.',
  },
  {
    title: 'Quiet price hikes',
    copy: 'When the same plan steps up and stays up, you see the old price and the new one.',
  },
  {
    title: 'Duplicate plans',
    copy: 'Two music apps, or the same OTT billed twice, land in one overlap.',
  },
  {
    title: 'Forex and markup',
    copy: 'Markup, cross-border, and GST-on-forex lines are separated from the subscription itself.',
  },
  {
    title: 'A way out',
    copy: 'Cancel guides for popular services, with the official page and the UPI mandate gotcha.',
  },
];

export function Landing({ onPrivacy }: { onPrivacy: () => void }) {
  const { loadSample } = useWorkspace();
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]"
      >
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-elev px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            On this device only
          </p>
          <h1 className="max-w-xl font-serif text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            Snipe the subscriptions you <span className="italic text-marigold">forgot</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Drop a bank or card statement. SubSnipe lists recurring charges, free trials that became
            bills, price hikes, duplicate plans, and forex markups. Built for Indian statements
            first — UPI autopay, NACH, Netflix, JioHotstar, Airtel — and it still reads a Chase CSV.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={loadSample}>Try the sample statement</Button>
            <Button variant="quiet" onClick={onPrivacy}>
              Privacy promise
            </Button>
          </div>
        </div>
        <aside className="panel p-4 sm:p-5" aria-label="What a result looks like">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Synthetic preview
          </p>
          <p className="mt-3 font-serif text-4xl tracking-tight num">₹48,240</p>
          <p className="text-sm text-muted">a year, across 11 subscriptions</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between gap-3 border-t border-line pt-2">
              <span>Netflix mobile</span>
              <span className="num text-muted">₹199 → ₹249</span>
            </li>
            <li className="flex justify-between gap-3 border-t border-line pt-2">
              <span>SonyLIV trial</span>
              <span className="num text-muted">₹2 → ₹299</span>
            </li>
            <li className="flex justify-between gap-3 border-t border-line pt-2">
              <span>Forex markup</span>
              <span className="num text-muted">beside ChatGPT</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">
            Illustrative copy. The sample button loads a fake statement so you can see the real
            screens without your own data.
          </p>
        </aside>
      </motion.div>

      <div className="mt-10">
        <Dropzone />
      </div>

      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ['No account', 'There is no SubSnipe server and no analytics call.'],
          ['Optional save', 'IndexedDB on this browser, with a wipe-everything control.'],
          ['Works offline', 'After the first load, the app shell is cached as a PWA.'],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-2xl border border-line px-4 py-3">
            <dt className="font-medium">{title}</dt>
            <dd className="mt-1 text-sm text-muted">{copy}</dd>
          </div>
        ))}
      </dl>

      <section id="how" className="mt-16">
        <h2 className="font-serif text-3xl tracking-tight">How a scan works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Waypoints,
              title: 'Read locally',
              copy: 'Columns are detected, or you map them. Dates, narrations, and amounts stay in the tab.',
            },
            {
              icon: Sparkles,
              title: 'Match and measure',
              copy: 'A community merchant list normalizes descriptors. Repeating charges become a cadence, a hike, or a duplicate.',
            },
            {
              icon: TimerReset,
              title: 'Decide',
              copy: 'Keep, cancel, or leave it unsure. The yearly total shows what cancelling would return.',
            },
          ].map((step) => (
            <li key={step.title} className="panel p-5">
              <step.icon className="h-5 w-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-3xl tracking-tight">What it looks for</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {findings.map((item) => (
            <li key={item.title} className="rounded-2xl border border-line p-5">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.copy}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
