/**
 * Options for formatting notification and announcement timestamps.
 */
export interface FormatTimestampOptions {
  includeYear?: boolean;
}

/**
 * Deterministically formats an ISO date string to Indian Standard Time (Asia/Kolkata)
 * using en-IN locale conventions.
 *
 * Guarantees identical output on both SSR (Node.js) and browser hydration,
 * preventing React hydration mismatch errors.
 *
 * Examples:
 * - formatNotificationTimestamp('2026-10-23T14:05:00Z') -> "23 Oct 2026, 07:35 PM"
 * - formatNotificationTimestamp('2026-10-23T14:05:00Z', { includeYear: false }) -> "23 Oct, 07:35 PM"
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

    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: options.includeYear !== false ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const parts = formatter.formatToParts(date);
    let day = '';
    let month = '';
    let year = '';
    let hour = '';
    let minute = '';
    let dayPeriod = '';

    for (const part of parts) {
      if (part.type === 'day') day = part.value;
      else if (part.type === 'month') month = part.value;
      else if (part.type === 'year') year = part.value;
      else if (part.type === 'hour') hour = part.value;
      else if (part.type === 'minute') minute = part.value;
      else if (part.type === 'dayPeriod') dayPeriod = part.value.toUpperCase();
    }

    if (day && month && hour && minute) {
      const periodStr = dayPeriod ? ` ${dayPeriod}` : '';
      if (options.includeYear !== false && year) {
        return `${day} ${month} ${year}, ${hour}:${minute}${periodStr}`;
      }
      return `${day} ${month}, ${hour}:${minute}${periodStr}`;
    }

    // Resilient fallback normalizing all whitespace variations (e.g. narrow no-break space)
    return formatter.format(date).replace(/[\s\u202F\u00A0]+/g, ' ');
  } catch {
    return '—';
  }
}
