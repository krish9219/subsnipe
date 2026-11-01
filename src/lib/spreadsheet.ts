export async function spreadsheetToCsv(data: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(data, { type: 'array' });
  const name = book.SheetNames[0];
  if (!name) return '';
  const sheet = book.Sheets[name];
  if (!sheet) return '';
  return XLSX.utils.sheet_to_csv(sheet);
}
