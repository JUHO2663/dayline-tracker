import type {
  LocalDate,
  Medication,
  MedicationForm,
  Schedule,
  SchedulePeriod,
} from '../../db/types';
import { addDays } from '../../utils/time';
import { sameSchedule } from './schedule';

/** What the edit form controls. */
export interface MedicationFields {
  name: string;
  form: MedicationForm;
  dose: number;
  unit: string;
  schedule: Schedule;
  startDate: LocalDate;
  endDate?: LocalDate;
  notify: boolean;
  memo?: string;
}

/**
 * When the schedule changes after it already applied to past days:
 * - keep:  past days stay evaluated with the old schedule (its check-offs and misses stay meaningful)
 * - reset: the caller deletes this medication's logs and tracking restarts today
 */
export type ScheduleChangeMode = 'keep' | 'reset';

function applyFields(med: Medication, fields: MedicationFields, now: Date): Medication {
  const next: Medication = {
    ...med,
    name: fields.name,
    form: fields.form,
    dose: fields.dose,
    unit: fields.unit,
    schedule: fields.schedule,
    startDate: fields.startDate,
    notify: fields.notify,
    updatedAt: now.toISOString(),
  };
  if (fields.endDate) next.endDate = fields.endDate;
  else delete next.endDate;
  if (fields.memo) next.memo = fields.memo;
  else delete next.memo;
  return next;
}

/** Appends the current schedule as a history period ending on `until`, if that period is non-empty. */
function closeCurrent(med: Medication, until: LocalDate): SchedulePeriod[] {
  const end =
    med.inactiveFrom !== undefined && addDays(med.inactiveFrom, -1) < until
      ? addDays(med.inactiveFrom, -1)
      : until;
  return med.scheduleFrom <= end
    ? [...med.scheduleHistory, { from: med.scheduleFrom, to: end, schedule: med.schedule }]
    : [...med.scheduleHistory];
}

/** Keeps the earliest period starting at startDate when the start date moves earlier. */
function stretchToStart(med: Medication): Medication {
  const [first, ...rest] = med.scheduleHistory;
  if (first === undefined) return { ...med, scheduleFrom: med.startDate };
  if (med.startDate < first.from) {
    return { ...med, scheduleHistory: [{ ...first, from: med.startDate }, ...rest] };
  }
  return med;
}

export function createMedication(fields: MedicationFields, now = new Date()): Medication {
  const ts = now.toISOString();
  const med: Medication = {
    id: crypto.randomUUID(),
    name: fields.name,
    form: fields.form,
    dose: fields.dose,
    unit: fields.unit,
    schedule: fields.schedule,
    scheduleFrom: fields.startDate,
    scheduleHistory: [],
    startDate: fields.startDate,
    notify: fields.notify,
    active: true,
    createdAt: ts,
    updatedAt: ts,
  };
  if (fields.endDate) med.endDate = fields.endDate;
  if (fields.memo) med.memo = fields.memo;
  return med;
}

/** True when saving would change the schedule for days that already passed, so the user must choose keep/reset. */
export function needsScheduleDecision(
  med: Medication,
  fields: MedicationFields,
  today: LocalDate,
): boolean {
  return !sameSchedule(med.schedule, fields.schedule) && med.scheduleFrom < today;
}

export function updateMedication(
  med: Medication,
  fields: MedicationFields,
  today: LocalDate,
  mode?: ScheduleChangeMode,
  now = new Date(),
): Medication {
  if (!needsScheduleDecision(med, fields, today)) {
    return stretchToStart(applyFields(med, fields, now));
  }
  if (mode === undefined) throw new Error('A schedule change mode is required');

  if (mode === 'keep') {
    const history = closeCurrent(med, addDays(today, -1));
    return stretchToStart({
      ...applyFields(med, fields, now),
      scheduleHistory: history,
      scheduleFrom: today,
    });
  }

  const startDate = fields.startDate > today ? fields.startDate : today;
  return {
    ...applyFields(med, { ...fields, startDate }, now),
    scheduleHistory: [],
    scheduleFrom: startDate,
  };
}

/** Stops scheduling from today. Past days are unaffected. */
export function deactivate(med: Medication, today: LocalDate, now = new Date()): Medication {
  return { ...med, active: false, inactiveFrom: today, updatedAt: now.toISOString() };
}

/** Resumes from today; the inactive stretch is recorded as a pause so it never counts as missed. */
export function reactivate(med: Medication, today: LocalDate, now = new Date()): Medication {
  const pauseStart = med.inactiveFrom ?? today;
  const history = closeCurrent(med, addDays(today, -1));
  if (pauseStart <= addDays(today, -1)) {
    history.push({ from: pauseStart, to: addDays(today, -1), schedule: null });
  }
  const next: Medication = {
    ...med,
    active: true,
    scheduleHistory: history,
    scheduleFrom: today,
    updatedAt: now.toISOString(),
  };
  delete next.inactiveFrom;
  return next;
}
