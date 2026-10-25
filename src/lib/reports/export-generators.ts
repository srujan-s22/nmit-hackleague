import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { once } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
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
export function escapeCsvCell(value: string): string {
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

// ---------------------------------------------------------------------------
// Streaming generators
//
// These produce output incrementally from async row sources (the paged export
// RPC), so memory stays bounded by one page rather than the whole dataset.
// Formula-injection protection is applied to every textual cell, exactly as in
// the buffered generators above.
// ---------------------------------------------------------------------------

export type ExportColumn = { key: string; label: string };
export type RowSource = AsyncIterable<Record<string, unknown>>;

export interface StreamDataset {
  /** Worksheet name (xlsx) */
  sheetName: string;
  /** File name without extension (zip / csv) */
  fileName: string;
  columns: ExportColumn[];
  rows: RowSource;
}

const CSV_CHUNK_ROWS = 500;

/** CSV text in chunks: header first (so an empty dataset is still a valid file), then rows. */
export async function* csvChunks(columns: ExportColumn[], rows: RowSource): AsyncGenerator<string> {
  yield columns.map((c) => escapeCsvCell(c.label)).join(',') + '\r\n';

  let buffer: string[] = [];
  for await (const row of rows) {
    buffer.push(
      columns.map((c) => escapeCsvCell(sanitizeCellValue(row[c.key]))).join(',') + '\r\n'
    );
    if (buffer.length >= CSV_CHUNK_ROWS) {
      yield buffer.join('');
      buffer = [];
    }
  }
  if (buffer.length > 0) yield buffer.join('');
}

function toNodeReadable(chunks: AsyncIterable<string>): Readable {
  return Readable.from(
    (async function* () {
      for await (const chunk of chunks) yield Buffer.from(chunk, 'utf-8');
    })(),
    { objectMode: false }
  );
}

/** ZIP archive streamed file-by-file, one CSV per dataset. */
export function createZipStream(datasets: StreamDataset[]): Readable {
  const zip = new JSZip();
  for (const ds of datasets) {
    zip.file(`${ds.fileName}.csv`, toNodeReadable(csvChunks(ds.columns, ds.rows)));
  }
  // JSZip returns a legacy (readable-stream) object that isn't async-iterable;
  // pipe it into a native PassThrough and forward errors.
  const source = zip.generateNodeStream({
    type: 'nodebuffer',
    streamFiles: true,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const out = new PassThrough();
  source.on('error', (err: unknown) => out.destroy(err instanceof Error ? err : new Error('ZIP generation failed.')));
  source.pipe(out);
  return out;
}

function xlsxCellValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return sanitizeCellValue(value);
}

/** Multi-sheet workbook written row-by-row with ExcelJS's streaming writer. */
export function createXlsxStream(datasets: StreamDataset[], creator = 'NMIT HackLeague Platform'): Readable {
  const out = new PassThrough();

  void (async () => {
    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: out,
        useStyles: true,
        useSharedStrings: false,
      });
      workbook.creator = creator;
      workbook.created = new Date();

      for (const ds of datasets) {
        const sheetName = ds.sheetName.slice(0, 31).replace(/[\\/?*:[\]]/g, '_');
        const sheet = workbook.addWorksheet(sheetName, {
          views: [{ state: 'frozen', ySplit: 1 }],
        });
        sheet.columns = ds.columns.map((c) => ({
          key: c.key,
          width: Math.min(Math.max(c.label.length + 4, 14), 40),
        }));

        const header = sheet.addRow(ds.columns.map((c) => c.label));
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        header.alignment = { vertical: 'middle', horizontal: 'left' };
        header.height = 24;
        header.commit();

        for await (const row of ds.rows) {
          sheet.addRow(ds.columns.map((c) => xlsxCellValue(row[c.key]))).commit();
          if (out.writableNeedDrain) await once(out, 'drain');
        }
        await sheet.commit();
      }

      await workbook.commit();
    } catch (err) {
      out.destroy(err instanceof Error ? err : new Error('Workbook generation failed.'));
    }
  })();

  return out;
}
