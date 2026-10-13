import type {
  Appointment,
  AppointmentKind,
  AppointmentReminder,
  LocalDateTime,
} from '../../db/types';
import { addDays, combine, datePart, toLocalDateTime } from '../../utils/time';

export const KIND_LABELS: Record<AppointmentKind, string> = {
  visit: '진료',
  test: '검사',
  other: '기타',
};

export const REMINDER_DAY_LABELS: Record<AppointmentReminder['daysBefore'], string> = {
  0: '당일',
  1: '전날',
  2: '2일 전',
};

/**
 * Notification text per offset. Deliberately vague: never the title, place or kind,
 * because Android keeps scheduled notification content in plaintext.
 */
export const REMINDER_TEXTS: Record<AppointmentReminder['daysBefore'], string> = {
  0: '오늘 일정이 있어요',
  1: '내일 일정이 있어요',
  2: '모레 일정이 있어요',
};

export const DEFAULT_REMINDER: AppointmentReminder = { daysBefore: 1, time: '20:00' };

/** Upper bound on scheduled appointment reminders. */
export const MAX_APPOINTMENT_REMINDERS = 20;

export function reminderTime(datetime: LocalDateTime, reminder: AppointmentReminder): LocalDateTime {
  return combine(addDays(datePart(datetime), -reminder.daysBefore), reminder.time);
}

/** Returns an error message if the reminder would fire at or after the appointment. */
export function validateReminder(datetime: LocalDateTime, reminder: AppointmentReminder): string | null {
  return reminderTime(datetime, reminder) >= datetime ? '알림 시각이 일정 시각보다 늦어요.' : null;
}

/** New appointments start with the reminder of the most recently created one. */
export function defaultReminder(appts: Appointment[]): AppointmentReminder | undefined {
  if (appts.length === 0) return DEFAULT_REMINDER;
  const latest = [...appts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
  return latest.reminder;
}

export function describeReminder(reminder: AppointmentReminder): string {
  return `${REMINDER_DAY_LABELS[reminder.daysBefore]} ${reminder.time} 알림`;
}

/** Future reminders, soonest first. A reminder whose time has already passed is skipped. */
export function planAppointmentReminders(
  appts: Appointment[],
  now: Date,
  max = MAX_APPOINTMENT_REMINDERS,
): { appointmentId: string; fireAt: LocalDateTime; text: string }[] {
  const nowDt = toLocalDateTime(now);
  const out: { appointmentId: string; fireAt: LocalDateTime; text: string }[] = [];
  for (const a of appts) {
    if (!a.reminder) continue;
    const fireAt = reminderTime(a.datetime, a.reminder);
    if (fireAt > nowDt && fireAt < a.datetime) {
      out.push({ appointmentId: a.id, fireAt, text: REMINDER_TEXTS[a.reminder.daysBefore] });
    }
  }
  return out.sort((a, b) => a.fireAt.localeCompare(b.fireAt)).slice(0, max);
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
