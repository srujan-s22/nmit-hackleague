import { formatDate, formatTime, DEFAULT_TIMEZONE } from '@/lib/utils/date-format';

/**
 * Options for formatting notification and announcement timestamps.
 */
export interface FormatTimestampOptions {
  includeYear?: boolean;
}

/**
 * Deterministically formats an ISO date string to Indian Standard Time (Asia/Kolkata)
 * using the standard DD/MM/YYYY, hh:mm AM/PM format.
 *
 * Guarantees identical output on both SSR (Node.js) and browser hydration,
 * preventing React hydration mismatch errors.
 *
 * Examples:
 * - formatNotificationTimestamp('2026-10-23T14:05:00Z') -> "23/10/2026, 07:35 PM"
 * - formatNotificationTimestamp('2026-10-23T14:05:00Z', { includeYear: false }) -> "23/10, 07:35 PM"
 * - formatNotificationTimestamp(null) -> "—"
 * - formatNotificationTimestamp('invalid') -> "—"
 */
export function formatNotificationTimestamp(
  isoString: string | null | undefined,
  options: FormatTimestampOptions = { includeYear: true }
): string {
  if (!isoString) return '—';

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';

    const t = formatTime(date, DEFAULT_TIMEZONE);
    if (t === '—') return '—';

    if (options.includeYear === false) {
      // Return DD/MM, hh:mm AM/PM
      const fullDate = formatDate(date, DEFAULT_TIMEZONE); // DD/MM/YYYY
      const [day, month] = fullDate.split('/');
      return `${day}/${month}, ${t}`;
    }

    const fullDate = formatDate(date, DEFAULT_TIMEZONE);
    return `${fullDate}, ${t}`;
  } catch {
    return '—';
  }
}

