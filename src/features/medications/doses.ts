import type { Database } from '../../db';
import {
  doseLogId,
  type DoseLog,
  type DoseStatus,
  type LocalDate,
  type LocalDateTime,
  type Medication,
} from '../../db/types';
import { datePart, toLocalDateTime, today } from '../../utils/time';
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
 * Occurrences between `from` and `to` (inclusive) that were never checked or skipped.
 * Missed doses are derived, never stored. Newest first.
 */
export function findMissed(
  meds: Medication[],
  logs: DoseLog[],
  from: LocalDate,
  to: LocalDate,
): DoseItem[] {
  const byId = indexLogs(logs);
  return meds
    .flatMap((med) =>
      occurrencesBetween(med, from, to)
        .filter((at) => !byId.has(doseLogId(med.id, at)))
        .map((scheduledAt) => ({ med, scheduledAt })),
    )
    .sort((a, b) => -byTimeThenName(a, b));
}

/**
 * - taken / skipped: logged
 * - missed: unlogged, on an earlier day
 * - overdue: unlogged, earlier today
 * - upcoming: later today
 */
export type HistoryStatus = DoseStatus | 'missed' | 'overdue' | 'upcoming';

export interface HistoryEntry {
  scheduledAt: LocalDateTime;
  status: HistoryStatus;
  log?: DoseLog;
}

/**
 * One medication's record for a period, newest first. Includes logs that no longer
 * match the schedule (e.g. a time that was changed later), so nothing checked is hidden.
 */
export function medicationHistory(
  med: Medication,
  logs: DoseLog[],
  from: LocalDate,
  to: LocalDate,
  now = new Date(),
): HistoryEntry[] {
  const todayDate = today(now);
  const nowDt = toLocalDateTime(now);
  const last = to < todayDate ? to : todayDate;
  const own = logs.filter((l) => l.medicationId === med.id);
  const byAt = new Map(own.map((l) => [l.scheduledAt, l]));

  const entries = new Map<LocalDateTime, HistoryEntry>();
  for (const at of occurrencesBetween(med, from, last)) {
    const log = byAt.get(at);
    const status: HistoryStatus = log
      ? log.status
      : datePart(at) < todayDate
        ? 'missed'
        : at < nowDt
          ? 'overdue'
          : 'upcoming';
    entries.set(at, log ? { scheduledAt: at, status, log } : { scheduledAt: at, status });
  }
  for (const log of own) {
    const d = datePart(log.scheduledAt);
    if (d >= from && d <= last && !entries.has(log.scheduledAt)) {
      entries.set(log.scheduledAt, { scheduledAt: log.scheduledAt, status: log.status, log });
    }
  }
  return [...entries.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export function countByStatus(entries: HistoryEntry[]): Record<HistoryStatus, number> {
  const counts: Record<HistoryStatus, number> = {
    taken: 0,
    skipped: 0,
    missed: 0,
    overdue: 0,
    upcoming: 0,
  };
  for (const e of entries) counts[e.status]++;
  return counts;
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
