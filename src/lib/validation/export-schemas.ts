import { z } from "zod";
import { ALL_DATASET_IDS, type DatasetId } from "@/lib/reports/dataset-catalog";

export const EXPORT_FORMATS = ["csv", "xlsx", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// Canonical identifiers come from the dataset catalog (11 core + 3 advanced).
// The former "all" / "results" / "points_ledger" aliases are no longer accepted:
// "all core datasets" is an explicit list of the 11 core ids.
export const EXPORT_DATASETS = ALL_DATASET_IDS as readonly [DatasetId, ...DatasetId[]];
export type ExportDataset = DatasetId;

export const exportFormatSchema = z.enum(EXPORT_FORMATS, {
  message: "Format must be one of: csv, xlsx, zip",
});

export const exportDatasetSchema = z.enum(EXPORT_DATASETS, {
  message: "Invalid export dataset requested",
});

export const exportRequestSchema = z.object({
  datasets: z
    .array(exportDatasetSchema)
    .min(1, "Select at least one dataset")
    .max(EXPORT_DATASETS.length)
    .refine((ids) => new Set(ids).size === ids.length, "Datasets must not repeat"),
  format: exportFormatSchema,
  hackathonId: z.string().uuid("Invalid hackathon ID").optional().nullable(),
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;

/**
 * Sanitizes an individual cell value against CSV / Spreadsheet formula injection (CWE-1236).
 * Any cell that, after stripping leading whitespace and control characters, begins
 * with a formula trigger ('=', '+', '-', '@', '%', '\t', '\r') is prefixed with a single quote (').
 * If the string already begins with a single quote followed by a formula trigger, an additional
 * single quote is prepended to ensure spreadsheets treat it strictly as literal text.
 */
export function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  let str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.length === 0) {
    return "";
  }

  // Strip leading whitespace, tabs, and ASCII/Unicode control characters
  const stripped = str.replace(/^[\s\u0000-\u001f\u007f-\u009f]+/, "");
  if (stripped.length > 0) {
    const firstChar = stripped.charAt(0);
    if (
      firstChar === "=" ||
      firstChar === "+" ||
      firstChar === "-" ||
      firstChar === "@" ||
      firstChar === "%" ||
      firstChar === "\t" ||
      firstChar === "\r"
    ) {
      str = `'${str}`;
    } else if (firstChar === "'") {
      const afterQuote = stripped.slice(1).replace(/^[\s\u0000-\u001f\u007f-\u009f]+/, "");
      if (afterQuote.length > 0) {
        const nextChar = afterQuote.charAt(0);
        if (
          nextChar === "=" ||
          nextChar === "+" ||
          nextChar === "-" ||
          nextChar === "@" ||
          nextChar === "%" ||
          nextChar === "\t" ||
          nextChar === "\r"
        ) {
          str = `'${str}`;
        }
      }
    }
  }

  return str;
}

/**
 * Sanitizes all properties in an object record to prevent spreadsheet formula injection.
 */
export function sanitizeRecord<T extends Record<string, unknown>>(record: T): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    sanitized[key] = sanitizeCellValue(val);
  }
  return sanitized;
}
