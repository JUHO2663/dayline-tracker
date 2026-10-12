import { describe, expect, it } from 'vitest';
import type { Schedule } from '../../db/types';
import {
  createMedication,
  deactivate,
  needsScheduleDecision,
  reactivate,
  updateMedication,
  type MedicationFields,
} from './medicationOps';
import { occurrencesBetween } from './schedule';

const AM: Schedule = { type: 'daily', times: ['09:00'] };
const PM: Schedule = { type: 'daily', times: ['21:00'] };

const fields = (schedule: Schedule, overrides: Partial<MedicationFields> = {}): MedicationFields => ({
  name: 'Sample',
  form: 'pill',
  dose: 1,
  unit: 'mg',
  schedule,
  startDate: '2026-10-01',
  notify: true,
  ...overrides,
});

describe('schedule changes', () => {
  const original = createMedication(fields(AM));

  it('asks only when the schedule changes after it already applied', () => {
    expect(needsScheduleDecision(original, fields(AM, { name: 'Renamed' }), '2026-10-13')).toBe(false);
    expect(needsScheduleDecision(original, fields(PM), '2026-10-13')).toBe(true);
    // Not started yet: nothing in the past to decide about.
    expect(needsScheduleDecision(original, fields(PM), '2026-10-01')).toBe(false);
  });

  it('keep: past days use the old schedule, from today the new one', () => {
    const next = updateMedication(original, fields(PM), '2026-10-13', 'keep');
    expect(next.scheduleFrom).toBe('2026-10-13');
    expect(next.scheduleHistory).toEqual([{ from: '2026-10-01', to: '2026-10-12', schedule: AM }]);
    expect(occurrencesBetween(next, '2026-10-12', '2026-10-13')).toEqual([
      '2026-10-12T09:00',
      '2026-10-13T21:00',
    ]);
  });

  it('reset: restarts tracking today with no past occurrences', () => {
    const kept = updateMedication(original, fields(PM), '2026-10-10', 'keep');
    const next = updateMedication(kept, fields(AM), '2026-10-13', 'reset');
    expect(next.scheduleHistory).toEqual([]);
    expect(next.startDate).toBe('2026-10-13');
    expect(occurrencesBetween(next, '2026-10-01', '2026-10-13')).toEqual(['2026-10-13T09:00']);
  });

  it('requires a mode when a decision is needed', () => {
    expect(() => updateMedication(original, fields(PM), '2026-10-13')).toThrow();
  });

  it('moving the start date earlier stretches the first period', () => {
    const kept = updateMedication(original, fields(PM), '2026-10-13', 'keep');
    const moved = updateMedication(kept, fields(PM, { startDate: '2026-09-28' }), '2026-10-14');
    expect(moved.scheduleHistory[0]!.from).toBe('2026-09-28');
    expect(occurrencesBetween(moved, '2026-09-28', '2026-09-28')).toEqual(['2026-09-28T09:00']);
  });

  it('clears an emptied end date and memo', () => {
    const withExtras = createMedication(fields(AM, { endDate: '2026-12-31', memo: 'note' }));
    const cleared = updateMedication(withExtras, fields(AM), '2026-10-13');
    expect(cleared).not.toHaveProperty('endDate');
    expect(cleared).not.toHaveProperty('memo');
  });
});

describe('deactivate / reactivate', () => {
  it('records the inactive stretch as a pause', () => {
    const off = deactivate(createMedication(fields(AM)), '2026-10-05');
    const on = reactivate(off, '2026-10-08');
    expect(on.active).toBe(true);
    expect(on).not.toHaveProperty('inactiveFrom');
    expect(occurrencesBetween(on, '2026-10-03', '2026-10-09')).toEqual([
      '2026-10-03T09:00',
      '2026-10-04T09:00',
      '2026-10-08T09:00',
      '2026-10-09T09:00',
    ]);
  });

  it('keeps the old schedule when it was changed while inactive', () => {
    const off = deactivate(createMedication(fields(AM)), '2026-10-05');
    const edited = updateMedication(off, fields(PM), '2026-10-06', 'keep');
    const on = reactivate(edited, '2026-10-08');
    expect(occurrencesBetween(on, '2026-10-04', '2026-10-08')).toEqual([
      '2026-10-04T09:00',
      '2026-10-08T21:00',
    ]);
  });
});
