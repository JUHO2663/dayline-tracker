import type { LocalDate, LocalDateTime, Medication, Schedule } from '../../db/types';
import { addDays, combine, daysBetween, isoWeekday, weekdayLabel } from '../../utils/time';

/** Whether the schedule has an occurrence on this date (ignores start/end). */
function matchesDay(schedule: Schedule, startDate: LocalDate, date: LocalDate): boolean {
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekly':
      return schedule.weekdays.includes(isoWeekday(date));
    case 'interval': {
      const diff = daysBetween(startDate, date);
      return diff >= 0 && diff % schedule.everyDays === 0;
    }
  }
}

export function isActiveOn(med: Medication, date: LocalDate): boolean {
  return (
    med.active &&
    date >= med.startDate &&
    (med.endDate === undefined || date <= med.endDate)
  );
}

/** Scheduled times on one date, sorted. */
export function occurrencesOn(med: Medication, date: LocalDate): LocalDateTime[] {
  if (!isActiveOn(med, date) || !matchesDay(med.schedule, med.startDate, date)) return [];
  return [...new Set(med.schedule.times)].sort().map((t) => combine(date, t));
}

/** Scheduled times from `from` to `to` (inclusive dates), sorted. */
export function occurrencesBetween(
  med: Medication,
  from: LocalDate,
  to: LocalDate,
): LocalDateTime[] {
  const out: LocalDateTime[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...occurrencesOn(med, d));
  return out;
}

export function describeSchedule(schedule: Schedule): string {
  const times = [...schedule.times].sort().join(', ');
  switch (schedule.type) {
    case 'daily':
      return `매일 ${times}`;
    case 'weekly':
      return `${[...schedule.weekdays].sort().map(weekdayLabel).join('·')} ${times}`;
    case 'interval':
      return `${schedule.everyDays}일마다 ${times}`;
  }
}

/** Returns an error message, or null if the schedule is usable. */
export function validateSchedule(schedule: Schedule): string | null {
  if (schedule.times.length === 0) return '시간을 하나 이상 넣어 주세요.';
  if (schedule.type === 'weekly' && schedule.weekdays.length === 0) {
    return '요일을 하나 이상 골라 주세요.';
  }
  if (
    schedule.type === 'interval' &&
    (!Number.isInteger(schedule.everyDays) || schedule.everyDays < 2 || schedule.everyDays > 365)
  ) {
    return '간격은 2–365일 사이로 넣어 주세요.';
  }
  return null;
}
