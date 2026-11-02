function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** SheetJS date cells are timezone-sensitive. Prefer the UTC calendar day when the instant is midnight UTC. */
export function formatSpreadsheetDate(date: Date): string {
  const midnightUtc =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  const year = midnightUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = (midnightUtc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = midnightUtc ? date.getUTCDate() : date.getDate();
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatCell(cell: unknown): string {
  if (cell instanceof Date) return formatSpreadsheetDate(cell);
  if (cell == null) return '';
  const text = String(cell);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function spreadsheetToCsv(data: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(data, { type: 'array', cellDates: true });
  const name = book.SheetNames[0];
  if (!name) return '';
  const sheet = book.Sheets[name];
  if (!sheet) return '';
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
  }) as unknown[][];
  return rows.map((row) => row.map((cell) => formatCell(cell)).join(',')).join('\n');
}
