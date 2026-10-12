import { doseLogId, type DoseLog, type LocalDateTime, type Medication } from '../../db/types';
import { addDays, toLocalDateTime, today } from '../../utils/time';
import { occurrencesBetween } from './schedule';

/** How far ahead notifications are scheduled. Re-planned on every unlock and change. */
export const HORIZON_DAYS = 14;
/** Keeps well under Android's per-app alarm limit (~500). */
export const MAX_SCHEDULED = 60;

/**
 * Returns the future times that need a reminder.
 *
 * One reminder per time slot, even if several medications share it — the
 * notification never says what or how many. A slot is skipped once every
 * medication in it has been checked or skipped.
 */
export function planDoseReminders(
  meds: Medication[],
  logs: DoseLog[],
  now: Date,
  horizonDays = HORIZON_DAYS,
  max = MAX_SCHEDULED,
): LocalDateTime[] {
  const logged = new Set(logs.map((l) => l.id));
  const nowDt = toLocalDateTime(now);
  const from = today(now);
  const to = addDays(from, horizonDays);
  const slots = new Set<LocalDateTime>();

  for (const med of meds) {
    if (!med.notify) continue;
    for (const at of occurrencesBetween(med, from, to)) {
      if (at > nowDt && !logged.has(doseLogId(med.id, at))) slots.add(at);
    }
  }
  return [...slots].sort().slice(0, max);
}
