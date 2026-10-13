import { describe, expect, it } from 'vitest';
import type { Appointment, AppointmentReminder } from '../../db/types';
import {
  defaultReminder,
  DEFAULT_REMINDER,
  planAppointmentReminders,
  reminderTime,
  splitAppointments,
  validateReminder,
} from './appointments';

const DAY_BEFORE: AppointmentReminder = { daysBefore: 1, time: '20:00' };

/** reminder: null = no reminder (undefined would fall back to the default). */
const appt = (
  id: string,
  datetime: string,
  reminder: AppointmentReminder | null = DAY_BEFORE,
  createdAt = '2026-10-01T00:00:00.000Z',
): Appointment => ({
  id,
  title: `Title ${id}`,
  kind: 'visit',
  datetime,
  ...(reminder ? { reminder } : {}),
  createdAt,
  updatedAt: createdAt,
});

describe('reminder time', () => {
  it('applies the chosen day offset and time', () => {
    expect(reminderTime('2026-11-01T09:30', { daysBefore: 1, time: '20:00' })).toBe('2026-10-31T20:00');
    expect(reminderTime('2027-01-01T09:30', { daysBefore: 2, time: '08:15' })).toBe('2026-12-30T08:15');
    expect(reminderTime('2026-11-01T14:00', { daysBefore: 0, time: '09:00' })).toBe('2026-11-01T09:00');
  });

  it('rejects a same-day reminder at or after the appointment', () => {
    expect(validateReminder('2026-11-01T09:00', { daysBefore: 0, time: '09:00' })).not.toBeNull();
    expect(validateReminder('2026-11-01T09:00', { daysBefore: 0, time: '10:00' })).not.toBeNull();
    expect(validateReminder('2026-11-01T09:00', { daysBefore: 0, time: '07:00' })).toBeNull();
    expect(validateReminder('2026-11-01T09:00', { daysBefore: 1, time: '23:00' })).toBeNull();
  });
});

describe('planAppointmentReminders', () => {
  const now = new Date(2026, 9, 13, 21, 0); // 2026-10-13 21:00

  it('plans future reminders only, soonest first, with a neutral text per offset', () => {
    const plan = planAppointmentReminders(
      [
        appt('later', '2026-10-20T10:00', { daysBefore: 2, time: '09:00' }),
        appt('tomorrow', '2026-10-14T10:00'), // 10-13 20:00 already passed
        appt('soon', '2026-10-15T10:00'),
        appt('sameDay', '2026-10-16T15:00', { daysBefore: 0, time: '08:00' }),
        appt('off', '2026-10-16T10:00', null),
      ],
      now,
    );
    expect(plan).toEqual([
      { appointmentId: 'soon', fireAt: '2026-10-14T20:00', text: '내일 일정이 있어요' },
      { appointmentId: 'sameDay', fireAt: '2026-10-16T08:00', text: '오늘 일정이 있어요' },
      { appointmentId: 'later', fireAt: '2026-10-18T09:00', text: '모레 일정이 있어요' },
    ]);
  });

  it('never includes the title or place in the text', () => {
    const plan = planAppointmentReminders([{ ...appt('a', '2026-10-20T10:00'), location: 'Place X' }], now);
    expect(plan[0]!.text).not.toMatch(/Title|Place/);
  });

  it('caps the number of reminders', () => {
    const many = Array.from({ length: 30 }, (_, i) => appt(String(i), `2026-11-${String(i + 1).padStart(2, '0')}T10:00`));
    expect(planAppointmentReminders(many, now, 5)).toHaveLength(5);
  });
});

describe('defaultReminder', () => {
  it('reuses the most recently created appointment setting', () => {
    expect(defaultReminder([])).toEqual(DEFAULT_REMINDER);
    const older = appt('a', '2026-11-01T10:00', { daysBefore: 2, time: '07:00' }, '2026-10-01T00:00:00.000Z');
    const newer = appt('b', '2026-10-20T10:00', { daysBefore: 0, time: '08:00' }, '2026-10-05T00:00:00.000Z');
    expect(defaultReminder([older, newer])).toEqual({ daysBefore: 0, time: '08:00' });
    expect(defaultReminder([older, { ...newer, reminder: undefined }])).toBeUndefined();
  });
});

describe('splitAppointments', () => {
  it('keeps all of today in upcoming', () => {
    const now = new Date(2026, 9, 13, 15, 0);
    const { upcoming, past } = splitAppointments(
      [appt('b', '2026-10-20T09:00'), appt('a', '2026-10-13T09:00'), appt('old', '2026-10-01T09:00')],
      now,
    );
    expect(upcoming.map((a) => a.id)).toEqual(['a', 'b']);
    expect(past.map((a) => a.id)).toEqual(['old']);
  });
});
