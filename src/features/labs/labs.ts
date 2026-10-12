import {
  labResultId,
  type LabComparator,
  type LabItem,
  type LabResult,
  type LabSession,
  type LocalDate,
} from '../../db/types';

// Records what the user enters and nothing more: no reference ranges, no
// "normal/abnormal" flags, no unit conversion, no interpretation.

export interface LabValue {
  value: number;
  comparator?: LabComparator;
}

/** Accepts "120", "1.5", "1,5", "<20", "> 1000". Returns null if not a number. */
export function parseLabValue(input: string): LabValue | null {
  const m = input
    .trim()
    .replace(',', '.')
    .match(/^([<>])?\s*(-?\d+(?:\.\d+)?|-?\.\d+)$/);
  if (!m) return null;
  const value = Number(m[2]);
  if (!Number.isFinite(value)) return null;
  return m[1] ? { value, comparator: m[1] as LabComparator } : { value };
}

export function formatLabValue(v: LabValue): string {
  return `${v.comparator ?? ''}${v.value}`;
}

const normalize = (name: string) => name.trim().toLocaleLowerCase();

export function findItemByName(items: LabItem[], name: string): LabItem | undefined {
  const key = normalize(name);
  return items.find((i) => normalize(i.name) === key);
}

export function sortItems(items: LabItem[]): LabItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function sortSessions(sessions: LabSession[]): LabSession[] {
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export interface SeriesPoint extends LabValue {
  date: LocalDate;
  sessionId: string;
}

export interface UnitSeries {
  unit: string;
  /** Oldest first. */
  points: SeriesPoint[];
}

/**
 * Values of one item between `from` and `to`, split by unit (never converted).
 * The unit with the most recent value comes first.
 */
export function seriesByUnit(
  itemId: string,
  sessions: LabSession[],
  results: LabResult[],
  from: LocalDate,
  to: LocalDate,
): UnitSeries[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const byUnit = new Map<string, SeriesPoint[]>();
  for (const r of results) {
    if (r.itemId !== itemId) continue;
    const s = sessionById.get(r.sessionId);
    if (!s || s.date < from || s.date > to) continue;
    const point: SeriesPoint = { date: s.date, value: r.value, sessionId: s.id };
    if (r.comparator) point.comparator = r.comparator;
    const list = byUnit.get(r.unit) ?? [];
    list.push(point);
    byUnit.set(r.unit, list);
  }
  return [...byUnit.entries()]
    .map(([unit, points]) => ({ unit, points: points.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.points.at(-1)!.date.localeCompare(a.points.at(-1)!.date));
}

export interface Latest {
  result: LabResult;
  session: LabSession;
  count: number;
}

/** Most recent value of each item, plus how many values it has. */
export function latestByItem(sessions: LabSession[], results: LabResult[]): Map<string, Latest> {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const out = new Map<string, Latest>();
  for (const result of results) {
    const session = sessionById.get(result.sessionId);
    if (!session) continue;
    const prev = out.get(result.itemId);
    const count = (prev?.count ?? 0) + 1;
    if (!prev || session.date > prev.session.date) out.set(result.itemId, { result, session, count });
    else prev.count = count;
  }
  return out;
}

/** The unit last used for an item, falling back to its default. */
export function lastUnitFor(item: LabItem, sessions: LabSession[], results: LabResult[]): string {
  return latestByItem(sessions, results).get(item.id)?.result.unit ?? item.defaultUnit ?? '';
}

/** Deleting an item removes its results, and any session left with no results. */
export function planItemDelete(
  itemId: string,
  sessions: LabSession[],
  results: LabResult[],
): { resultIds: string[]; sessionIds: string[] } {
  const resultIds = results.filter((r) => r.itemId === itemId).map((r) => r.id);
  const sessionIds = sessions
    .filter((s) => {
      const own = results.filter((r) => r.sessionId === s.id);
      return own.length > 0 && own.every((r) => r.itemId === itemId);
    })
    .map((s) => s.id);
  return { resultIds, sessionIds };
}

// ---------- Saving a session ----------

/** One editable row in the session form. itemId null = create an item named `newItemName`. */
export interface ResultRow {
  key: string;
  itemId: string | null;
  newItemName: string;
  value: string;
  unit: string;
}

export interface SessionInput {
  /** Existing session when editing. */
  session?: LabSession;
  date: LocalDate;
  memo: string;
  rows: ResultRow[];
}

export type SessionPlan =
  | {
      ok: true;
      session: LabSession;
      newItems: LabItem[];
      results: LabResult[];
      removedResultIds: string[];
    }
  | { ok: false; error: string };

/**
 * Validates the form and works out every write. Rows without a value are ignored,
 * so a prefilled list of items can be partly filled in.
 */
export function planSessionSave(
  input: SessionInput,
  items: LabItem[],
  existingResults: LabResult[],
  now = new Date(),
): SessionPlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: '날짜를 넣어 주세요.' };

  const session: LabSession = input.session
    ? { ...input.session, date: input.date }
    : { id: crypto.randomUUID(), date: input.date, createdAt: now.toISOString() };
  const memo = input.memo.trim();
  if (memo) session.memo = memo;
  else delete session.memo;

  const known = [...items];
  const newItems: LabItem[] = [];
  const results: LabResult[] = [];
  const seen = new Set<string>();
  let nextOrder = Math.max(-1, ...items.map((i) => i.sortOrder)) + 1;

  for (const row of input.rows) {
    if (!row.value.trim()) continue;

    let item = row.itemId ? known.find((i) => i.id === row.itemId) : undefined;
    if (!item) {
      const name = row.newItemName.trim();
      if (!name) return { ok: false, error: '값을 넣은 줄의 항목을 골라 주세요.' };
      item = findItemByName(known, name);
      if (!item) {
        item = {
          id: crypto.randomUUID(),
          name,
          sortOrder: nextOrder++,
          createdAt: now.toISOString(),
        };
        if (row.unit.trim()) item.defaultUnit = row.unit.trim();
        known.push(item);
        newItems.push(item);
      }
    }

    const parsed = parseLabValue(row.value);
    if (!parsed) return { ok: false, error: `'${item.name}' 값을 숫자로 넣어 주세요. (예: 120, 1.5, <20)` };
    const unit = row.unit.trim();
    if (!unit) return { ok: false, error: `'${item.name}'의 단위를 넣어 주세요.` };
    if (seen.has(item.id)) return { ok: false, error: `'${item.name}'이(가) 두 번 들어 있어요.` };
    seen.add(item.id);

    const result: LabResult = {
      id: labResultId(session.id, item.id),
      sessionId: session.id,
      itemId: item.id,
      value: parsed.value,
      unit,
    };
    if (parsed.comparator) result.comparator = parsed.comparator;
    results.push(result);
  }

  if (results.length === 0) return { ok: false, error: '값을 하나 이상 넣어 주세요.' };

  const keep = new Set(results.map((r) => r.id));
  const removedResultIds = existingResults
    .filter((r) => r.sessionId === session.id && !keep.has(r.id))
    .map((r) => r.id);

  return { ok: true, session, newItems, results, removedResultIds };
}
