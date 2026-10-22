import { z } from "zod";

export const EXPORT_FORMATS = ["csv", "xlsx", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_DATASETS = [
  "all",
  "students",
  "hackathons",
  "teams",
  "team_members",
  "registrations",
  "round_results",
  "results",
  "points",
  "points_ledger",
  "winners",
  "hackathon_summary",
  "submissions",
  "reviews",
  "audit_logs",
  "storage_objects",
  "profile_change_requests",
] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export const exportFormatSchema = z.enum(EXPORT_FORMATS, {
  message: "Format must be one of: csv, xlsx, zip",
});

export const exportDatasetSchema = z.enum(EXPORT_DATASETS, {
  message: "Invalid export dataset requested",
});

export const exportFiltersSchema = z
  .object({
    academicYear: z.coerce.number().int().min(1).max(4).optional(),
    branch: z.string().trim().max(10).optional(),
    status: z.string().trim().max(50).optional(),
    startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  })
  .optional();

export const exportRequestSchema = z.object({
  dataset: exportDatasetSchema,
  format: exportFormatSchema,
  hackathonId: z.string().uuid("Invalid hackathon ID").optional().nullable(),
  filters: exportFiltersSchema,
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
