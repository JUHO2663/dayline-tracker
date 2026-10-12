import type { LocalDate, LocalDateTime, LocalTime } from '../db/types';

// All calendar math is done on 'YYYY-MM-DD' strings via UTC dates, so daylight-saving
// shifts never make a day 23 or 25 hours long. Only the final conversion to a Date
// (for notifications) uses the device's local time zone.

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): LocalDateTime {
  return `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function today(now = new Date()): LocalDate {
  return toLocalDate(now);
}

function utc(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

export function addDays(date: LocalDate, days: number): LocalDate {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(date: LocalDate): number {
  const day = new Date(utc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function combine(date: LocalDate, time: LocalTime): LocalDateTime {
  return `${date}T${time}`;
}

export function datePart(dt: LocalDateTime): LocalDate {
  return dt.slice(0, 10);
}

export function timePart(dt: LocalDateTime): LocalTime {
  return dt.slice(11, 16);
}

/** Interprets a LocalDateTime in the device's current time zone. */
export function toDate(dt: LocalDateTime): Date {
  const [y, m, d] = dt.slice(0, 10).split('-').map(Number) as [number, number, number];
  const [hh, mm] = dt.slice(11, 16).split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm);
}

export function isValidTime(t: string): t is LocalTime {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export function weekdayLabel(isoDay: number): string {
  return WEEKDAY_LABELS[isoDay - 1] ?? '';
}

/** e.g. "10월 13일 (화)" */
export function formatDate(date: LocalDate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${weekdayLabel(isoWeekday(date))})`;
}
