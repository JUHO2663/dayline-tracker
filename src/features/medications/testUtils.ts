import type { Medication, Schedule } from '../../db/types';

export function med(id: string, schedule: Schedule, overrides: Partial<Medication> = {}): Medication {
  const startDate = overrides.startDate ?? '2026-10-01';
  return {
    id,
    name: `Item ${id}`,
    form: 'pill',
    dose: 1,
    unit: 'mg',
    schedule,
    scheduleFrom: startDate,
    scheduleHistory: [],
    startDate,
    notify: true,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}
