import { useMemo, useState, type ReactNode } from 'react';
import { Button, Modal } from '@/components/chrome';
import { type ColumnMapping } from '@/lib/csv';
import { type DateOrder } from '@/lib/dates';
import { guideFor } from '@/lib/guides';
import { REPO } from '@/lib/links';
import { buildSharePayload } from '@/lib/share';
import { renderShareBlob, sharePreviewUrl } from '@/lib/shareCard';
import { useWorkspace, type MapJob } from '@/state/workspace';

const ORDERS: { id: DateOrder; label: string }[] = [
  { id: 'auto', label: 'Auto (day first when ambiguous)' },
  { id: 'DMY', label: 'Day / month / year' },
  { id: 'MDY', label: 'Month / day / year' },
  { id: 'YMD', label: 'Year / month / day' },
];

export function MappingDialog({ job }: { job: MapJob | null }) {
  if (!job) {
    return (
      <Modal open={false} title="Which columns are these?" onClose={() => undefined}>
        {null}
      </Modal>
    );
  }
  return <MappingForm key={`${job.fileId}:${job.delimiter}`} job={job} />;
}

function MappingForm({ job }: { job: MapJob }) {
  const { confirmMapping, skipMapping, mapLeft, setJobDelimiter } = useWorkspace();
  const detection = job.detection;
  const [date, setDate] = useState<number | null>(detection.mapping.date);
  const [description, setDescription] = useState<number | null>(detection.mapping.description);
  const [mode, setMode] = useState<'single' | 'split'>(
    detection.mapping.debit != null ? 'split' : 'single',
  );
  const [amount, setAmount] = useState<number | null>(detection.mapping.amount);
  const [debit, setDebit] = useState<number | null>(detection.mapping.debit);
  const [credit, setCredit] = useState<number | null>(detection.mapping.credit);
  const [direction, setDirection] = useState<number | null>(detection.mapping.direction);
  const [dateOrder, setDateOrder] = useState<DateOrder>(detection.mapping.dateOrder);
  const [currency, setCurrency] = useState(detection.defaultCurrency || 'INR');
  const [flipSigns, setFlipSigns] = useState(false);

  const headers = detection?.headers ?? [];
  const previewStart = detection && detection.headerIndex >= 0 ? detection.headerIndex + 1 : 0;
  const preview = (job?.rows ?? []).slice(previewStart, previewStart + 5);

  const ready =
    date != null &&
    description != null &&
    (mode === 'split' ? debit != null || credit != null : amount != null);

  function apply() {
    if (date == null || description == null) return;
    const base = detection.mapping.signConvention;
    const signConvention = flipSigns
      ? base === 'debit-positive'
        ? 'debit-negative'
        : 'debit-positive'
      : base;
    const mapping: ColumnMapping = {
      headerIndex: detection.headerIndex,
      date,
      description,
      debit: mode === 'split' ? debit : null,
      credit: mode === 'split' ? credit : null,
      amount: mode === 'single' ? amount : null,
      direction: mode === 'single' ? direction : null,
      currency: null,
      dateOrder,
      signConvention,
    };
    const chosen = /^[A-Z]{3}$/.test(currency) ? currency : detection.defaultCurrency || 'INR';
    confirmMapping(mapping, chosen);
  }

  return (
    <Modal open={Boolean(job)} title="Which columns are these?" onClose={skipMapping} wide>
      {job && detection && (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            {detection.formatName
              ? `${job.name} looks like ${detection.formatName}, but the columns need a check.`
              : `${job.name} did not match a known statement layout.`}{' '}
            {mapLeft > 1 ? `${mapLeft - 1} more file${mapLeft > 2 ? 's' : ''} waiting.` : ''}
          </p>
          <div className="overflow-auto rounded-xl border border-line">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-hover">
                <tr>
                  {headers.map((header, index) => (
                    <th key={`${header}-${index}`} className="px-2 py-2 font-medium">
                      {header || `Column ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index} className="border-t border-line">
                    {headers.map((_, cell) => (
                      <td key={cell} className="max-w-[12rem] truncate px-2 py-1.5">
                        {row[cell] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Select value={date} onChange={setDate} headers={headers} />
            </Field>
            <Field label="Description">
              <Select value={description} onChange={setDescription} headers={headers} />
            </Field>
            <Field label="Amount columns">
              <select
                className="field"
                value={mode}
                onChange={(event) => setMode(event.target.value as 'single' | 'split')}
              >
                <option value="single">One amount column</option>
                <option value="split">Separate debit and credit</option>
              </select>
            </Field>
            <Field label="Date order">
              <select
                className="field"
                value={dateOrder}
                onChange={(event) => setDateOrder(event.target.value as DateOrder)}
              >
                {ORDERS.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.label}
                  </option>
                ))}
              </select>
            </Field>
            {mode === 'single' ? (
              <>
                <Field label="Amount">
                  <Select value={amount ?? null} onChange={setAmount} headers={headers} />
                </Field>
                <Field label="Debit / credit marker (optional)">
                  <Select value={direction} onChange={setDirection} headers={headers} allowEmpty />
                </Field>
              </>
            ) : (
              <>
                <Field label="Debit / withdrawal">
                  <Select value={debit} onChange={setDebit} headers={headers} allowEmpty />
                </Field>
                <Field label="Credit / deposit">
                  <Select value={credit} onChange={setCredit} headers={headers} allowEmpty />
                </Field>
              </>
            )}
            <Field label="Currency when the file does not say">
              <input
                className="field"
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Delimiter">
              <select
                className="field"
                value={job.delimiter}
                onChange={(event) => setJobDelimiter(event.target.value)}
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={'\t'}>Tab</option>
                <option value="|">Pipe</option>
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={flipSigns}
              onChange={(event) => setFlipSigns(event.target.checked)}
            />
            <span>
              Flip signs. Use this when charges are positive and payments are negative, or the other
              way around.
            </span>
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={apply} disabled={!ready}>
              Use these columns
            </Button>
            <Button variant="quiet" onClick={skipMapping}>
              Skip this file
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  headers,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  headers: string[];
  allowEmpty?: boolean;
}) {
  return (
    <select
      className="field"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      {allowEmpty && <option value="">None</option>}
      {!allowEmpty && <option value="">Choose</option>}
      {headers.map((header, index) => (
        <option key={`${header}-${index}`} value={index}>
          {header || `Column ${index + 1}`}
        </option>
      ))}
    </select>
  );
}

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { analysis, decisions } = useWorkspace();
  const [include, setInclude] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payload = useMemo(
    () => buildSharePayload(analysis, decisions, include),
    [analysis, decisions, include],
  );
  const preview = open ? sharePreviewUrl(payload) : '';

  async function download() {
    try {
      const blob = await renderShareBlob(payload);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'subsnipe-summary.png';
      link.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch {
      setError('Could not export the image.');
    }
  }

  return (
    <Modal open={open} title="Share a summary" onClose={onClose} wide>
      <p className="text-sm text-muted">
        The image has no merchant names unless you opt in. It never includes narrations, account
        numbers, or individual charges.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={include}
          onChange={(event) => setInclude(event.target.checked)}
        />
        <span>Include service names. Off by default so the image stays private.</span>
      </label>
      {preview && (
        <img
          src={preview}
          alt="Preview of the summary card"
          className="mt-4 w-full rounded-xl border border-line"
        />
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-4">
        <Button onClick={() => void download()}>Download PNG</Button>
      </div>
    </Modal>
  );
}

export function GuideDialog({ guideId, onClose }: { guideId: string | null; onClose: () => void }) {
  const guide = guideFor(guideId);
  return (
    <Modal open={guideId != null} title={guide?.title ?? 'No cancel guide yet'} onClose={onClose}>
      {guide ? (
        <div className="space-y-3 text-sm leading-relaxed">
          <p>{guide.summary}</p>
          <ol className="list-decimal space-y-2 pl-5">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.note && <p className="rounded-xl bg-hover px-3 py-2 text-muted">{guide.note}</p>}
          <a
            className="inline-block font-medium text-accent"
            href={guide.officialUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open the official page
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted">
          This service is not in the guide catalog yet.{' '}
          <a
            className="font-medium text-accent"
            href={`${REPO}/issues/new?template=add_cancel_guide.yml`}
          >
            Add a cancel guide
          </a>
          .
        </p>
      )}
    </Modal>
  );
}

export function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="The privacy promise" onClose={onClose}>
      <ul className="space-y-3 text-sm leading-relaxed">
        <li>Parsing happens in this tab. There is no SubSnipe server and no upload.</li>
        <li>
          There are no analytics, ads, or third-party scripts. The content security policy blocks
          them.
        </li>
        <li>
          Save is optional. It uses IndexedDB on this device and stores the parsed transactions, not
          a copy in the cloud.
        </li>
        <li>The share card is a PNG you download. Merchant names stay off unless you opt in.</li>
        <li>
          A service worker caches the app so it can open offline after the first visit. It does not
          upload your statement.
        </li>
        <li>
          Wipe everything deletes the saved scan from this browser. Theme preference is the only
          thing left behind.
        </li>
      </ul>
    </Modal>
  );
}

export function WipeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wipe } = useWorkspace();
  return (
    <Modal open={open} title="Wipe everything?" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        This deletes the saved statement, decisions, and the scan on screen. It cannot be undone.
        Your theme choice stays.
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          variant="danger"
          onClick={() => {
            void wipe().then(onClose);
          }}
        >
          Wipe statement data
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Keep it
        </Button>
      </div>
    </Modal>
  );
}
