import type { Database } from '../../db';
import {
  doseLogId,
  type DoseLog,
  type DoseStatus,
  type LocalDate,
  type LocalDateTime,
  type Medication,
} from '../../db/types';
import { addDays, datePart, toLocalDateTime, today } from '../../utils/time';
import { occurrencesBetween, occurrencesOn } from './schedule';

export interface DoseItem {
  med: Medication;
  scheduledAt: LocalDateTime;
  log?: DoseLog;
}

function byTimeThenName(a: DoseItem, b: DoseItem): number {
  return a.scheduledAt.localeCompare(b.scheduledAt) || a.med.name.localeCompare(b.med.name);
}

function indexLogs(logs: DoseLog[]): Map<string, DoseLog> {
  return new Map(logs.map((l) => [l.id, l]));
}

/** Everything scheduled on one date, with its log if checked. */
export function agendaFor(meds: Medication[], logs: DoseLog[], date: LocalDate): DoseItem[] {
  const byId = indexLogs(logs);
  return meds
    .flatMap((med) =>
      occurrencesOn(med, date).map((scheduledAt) => ({
        med,
        scheduledAt,
        log: byId.get(doseLogId(med.id, scheduledAt)),
      })),
    )
    .sort(byTimeThenName);
}

/**
 * Occurrences on the previous `days` days (not today) that were never checked or skipped.
 * Missed doses are derived, never stored. Newest first.
 */
export function findMissed(
  meds: Medication[],
  logs: DoseLog[],
  todayDate: LocalDate,
  days = 7,
): DoseItem[] {
  const byId = indexLogs(logs);
  const from = addDays(todayDate, -days);
  const to = addDays(todayDate, -1);
  return meds
    .flatMap((med) =>
      occurrencesBetween(med, from, to)
        .filter((at) => !byId.has(doseLogId(med.id, at)))
        .map((scheduledAt) => ({ med, scheduledAt })),
    )
    .sort((a, b) => -byTimeThenName(a, b));
}

/**
 * Builds a log entry. takenAt is recorded only when checking on the same day;
 * for earlier days the actual time is unknown, so it is left out.
 */
export function makeDoseLog(
  med: Medication,
  scheduledAt: LocalDateTime,
  status: DoseStatus,
  now = new Date(),
): DoseLog {
  const log: DoseLog = {
    id: doseLogId(med.id, scheduledAt),
    medicationId: med.id,
    scheduledAt,
    status,
    doseSnapshot: med.dose,
    unitSnapshot: med.unit,
    createdAt: now.toISOString(),
  };
  if (status === 'taken' && datePart(scheduledAt) === today(now)) {
    log.takenAt = toLocalDateTime(now);
  }
  return log;
}

export async function recordDose(
  db: Database,
  med: Medication,
  scheduledAt: LocalDateTime,
  status: DoseStatus,
): Promise<DoseLog> {
  const log = makeDoseLog(med, scheduledAt, status);
  await db.put('dose_logs', log);
  return log;
}

export async function undoDose(db: Database, log: DoseLog): Promise<void> {
  await db.remove('dose_logs', log.id);
}
