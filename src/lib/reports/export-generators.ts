import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { sanitizeCellValue } from '@/lib/validation/export-schemas';

export { sanitizeCellValue };

/**
 * Converts an array of record objects into an RFC 4180 compliant CSV string.
 * Automatically sanitizes all cell values against formula injection.
 */
export function generateCsvString(
  headers: { key: string; label: string }[],
  rows: Record<string, unknown>[]
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h.label)).join(',');

  const dataLines = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h.key];
        const sanitized = sanitizeCellValue(val);
        return escapeCsvCell(sanitized);
      })
      .join(',')
  );

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Escapes an individual cell value for CSV output.
 */
function escapeCsvCell(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith("'") ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('\t')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface DatasetExportConfig {
  id: string;
  title: string;
  headers: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

/**
 * Generates a ZIP archive containing individual CSV files for all provided datasets.
 */
export async function generateCsvZipPackage(
  datasets: DatasetExportConfig[]
): Promise<Buffer> {
  const zip = new JSZip();

  for (const ds of datasets) {
    const csvContent = generateCsvString(ds.headers, ds.rows);
    zip.file(`${ds.id}.csv`, csvContent);
  }

  const arrayBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return arrayBuffer;
}

/**
 * Generates a multi-sheet Microsoft Excel workbook (.xlsx) containing styled sheets
 * for all provided datasets with formula injection protection.
 */
export async function generateExcelWorkbook(
  datasets: DatasetExportConfig[],
  title = 'NMIT HackLeague Report'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NMIT HackLeague Platform';
  workbook.created = new Date();

  for (const ds of datasets) {
    // Worksheet names are capped at 31 chars in Excel
    const sheetName = ds.title.slice(0, 31).replace(/[\\/?*:[\]]/g, '_');
    const sheet = workbook.addWorksheet(sheetName);

    // Columns configuration
    sheet.columns = ds.headers.map((h) => ({
      header: h.label,
      key: h.key,
      width: Math.max(h.label.length + 4, 15),
    }));

    // Header styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Dark slate
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 24;

    // Add rows with formula sanitization
    for (const rawRow of ds.rows) {
      const sanitizedRow: Record<string, unknown> = {};
      for (const h of ds.headers) {
        sanitizedRow[h.key] = sanitizeCellValue(rawRow[h.key]);
      }
      sheet.addRow(sanitizedRow);
    }

    // Auto-fit column widths based on content
    sheet.columns.forEach((column) => {
      let maxLen = (column.header as string)?.length || 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellLen = cell.value ? String(cell.value).length : 0;
        if (cellLen > maxLen) {
          maxLen = cellLen;
        }
      });
      column.width = Math.min(Math.max(maxLen + 3, 12), 50);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
