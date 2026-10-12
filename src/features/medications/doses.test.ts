import { describe, expect, it } from 'vitest';
import { agendaFor, countByStatus, findMissed, makeDoseLog, medicationHistory } from './doses';
import { planDoseReminders } from './notificationPlan';
import { med } from './testUtils';

const daily9 = med('a', { type: 'daily', times: ['09:00'] }, { startDate: '2026-10-10' });

describe('agenda and missed', () => {
  it('attaches logs to scheduled occurrences', () => {
    const log = makeDoseLog(daily9, '2026-10-13T09:00', 'taken', new Date(2026, 9, 13, 9, 7));
    const agenda = agendaFor([daily9], [log], '2026-10-13');
    expect(agenda).toHaveLength(1);
    expect(agenda[0]!.log).toEqual(log);
  });

  it('derives missed doses within a range, newest first', () => {
    const logs = [makeDoseLog(daily9, '2026-10-11T09:00', 'skipped')];
    const missed = findMissed([daily9], logs, '2026-10-01', '2026-10-12');
    // 10-10 and 10-12 unlogged; 10-11 skipped (not missed); nothing before start.
    expect(missed.map((m) => m.scheduledAt)).toEqual(['2026-10-12T09:00', '2026-10-10T09:00']);
    expect(findMissed([daily9], logs, '2026-10-12', '2026-10-12')).toHaveLength(1);
  });

  it('records the actual time only when checking on the same day', () => {
    const now = new Date(2026, 9, 13, 9, 7);
    expect(makeDoseLog(daily9, '2026-10-13T09:00', 'taken', now).takenAt).toBe('2026-10-13T09:07');
    expect(makeDoseLog(daily9, '2026-10-12T09:00', 'taken', now)).not.toHaveProperty('takenAt');
    expect(makeDoseLog(daily9, '2026-10-13T09:00', 'skipped', now)).not.toHaveProperty('takenAt');
  });

  it('snapshots dose and unit', () => {
    const log = makeDoseLog({ ...daily9, dose: 4, unit: 'mL' }, '2026-10-13T09:00', 'taken');
    expect(log).toMatchObject({ doseSnapshot: 4, unitSnapshot: 'mL' });
  });
});

describe('medicationHistory', () => {
  const now = new Date(2026, 9, 13, 12, 0);
  const twice = med('a', { type: 'daily', times: ['09:00', '21:00'] }, { startDate: '2026-10-12' });

  it('labels every occurrence, newest first', () => {
    const logs = [
      makeDoseLog(twice, '2026-10-12T09:00', 'taken', now),
      makeDoseLog(twice, '2026-10-12T21:00', 'skipped', now),
    ];
    const history = medicationHistory(twice, logs, '2026-10-01', '2026-10-13', now);
    expect(history.map((h) => [h.scheduledAt, h.status])).toEqual([
      ['2026-10-13T21:00', 'upcoming'],
      ['2026-10-13T09:00', 'overdue'],
      ['2026-10-12T21:00', 'skipped'],
      ['2026-10-12T09:00', 'taken'],
    ]);
    expect(countByStatus(history)).toMatchObject({ taken: 1, skipped: 1, missed: 0, overdue: 1 });
  });

  it('keeps logs whose time no longer matches the schedule', () => {
    const orphan = makeDoseLog(twice, '2026-10-12T08:30', 'taken', now);
    const other = makeDoseLog(med('b', { type: 'daily', times: ['09:00'] }), '2026-10-12T09:00', 'taken', now);
    const history = medicationHistory(twice, [orphan, other], '2026-10-12', '2026-10-12', now);
    expect(history.map((h) => [h.scheduledAt, h.status])).toEqual([
      ['2026-10-12T21:00', 'missed'],
      ['2026-10-12T09:00', 'missed'],
      ['2026-10-12T08:30', 'taken'],
    ]);
  });
});

describe('planDoseReminders', () => {
  const now = new Date(2026, 9, 13, 10, 0);

  it('plans future slots only and merges medications sharing a time', () => {
    const a = med('a', { type: 'daily', times: ['09:00', '21:00'] });
    const b = med('b', { type: 'daily', times: ['21:00'] });
    const slots = planDoseReminders([a, b], [], now, 1);
    expect(slots).toEqual(['2026-10-13T21:00', '2026-10-14T09:00', '2026-10-14T21:00']);
  });

  it('skips slots where everything is already logged', () => {
    const a = med('a', { type: 'daily', times: ['21:00'] });
    const b = med('b', { type: 'daily', times: ['21:00'] });
    const logA = makeDoseLog(a, '2026-10-13T21:00', 'taken', now);
    const logB = makeDoseLog(b, '2026-10-13T21:00', 'skipped', now);

    expect(planDoseReminders([a, b], [logA], now, 0)).toEqual(['2026-10-13T21:00']);
    expect(planDoseReminders([a, b], [logA, logB], now, 0)).toEqual([]);
  });

  it('ignores medications with reminders off or inactive', () => {
    const off = med('a', { type: 'daily', times: ['21:00'] }, { notify: false });
    const inactive = med('b', { type: 'daily', times: ['21:00'] }, { active: false });
    expect(planDoseReminders([off, inactive], [], now)).toEqual([]);
  });

  it('caps the number of scheduled reminders', () => {
    const many = med('a', { type: 'daily', times: ['00:00', '06:00', '12:00', '18:00'] });
    expect(planDoseReminders([many], [], now, 30, 10)).toHaveLength(10);
  });
});
