import type { Appointment, AppointmentKind, LocalDateTime } from '../../db/types';
import { addDays, combine, datePart, toLocalDateTime } from '../../utils/time';

export const KIND_LABELS: Record<AppointmentKind, string> = {
  visit: '진료',
  test: '검사',
  other: '기타',
};

/** Day-before reminders fire at this local time. */
export const REMIND_AT = '20:00';
/** Upper bound on scheduled appointment reminders. */
export const MAX_APPOINTMENT_REMINDERS = 20;

export function reminderTime(appt: Appointment): LocalDateTime {
  return combine(addDays(datePart(appt.datetime), -1), REMIND_AT);
}

/**
 * Future day-before reminders, soonest first. A reminder whose time has already
 * passed (e.g. an appointment added late the evening before) is skipped.
 */
export function planAppointmentReminders(
  appts: Appointment[],
  now: Date,
  max = MAX_APPOINTMENT_REMINDERS,
): { appointmentId: string; fireAt: LocalDateTime }[] {
  const nowDt = toLocalDateTime(now);
  return appts
    .filter((a) => a.remind)
    .map((a) => ({ appointmentId: a.id, fireAt: reminderTime(a) }))
    .filter((r) => r.fireAt > nowDt)
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .slice(0, max);
}

/** Upcoming (from the start of today) soonest first; past ones newest first. */
export function splitAppointments(appts: Appointment[], now: Date) {
  const startOfToday = `${toLocalDateTime(now).slice(0, 10)}T00:00`;
  const upcoming = appts
    .filter((a) => a.datetime >= startOfToday)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const past = appts
    .filter((a) => a.datetime < startOfToday)
    .sort((a, b) => b.datetime.localeCompare(a.datetime));
  return { upcoming, past };
}
