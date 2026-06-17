type Cell = string | number | null | undefined;

/**
 * Build a single-sheet .xlsx workbook from a header row + data rows and trigger
 * a browser download. Used for the "Export Excel" actions.
 *
 * SheetJS is imported dynamically so its ~300 KB only loads when a user actually
 * exports to Excel, keeping the initial app bundle small.
 */
export async function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Cell[][]
) {
  const XLSX = await import('xlsx');
  const aoa = [headers, ...rows.map((r) => r.map((c) => c ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable default column widths based on header length
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel sheet-name limit
  XLSX.writeFile(wb, filename);
}
