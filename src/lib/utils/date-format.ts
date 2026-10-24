/**
 * Global Date & Time Formatting Utilities for NMIT HackLeague.
 *
 * Implements institution-standard formatting across all server-rendered
 * and client-rendered components to guarantee deterministic hydration:
 * - Date display: DD/MM/YYYY (e.g. 24/10/2026, 02/11/2026)
 * - Date & Time display: DD/MM/YYYY, hh:mm AM/PM (e.g. 24/10/2026, 09:24 AM)
 * - Time only display: hh:mm AM/PM (e.g. 09:24 AM)
 * - Date ranges: DD/MM/YYYY – DD/MM/YYYY
 * - Date & Time ranges: DD/MM/YYYY, hh:mm AM/PM – DD/MM/YYYY, hh:mm AM/PM
 *
 * Default timezone: Asia/Kolkata (IST, UTC+05:30)
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export type DateInput = string | number | Date | null | undefined;

/**
 * Formats an input into DD/MM/YYYY with zero-padded day and month.
 * Handles pure date-only strings (YYYY-MM-DD) directly to prevent timezone-induced
 * date boundary shifts.
 */
export function formatDate(input: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!input) return '—';

  // If input is a pure YYYY-MM-DD date-only string (e.g. date_of_birth), parse directly
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-');
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }

  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return '—';

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const parts = formatter.formatToParts(date);
    let day = '';
    let month = '';
    let year = '';

    for (const part of parts) {
      if (part.type === 'day') day = part.value.padStart(2, '0');
      else if (part.type === 'month') month = part.value.padStart(2, '0');
      else if (part.type === 'year') year = part.value;
    }

    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }

    return '—';
  } catch {
    return '—';
  }
}

/**
 * Formats an input into 12-hour time hh:mm AM/PM with zero-padded hour and minute.
 */
export function formatTime(input: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!input) return '—';

  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return '—';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const parts = formatter.formatToParts(date);
    let hour = '';
    let minute = '';
    let dayPeriod = '';

    for (const part of parts) {
      if (part.type === 'hour') hour = part.value.padStart(2, '0');
      else if (part.type === 'minute') minute = part.value.padStart(2, '0');
      else if (part.type === 'dayPeriod') dayPeriod = part.value.toUpperCase();
    }

    if (hour && minute) {
      return `${hour}:${minute} ${dayPeriod}`.trim();
    }

    return '—';
  } catch {
    return '—';
  }
}

/**
 * Formats an input into DD/MM/YYYY, hh:mm AM/PM with zero-padded day, month, hour, and minute.
 */
export function formatDateTime(input: DateInput, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!input) return '—';

  const d = formatDate(input, timeZone);
  const t = formatTime(input, timeZone);

  if (d === '—' || t === '—') return '—';
  return `${d}, ${t}`;
}

/**
 * Formats a date range into DD/MM/YYYY – DD/MM/YYYY.
 */
export function formatDateRange(
  start: DateInput,
  end: DateInput,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const formattedStart = formatDate(start, timeZone);
  const formattedEnd = formatDate(end, timeZone);

  if (formattedStart === '—' && formattedEnd === '—') return '—';
  if (formattedStart === '—') return formattedEnd;
  if (formattedEnd === '—') return formattedStart;

  return `${formattedStart} – ${formattedEnd}`;
}

/**
 * Formats a date & time range into DD/MM/YYYY, hh:mm AM/PM – DD/MM/YYYY, hh:mm AM/PM.
 */
export function formatDateTimeRange(
  start: DateInput,
  end: DateInput,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const formattedStart = formatDateTime(start, timeZone);
  const formattedEnd = formatDateTime(end, timeZone);

  if (formattedStart === '—' && formattedEnd === '—') return '—';
  if (formattedStart === '—') return formattedEnd;
  if (formattedEnd === '—') return formattedStart;

  return `${formattedStart} – ${formattedEnd}`;
}
