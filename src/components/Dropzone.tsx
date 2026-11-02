import { useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWorkspace } from '@/state/workspace';

export function Dropzone({ compact = false }: { compact?: boolean }) {
  const { ingest, busy } = useWorkspace();
  const [over, setOver] = useState(false);

  function take(files: File[]) {
    if (files.length) void ingest(files);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    take([...event.dataTransfer.files]);
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'block cursor-pointer border border-dashed transition',
        compact ? 'rounded-full px-3 py-2 text-sm' : 'rounded-[22px] px-6 py-10 sm:px-10',
        over ? 'border-accent bg-accent/10' : 'border-line bg-elev/80 hover:border-accent',
      )}
    >
      <input
        className="sr-only"
        type="file"
        multiple
        accept=".csv,.tsv,.txt,.pdf,.xlsx,.xls,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Choose statement files"
        onChange={(event) => {
          take([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {compact ? (
        <span className="inline-flex items-center gap-2 font-medium">
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Add files
        </span>
      ) : (
        <span className="flex flex-col items-center text-center">
          <FileUp className="mb-3 h-8 w-8 text-accent" aria-hidden="true" />
          <span className="font-serif text-2xl tracking-tight">Drop statements here</span>
          <span className="mt-2 max-w-md text-sm text-muted">
            CSV and Excel are the reliable path. PDF import is in beta: text-based statements only,
            read locally with pdf.js. Nothing is uploaded.
          </span>
          <span className="mt-4 text-sm font-medium text-accent">
            {busy ? 'Reading…' : 'Choose CSV, Excel, or PDF'}
          </span>
        </span>
      )}
    </label>
  );
}
