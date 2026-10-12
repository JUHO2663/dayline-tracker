import { describe, expect, it } from 'vitest';
import { labResultId, type LabItem, type LabResult, type LabSession } from '../../db/types';
import {
  findItemByName,
  formatLabValue,
  latestByItem,
  parseLabValue,
  planItemDelete,
  planSessionSave,
  seriesByUnit,
  type ResultRow,
} from './labs';

const NOW = '2026-10-13T00:00:00.000Z';
const item = (id: string, name: string, sortOrder = 0): LabItem => ({ id, name, sortOrder, createdAt: NOW });
const session = (id: string, date: string): LabSession => ({ id, date, createdAt: NOW });
const result = (sessionId: string, itemId: string, value: number, unit = 'u'): LabResult => ({
  id: labResultId(sessionId, itemId),
  sessionId,
  itemId,
  value,
  unit,
});
const row = (r: Partial<ResultRow>): ResultRow => ({
  key: crypto.randomUUID(),
  itemId: null,
  newItemName: '',
  value: '',
  unit: '',
  ...r,
});

describe('parseLabValue', () => {
  it('accepts plain, decimal-comma and comparator values', () => {
    expect(parseLabValue('120')).toEqual({ value: 120 });
    expect(parseLabValue(' 1,5 ')).toEqual({ value: 1.5 });
    expect(parseLabValue('<20')).toEqual({ value: 20, comparator: '<' });
    expect(parseLabValue('> 1000')).toEqual({ value: 1000, comparator: '>' });
    expect(parseLabValue('.5')).toEqual({ value: 0.5 });
  });

  it('rejects non-numbers', () => {
    for (const bad of ['', 'abc', '1.2.3', '<', '12 pg', '1e5']) expect(parseLabValue(bad)).toBeNull();
  });

  it('formats back', () => {
    expect(formatLabValue({ value: 20, comparator: '<' })).toBe('<20');
    expect(formatLabValue({ value: 1.5 })).toBe('1.5');
  });
});

describe('series and latest', () => {
  const sessions = [session('s1', '2026-01-10'), session('s2', '2026-04-10'), session('s3', '2026-07-10')];
  const results = [
    result('s1', 'e', 50, 'pg/mL'),
    result('s2', 'e', 180, 'pmol/L'),
    result('s3', 'e', 90, 'pg/mL'),
    result('s3', 't', 1),
  ];

  it('splits by unit without converting, most recent unit first', () => {
    const series = seriesByUnit('e', sessions, results, '2026-01-01', '2026-12-31');
    expect(series.map((s) => [s.unit, s.points.map((p) => p.value)])).toEqual([
      ['pg/mL', [50, 90]],
      ['pmol/L', [180]],
    ]);
  });

  it('filters by date range', () => {
    const series = seriesByUnit('e', sessions, results, '2026-03-01', '2026-06-30');
    expect(series).toEqual([{ unit: 'pmol/L', points: [{ date: '2026-04-10', value: 180, sessionId: 's2' }] }]);
  });

  it('finds the latest value and count per item', () => {
    const latest = latestByItem(sessions, results);
    expect(latest.get('e')).toMatchObject({ count: 3, session: { id: 's3' }, result: { value: 90 } });
    expect(latest.get('t')).toMatchObject({ count: 1 });
  });

  it('matches item names case-insensitively', () => {
    expect(findItemByName([item('a', 'Estradiol')], '  estradiol ')?.id).toBe('a');
  });
});

describe('planItemDelete', () => {
  it('removes the item results and sessions left empty', () => {
    const sessions = [session('s1', '2026-01-01'), session('s2', '2026-02-01')];
    const results = [result('s1', 'a', 1), result('s1', 'b', 2), result('s2', 'a', 3)];
    expect(planItemDelete('a', sessions, results)).toEqual({
      resultIds: [labResultId('s1', 'a'), labResultId('s2', 'a')],
      sessionIds: ['s2'],
    });
  });
});

describe('planSessionSave', () => {
  const items = [item('a', 'Item A', 0), item('b', 'Item B', 1)];

  it('creates new items, skips empty rows, and parses comparators', () => {
    const plan = planSessionSave(
      {
        date: '2026-10-13',
        memo: '  ',
        rows: [
          row({ itemId: 'a', value: '<20', unit: 'pg/mL' }),
          row({ itemId: 'b', value: '', unit: 'x' }),
          row({ newItemName: 'New one', value: '3.2', unit: 'ng/dL' }),
          row({ newItemName: 'item a ', value: '', unit: '' }),
        ],
      },
      items,
      [],
    );
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.session).not.toHaveProperty('memo');
    expect(plan.newItems).toMatchObject([{ name: 'New one', sortOrder: 2, defaultUnit: 'ng/dL' }]);
    expect(plan.results.map((r) => [r.itemId === 'a' ? 'a' : 'new', r.value, r.comparator ?? null])).toEqual([
      ['a', 20, '<'],
      ['new', 3.2, null],
    ]);
  });

  it('reuses an existing item typed as a new name', () => {
    const plan = planSessionSave(
      { date: '2026-10-13', memo: '', rows: [row({ newItemName: 'ITEM B', value: '1', unit: 'u' })] },
      items,
      [],
    );
    expect(plan.ok && plan.newItems).toEqual([]);
    expect(plan.ok && plan.results[0]!.itemId).toBe('b');
  });

  it('rejects invalid input', () => {
    const plan = (rows: ResultRow[]) => planSessionSave({ date: '2026-10-13', memo: '', rows }, items, []);
    expect(plan([])).toMatchObject({ ok: false });
    expect(plan([row({ value: '1', unit: 'u' })])).toMatchObject({ ok: false });
    expect(plan([row({ itemId: 'a', value: 'abc', unit: 'u' })])).toMatchObject({ ok: false });
    expect(plan([row({ itemId: 'a', value: '1', unit: ' ' })])).toMatchObject({ ok: false });
    expect(
      plan([row({ itemId: 'a', value: '1', unit: 'u' }), row({ newItemName: 'item a', value: '2', unit: 'u' })]),
    ).toMatchObject({ ok: false });
  });

  it('removes results that were cleared when editing', () => {
    const existing = session('s1', '2026-10-01');
    const before = [result('s1', 'a', 1), result('s1', 'b', 2), result('other', 'a', 3)];
    const plan = planSessionSave(
      { session: existing, date: '2026-10-02', memo: 'note', rows: [row({ itemId: 'a', value: '5', unit: 'u' })] },
      items,
      before,
    );
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.session).toMatchObject({ id: 's1', date: '2026-10-02', memo: 'note' });
    expect(plan.removedResultIds).toEqual([labResultId('s1', 'b')]);
  });
});
