import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatDate, isoWeekday, isValidTime, toDate, toLocalDateTime } from './time';

describe('time', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days regardless of DST', () => {
    // Spans the EU/US DST changes in March and November.
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-25', '2026-11-08')).toBe(14);
    expect(daysBetween('2026-10-13', '2026-10-06')).toBe(-7);
  });

  it('uses ISO weekdays (Mon=1, Sun=7)', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-13')).toBe(2);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(formatDate('2026-10-13')).toBe('10월 13일 (화)');
  });

  it('round-trips local date-times', () => {
    const d = new Date(2026, 9, 13, 9, 5);
    expect(toLocalDateTime(d)).toBe('2026-10-13T09:05');
    expect(toDate('2026-10-13T09:05').getTime()).toBe(d.getTime());
  });

  it('validates HH:mm', () => {
    expect(isValidTime('09:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });
});
