import { describe, expect, it } from 'vitest';
import type { Appointment } from '../../db/types';
import { planAppointmentReminders, reminderTime, splitAppointments } from './appointments';

const appt = (id: string, datetime: string, remind = true): Appointment => ({
  id,
  title: `Title ${id}`,
  kind: 'visit',
  datetime,
  remind,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

describe('appointment reminders', () => {
  const now = new Date(2026, 9, 13, 21, 0); // 2026-10-13 21:00

  it('fires at 20:00 the day before', () => {
    expect(reminderTime(appt('a', '2026-11-01T09:30'))).toBe('2026-10-31T20:00');
    expect(reminderTime(appt('a', '2027-01-01T09:30'))).toBe('2026-12-31T20:00');
  });

  it('plans future reminders only, soonest first, respecting the toggle', () => {
    const plan = planAppointmentReminders(
      [
        appt('later', '2026-10-20T10:00'),
        appt('tomorrow', '2026-10-14T10:00'), // reminder 10-13 20:00 already passed
        appt('soon', '2026-10-15T10:00'),
        appt('off', '2026-10-16T10:00', false),
      ],
      now,
    );
    expect(plan).toEqual([
      { appointmentId: 'soon', fireAt: '2026-10-14T20:00' },
      { appointmentId: 'later', fireAt: '2026-10-19T20:00' },
    ]);
  });

  it('caps the number of reminders', () => {
    const many = Array.from({ length: 30 }, (_, i) => appt(String(i), `2026-11-${String(i + 1).padStart(2, '0')}T10:00`));
    expect(planAppointmentReminders(many, now, 5)).toHaveLength(5);
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
