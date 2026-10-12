import type { LocalDate, LocalDateTime, Medication, Schedule } from '../../db/types';
import { addDays, combine, daysBetween, isoWeekday, weekdayLabel } from '../../utils/time';

function matchesDay(schedule: Schedule, date: LocalDate): boolean {
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekly':
      return schedule.weekdays.includes(isoWeekday(date));
    case 'interval': {
      const diff = daysBetween(schedule.anchor, date);
      return ((diff % schedule.everyDays) + schedule.everyDays) % schedule.everyDays === 0;
    }
  }
}

/** The schedule in effect on a date, or undefined if nothing was scheduled then. */
export function scheduleOn(med: Medication, date: LocalDate): Schedule | undefined {
  if (date < med.startDate) return undefined;
  if (med.endDate !== undefined && date > med.endDate) return undefined;
  if (!med.active && (med.inactiveFrom === undefined || date >= med.inactiveFrom)) return undefined;
  if (date >= med.scheduleFrom) return med.schedule;
  return med.scheduleHistory.find((p) => date >= p.from && date <= p.to)?.schedule ?? undefined;
}

/** Scheduled times on one date, sorted. */
export function occurrencesOn(med: Medication, date: LocalDate): LocalDateTime[] {
  const schedule = scheduleOn(med, date);
  if (!schedule || !matchesDay(schedule, date)) return [];
  return [...new Set(schedule.times)].sort().map((t) => combine(date, t));
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

/**
 * Whether two schedules produce the same occurrences. Ignores ordering and duplicates,
 * and treats interval anchors on the same cycle (e.g. 7 days apart) as equal.
 */
export function sameSchedule(a: Schedule, b: Schedule): boolean {
  const norm = (s: Schedule) => {
    const times = [...new Set(s.times)].sort();
    switch (s.type) {
      case 'daily':
        return { type: s.type, times };
      case 'weekly':
        return { type: s.type, times, weekdays: [...new Set(s.weekdays)].sort() };
      case 'interval':
        return { type: s.type, times, everyDays: s.everyDays };
    }
  };
  if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) return false;
  if (a.type === 'interval' && b.type === 'interval') {
    return daysBetween(a.anchor, b.anchor) % a.everyDays === 0;
  }
  return true;
}

/** Returns an error message, or null if the schedule is usable. */
export function validateSchedule(schedule: Schedule): string | null {
  if (schedule.times.length === 0) return '시간을 하나 이상 넣어 주세요.';
  if (schedule.type === 'weekly' && schedule.weekdays.length === 0) {
    return '요일을 하나 이상 골라 주세요.';
  }
  if (schedule.type === 'interval') {
    if (!Number.isInteger(schedule.everyDays) || schedule.everyDays < 2 || schedule.everyDays > 365) {
      return '간격은 2–365일 사이로 넣어 주세요.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.anchor)) return '기준일을 넣어 주세요.';
  }
  return null;
}
