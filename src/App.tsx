import { useState } from 'react';
import { MappingDialog, PrivacyDialog } from '@/components/Dialogs';
import { Dashboard } from '@/components/Dashboard';
import { Landing } from '@/components/Landing';
import { ThemeToggle, Wordmark } from '@/components/chrome';
import { DEMO, REPO } from '@/lib/links';
import { useWorkspace } from '@/state/workspace';

export default function App() {
  const { transactions, hydrated, banners, dismissBanner, mapJob } = useWorkspace();
  const [privacy, setPrivacy] = useState(false);
  const scanning = transactions.length > 0;

  return (
    <div id="top" className="min-h-dvh">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="rounded-full" aria-label="SubSnipe home">
            <Wordmark />
          </a>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-line bg-elev px-3 py-1.5 text-xs font-medium"
              onClick={() => setPrivacy(true)}
            >
              On-device
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {banners.length > 0 && (
        <ul className="mx-auto mt-4 max-w-6xl space-y-2 px-4 sm:px-6">
          {banners.map((banner) => (
            <li
              key={banner.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-elev px-4 py-3 text-sm"
            >
              <span>{banner.text}</span>
              <button type="button" className="text-muted" onClick={() => dismissBanner(banner.id)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
      <main id="main">
        {!hydrated ? (
          <p className="px-4 py-16 text-sm text-muted">Opening local storage…</p>
        ) : scanning ? (
          <Dashboard />
        ) : (
          <Landing onPrivacy={() => setPrivacy(true)} />
        )}
      </main>
      <footer className="border-t border-line px-4 py-8 text-sm text-muted sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>SubSnipe v1 · statements stay in the browser.</p>
          <p className="flex flex-wrap gap-4">
            <a className="hover:text-ink" href={DEMO}>
              Live demo
            </a>
            <a className="hover:text-ink" href={REPO}>
              Source
            </a>
            <a className="hover:text-ink" href={`${REPO}/blob/main/LICENSE`}>
              MIT
            </a>
          </p>
        </div>
      </footer>
      <PrivacyDialog open={privacy} onClose={() => setPrivacy(false)} />
      <MappingDialog job={mapJob} />
    </div>
  );
}
