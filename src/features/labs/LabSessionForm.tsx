import { useState } from 'react';
import { useDb } from '../../app/DbContext';
import type { LabItem, LabResult, LabSession } from '../../db/types';
import { today } from '../../utils/time';
import { formatLabValue, lastUnitFor, planSessionSave, sortItems, sortSessions, type ResultRow } from './labs';

const NEW_ITEM = '__new__';

const UNIT_SUGGESTIONS = ['pg/mL', 'pmol/L', 'ng/dL', 'nmol/L', 'ng/mL', 'mIU/mL', 'IU/L', 'U/L', 'mg/dL', 'g/dL', 'mmol/L', '%'];

interface Props {
  session?: LabSession;
  items: LabItem[];
  sessions: LabSession[];
  results: LabResult[];
  onDone: (saved?: LabSession) => void;
  onDeleted: () => void;
}

/** isNew: the row creates a new item (shows a name field). */
type FormRow = ResultRow & { isNew: boolean };

const blankRow = (isNew: boolean): FormRow => ({
  key: crypto.randomUUID(),
  itemId: null,
  newItemName: '',
  value: '',
  unit: '',
  isNew,
});

function initialRows(props: Props): FormRow[] {
  const { session, items, sessions, results } = props;
  if (session) {
    return results
      .filter((r) => r.sessionId === session.id)
      .map((r) => ({
        key: r.id,
        itemId: r.itemId,
        newItemName: '',
        value: formatLabValue(r),
        unit: r.unit,
        isNew: false,
      }))
      .sort((a, b) => {
        const order = (id: string | null) => items.find((i) => i.id === id)?.sortOrder ?? 0;
        return order(a.itemId) - order(b.itemId);
      });
  }
  // New session: offer the items from the most recent one, values left blank.
  const previous = sortSessions(sessions)[0];
  const rows = previous
    ? sortItems(items)
        .filter((i) => results.some((r) => r.sessionId === previous.id && r.itemId === i.id))
        .map((i) => ({ ...blankRow(false), itemId: i.id, unit: lastUnitFor(i, sessions, results) }))
    : [];
  return rows.length > 0 ? rows : [blankRow(items.length === 0)];
}

export function LabSessionForm(props: Props) {
  const { session, items, sessions, results, onDone, onDeleted } = props;
  const { db } = useDb();
  const [date, setDate] = useState(session?.date ?? today());
  const [memo, setMemo] = useState(session?.memo ?? '');
  const [rows, setRows] = useState<FormRow[]>(() => initialRows(props));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sorted = sortItems(items);
  const newRow = () => blankRow(items.length === 0);

  const update = (key: string, patch: Partial<FormRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function chooseItem(row: FormRow, value: string) {
    if (value === NEW_ITEM) {
      update(row.key, { itemId: null, isNew: true });
      return;
    }
    const item = items.find((i) => i.id === value);
    update(row.key, {
      itemId: value,
      newItemName: '',
      isNew: false,
      unit: row.unit || (item ? lastUnitFor(item, sessions, results) : ''),
    });
  }

  async function save() {
    const plan = planSessionSave({ session, date, memo, rows }, items, results);
    if (!plan.ok) {
      setError(plan.error);
      return;
    }
    setSaving(true);
    try {
      await db.batch((b) => {
        b.put('lab_sessions', plan.session);
        b.put('lab_items', ...plan.newItems);
        b.put('lab_results', ...plan.results);
        b.remove('lab_results', ...plan.removedResultIds);
      });
      onDone(plan.session);
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!session) return;
    if (!confirm('이 검사 기록을 삭제할까요? 들어 있는 값도 모두 지워져요.')) return;
    await db.removeCascade('lab_sessions', session.id);
    onDeleted();
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={() => onDone()}>
          ← 뒤로
        </button>
        <h2>{session ? '검사 기록 수정' : '새 검사 기록'}</h2>
      </div>

      <label className="field">
        <span>검사 날짜</span>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>결과</legend>
        <p className="muted small-text">값을 비워 둔 줄은 저장하지 않아요. &lt;20처럼 부등호도 쓸 수 있어요.</p>
        <ul className="result-rows">
          {rows.map((row, i) => (
            <li key={row.key} className="result-row">
              <select
                aria-label={`${i + 1}번째 항목`}
                value={row.itemId ?? (row.isNew ? NEW_ITEM : '')}
                onChange={(e) => chooseItem(row, e.target.value)}
              >
                <option value="" disabled>
                  항목 선택
                </option>
                {sorted.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                <option value={NEW_ITEM}>+ 새 항목</option>
              </select>
              {row.isNew && (
                <input
                  aria-label={`${i + 1}번째 새 항목 이름`}
                  placeholder="새 항목 이름"
                  value={row.newItemName}
                  maxLength={40}
                  onChange={(e) => update(row.key, { newItemName: e.target.value })}
                />
              )}
              <div className="result-values">
                <input
                  aria-label={`${i + 1}번째 값`}
                  placeholder="값"
                  inputMode="decimal"
                  value={row.value}
                  onChange={(e) => update(row.key, { value: e.target.value })}
                />
                <input
                  aria-label={`${i + 1}번째 단위`}
                  placeholder="단위"
                  list="lab-units"
                  value={row.unit}
                  maxLength={20}
                  onChange={(e) => update(row.key, { unit: e.target.value })}
                />
                <button
                  type="button"
                  className="ghost small"
                  aria-label={`${i + 1}번째 줄 삭제`}
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : [newRow()]))}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
        <datalist id="lab-units">
          {[...new Set([...results.map((r) => r.unit), ...UNIT_SUGGESTIONS])].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button type="button" className="ghost" onClick={() => setRows((rs) => [...rs, newRow()])}>
          + 줄 추가
        </button>
      </fieldset>

      <label className="field">
        <span>메모 (선택)</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={1000} />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
        저장
      </button>

      {session && (
        <div className="danger-zone">
          <span />
          <button type="button" className="danger" onClick={() => void remove()}>
            기록 삭제
          </button>
        </div>
      )}
    </div>
  );
}
