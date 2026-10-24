import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatDateRange,
  formatDateTimeRange,
  DEFAULT_TIMEZONE,
} from '../../src/lib/utils/date-format';

describe('Global Date Format Standardization Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Zero-Padded Calendar Dates (DD/MM/YYYY)
  // --------------------------------------------------------------------------
  it('DFS-01: formats dates with zero-padded day and month (DD/MM/YYYY)', () => {
    // Single digit day and month: November 2, 2026 -> 02/11/2026
    const d1 = formatDate('2026-11-02T10:00:00Z');
    assert.strictEqual(d1, '02/11/2026');

    // Single digit month: March 5, 2026 -> 05/03/2026
    const d2 = formatDate('2026-03-05T06:00:00Z');
    assert.strictEqual(d2, '05/03/2026');

    // October 24, 2026 -> 24/10/2026
    const d3 = formatDate('2026-10-24T05:00:00Z');
    assert.strictEqual(d3, '24/10/2026');

    // October 30, 2026 -> 30/10/2026 (in IST: 2026-10-30T00:00:00Z is 05:30 AM)
    const d4 = formatDate('2026-10-30T00:00:00Z');
    assert.strictEqual(d4, '30/10/2026');

    // October 31, 2026 -> 31/10/2026
    const d5 = formatDate('2026-10-31T12:00:00Z');
    assert.strictEqual(d5, '31/10/2026');
  });

  // --------------------------------------------------------------------------
  // 2. Pure Date-Only Strings (e.g. date_of_birth "YYYY-MM-DD")
  // --------------------------------------------------------------------------
  it('DFS-02: formats pure date-only strings without timezone offset shifts', () => {
    // Should parse YYYY-MM-DD directly so UTC midnight does not shift day in other timezones
    assert.strictEqual(formatDate('2004-03-05'), '05/03/2004');
    assert.strictEqual(formatDate('1999-12-31'), '31/12/1999');
    assert.strictEqual(formatDate('2000-01-01'), '01/01/2000');
    assert.strictEqual(formatDate('   2005-09-02   '), '02/09/2005');
  });

  // --------------------------------------------------------------------------
  // 3. Date and Time Formatting (DD/MM/YYYY, hh:mm AM/PM)
  // --------------------------------------------------------------------------
  it('DFS-03: formats date-time displays as DD/MM/YYYY, hh:mm AM/PM', () => {
    // 2026-10-24T03:54:00Z + 05:30 = 2026-10-24 09:24 AM
    const dt1 = formatDateTime('2026-10-24T03:54:00Z');
    assert.strictEqual(dt1, '24/10/2026, 09:24 AM');

    // Afternoon: 2026-10-24T08:45:00Z + 05:30 = 2026-10-24 02:15 PM
    const dt2 = formatDateTime('2026-10-24T08:45:00Z');
    assert.strictEqual(dt2, '24/10/2026, 02:15 PM');

    // Midnight transition: 2026-10-22T18:30:00Z + 05:30 = 2026-10-23 12:00 AM
    const dt3 = formatDateTime('2026-10-22T18:30:00Z');
    assert.strictEqual(dt3, '23/10/2026, 12:00 AM');

    // Noon transition: 2026-10-23T06:30:00Z + 05:30 = 2026-10-23 12:00 PM
    const dt4 = formatDateTime('2026-10-23T06:30:00Z');
    assert.strictEqual(dt4, '23/10/2026, 12:00 PM');
  });

  // --------------------------------------------------------------------------
  // 4. Month and Year Boundaries
  // --------------------------------------------------------------------------
  it('DFS-04: correctly handles month and year boundary transitions in Asia/Kolkata', () => {
    // New Year boundary: 2026-12-31T18:29:00Z in IST is 2026-12-31 11:59 PM
    const eve = formatDateTime('2026-12-31T18:29:00Z');
    assert.strictEqual(eve, '31/12/2026, 11:59 PM');

    // 2026-12-31T18:30:00Z in IST is 2027-01-01 12:00 AM
    const newYear = formatDateTime('2026-12-31T18:30:00Z');
    assert.strictEqual(newYear, '01/01/2027, 12:00 AM');

    // Month boundary: 2026-02-28T18:30:00Z in IST is 2026-03-01 12:00 AM
    const march = formatDateTime('2026-02-28T18:30:00Z');
    assert.strictEqual(march, '01/03/2026, 12:00 AM');
  });

  // --------------------------------------------------------------------------
  // 5. Date Ranges
  // --------------------------------------------------------------------------
  it('DFS-05: formats date ranges consistently', () => {
    const range1 = formatDateRange('2026-11-15T00:00:00Z', '2026-11-17T00:00:00Z');
    assert.strictEqual(range1, '15/11/2026 – 17/11/2026');

    // Range with single missing date
    assert.strictEqual(formatDateRange('2026-11-15T00:00:00Z', null), '15/11/2026');
    assert.strictEqual(formatDateRange(null, '2026-11-17T00:00:00Z'), '17/11/2026');
    assert.strictEqual(formatDateRange(null, null), '—');

    // DateTime Range
    const dtRange = formatDateTimeRange('2026-10-24T03:30:00Z', '2026-10-24T06:30:00Z');
    assert.strictEqual(dtRange, '24/10/2026, 09:00 AM – 24/10/2026, 12:00 PM');
  });

  // --------------------------------------------------------------------------
  // 6. Time Only Formatting (hh:mm AM/PM)
  // --------------------------------------------------------------------------
  it('DFS-06: formats time with zero-padded hour and minute (hh:mm AM/PM)', () => {
    // 09:24 AM
    assert.strictEqual(formatTime('2026-10-24T03:54:00Z'), '09:24 AM');
    // 01:05 PM
    assert.strictEqual(formatTime('2026-10-24T07:35:00Z'), '01:05 PM');
  });

  // --------------------------------------------------------------------------
  // 7. Deterministic Output (Hydration Safety)
  // --------------------------------------------------------------------------
  it('DFS-07: produces deterministic identical output irrespective of host machine default locale', () => {
    const timestamp = '2026-10-30T14:30:00Z'; // In IST: 2026-10-30 08:00 PM
    const output1 = formatDateTime(timestamp);
    const output2 = formatDateTime(timestamp, DEFAULT_TIMEZONE);
    assert.strictEqual(output1, '30/10/2026, 08:00 PM');
    assert.strictEqual(output2, '30/10/2026, 08:00 PM');

    const dateOnly = formatDate(timestamp);
    assert.strictEqual(dateOnly, '30/10/2026');
  });

  // --------------------------------------------------------------------------
  // 8. Invalid and Null Handling (Fail-Safe)
  // --------------------------------------------------------------------------
  it('DFS-08: safely handles invalid, null, undefined, or empty inputs without throwing', () => {
    assert.strictEqual(formatDate(null), '—');
    assert.strictEqual(formatDate(undefined), '—');
    assert.strictEqual(formatDate(''), '—');
    assert.strictEqual(formatDate('not-a-valid-date'), '—');

    assert.strictEqual(formatTime(null), '—');
    assert.strictEqual(formatTime(undefined), '—');
    assert.strictEqual(formatTime(''), '—');
    assert.strictEqual(formatTime('not-a-valid-date'), '—');

    assert.strictEqual(formatDateTime(null), '—');
    assert.strictEqual(formatDateTime(undefined), '—');
    assert.strictEqual(formatDateTime(''), '—');
    assert.strictEqual(formatDateTime('not-a-valid-date'), '—');
  });
});
