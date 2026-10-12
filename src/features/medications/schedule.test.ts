import { describe, expect, it } from 'vitest';
import { describeSchedule, occurrencesBetween, occurrencesOn, validateSchedule } from './schedule';
import { med } from './testUtils';

describe('occurrences', () => {
  it('daily: every time, sorted and de-duplicated', () => {
    const m = med('a', { type: 'daily', times: ['21:00', '09:00', '09:00'] });
    expect(occurrencesOn(m, '2026-10-13')).toEqual(['2026-10-13T09:00', '2026-10-13T21:00']);
  });

  it('weekly: only on chosen weekdays', () => {
    const m = med('a', { type: 'weekly', weekdays: [1, 4], times: ['08:00'] });
    expect(occurrencesOn(m, '2026-10-12')).toEqual(['2026-10-12T08:00']); // Mon
    expect(occurrencesOn(m, '2026-10-13')).toEqual([]); // Tue
    expect(occurrencesOn(m, '2026-10-15')).toEqual(['2026-10-15T08:00']); // Thu
  });

  it('interval: counted from the start date', () => {
    const m = med('a', { type: 'interval', everyDays: 7, times: ['10:00'] }, { startDate: '2026-10-01' });
    expect(occurrencesBetween(m, '2026-09-20', '2026-10-20')).toEqual([
      '2026-10-01T10:00',
      '2026-10-08T10:00',
      '2026-10-15T10:00',
    ]);
  });

  it('respects start, end and active', () => {
    const m = med('a', { type: 'daily', times: ['09:00'] }, { startDate: '2026-10-10', endDate: '2026-10-11' });
    expect(occurrencesBetween(m, '2026-10-08', '2026-10-13')).toEqual([
      '2026-10-10T09:00',
      '2026-10-11T09:00',
    ]);
    expect(occurrencesOn({ ...m, active: false }, '2026-10-10')).toEqual([]);
  });
});

describe('describeSchedule', () => {
  it('summarizes each type', () => {
    expect(describeSchedule({ type: 'daily', times: ['21:00', '09:00'] })).toBe('매일 09:00, 21:00');
    expect(describeSchedule({ type: 'weekly', weekdays: [4, 1], times: ['08:00'] })).toBe('월·목 08:00');
    expect(describeSchedule({ type: 'interval', everyDays: 7, times: ['10:00'] })).toBe('7일마다 10:00');
  });
});

describe('validateSchedule', () => {
  it('rejects empty and out-of-range schedules', () => {
    expect(validateSchedule({ type: 'daily', times: [] })).not.toBeNull();
    expect(validateSchedule({ type: 'weekly', weekdays: [], times: ['09:00'] })).not.toBeNull();
    expect(validateSchedule({ type: 'interval', everyDays: 1, times: ['09:00'] })).not.toBeNull();
    expect(validateSchedule({ type: 'interval', everyDays: 2.5, times: ['09:00'] })).not.toBeNull();
    expect(validateSchedule({ type: 'interval', everyDays: 14, times: ['09:00'] })).toBeNull();
  });
});
