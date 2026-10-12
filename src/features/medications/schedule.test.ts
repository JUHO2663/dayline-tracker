import { describe, expect, it } from 'vitest';
import type { Schedule } from '../../db/types';
import {
  describeSchedule,
  occurrencesBetween,
  occurrencesOn,
  sameSchedule,
  validateSchedule,
} from './schedule';
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

  it('interval: counted from the anchor, in both directions', () => {
    const m = med(
      'a',
      { type: 'interval', everyDays: 7, anchor: '2026-10-08', times: ['10:00'] },
      { startDate: '2026-09-25' },
    );
    expect(occurrencesBetween(m, '2026-09-20', '2026-10-20')).toEqual([
      '2026-10-01T10:00',
      '2026-10-08T10:00',
      '2026-10-15T10:00',
    ]);
  });

  it('respects start and end dates', () => {
    const m = med('a', { type: 'daily', times: ['09:00'] }, { startDate: '2026-10-10', endDate: '2026-10-11' });
    expect(occurrencesBetween(m, '2026-10-08', '2026-10-13')).toEqual([
      '2026-10-10T09:00',
      '2026-10-11T09:00',
    ]);
  });

  it('uses the schedule that applied on each date', () => {
    const m = med('a', { type: 'daily', times: ['21:00'] }, {
      startDate: '2026-10-01',
      scheduleFrom: '2026-10-05',
      scheduleHistory: [
        { from: '2026-10-01', to: '2026-10-02', schedule: { type: 'daily', times: ['09:00'] } },
        { from: '2026-10-03', to: '2026-10-04', schedule: null },
      ],
    });
    expect(occurrencesBetween(m, '2026-10-01', '2026-10-05')).toEqual([
      '2026-10-01T09:00',
      '2026-10-02T09:00',
      '2026-10-05T21:00',
    ]);
  });

  it('stops from inactiveFrom while inactive', () => {
    const m = med('a', { type: 'daily', times: ['09:00'] }, { active: false, inactiveFrom: '2026-10-03' });
    expect(occurrencesBetween(m, '2026-10-01', '2026-10-04')).toEqual([
      '2026-10-01T09:00',
      '2026-10-02T09:00',
    ]);
  });
});

describe('describeSchedule', () => {
  it('summarizes each type', () => {
    expect(describeSchedule({ type: 'daily', times: ['21:00', '09:00'] })).toBe('매일 09:00, 21:00');
    expect(describeSchedule({ type: 'weekly', weekdays: [4, 1], times: ['08:00'] })).toBe('월·목 08:00');
    expect(
      describeSchedule({ type: 'interval', everyDays: 7, anchor: '2026-10-01', times: ['10:00'] }),
    ).toBe('7일마다 10:00');
  });
});

describe('sameSchedule', () => {
  it('ignores ordering and duplicates', () => {
    expect(
      sameSchedule(
        { type: 'weekly', weekdays: [4, 1], times: ['21:00', '09:00'] },
        { type: 'weekly', weekdays: [1, 4], times: ['09:00', '21:00', '09:00'] },
      ),
    ).toBe(true);
    expect(sameSchedule({ type: 'daily', times: ['09:00'] }, { type: 'daily', times: ['10:00'] })).toBe(false);
    const every7 = (anchor: string): Schedule => ({ type: 'interval', everyDays: 7, anchor, times: ['09:00'] });
    expect(sameSchedule(every7('2026-10-01'), every7('2026-10-02'))).toBe(false);
    // Same cycle, different anchor: identical occurrences.
    expect(sameSchedule(every7('2026-09-22'), every7('2026-10-13'))).toBe(true);
    expect(sameSchedule(every7('2026-10-13'), every7('2026-09-22'))).toBe(true);
  });
});

describe('validateSchedule', () => {
  it('rejects empty and out-of-range schedules', () => {
    const interval = (everyDays: number): Schedule => ({
      type: 'interval',
      everyDays,
      anchor: '2026-10-01',
      times: ['09:00'],
    });
    expect(validateSchedule({ type: 'daily', times: [] })).not.toBeNull();
    expect(validateSchedule({ type: 'weekly', weekdays: [], times: ['09:00'] })).not.toBeNull();
    expect(validateSchedule(interval(1))).not.toBeNull();
    expect(validateSchedule(interval(2.5))).not.toBeNull();
    expect(validateSchedule(interval(14))).toBeNull();
  });
});
