import { useState } from 'react';
import { useDb } from '../../app/DbContext';
import { MONTH_PRESETS, PeriodPicker, resolvePeriod, usePeriod } from '../../components/PeriodPicker';
import type { LabItem, LabResult, LabSession } from '../../db/types';
import { formatDate, today } from '../../utils/time';
import { findItemByName, formatLabValue, planItemDelete, seriesByUnit } from './labs';
import { TrendChart } from './TrendChart';

interface Props {
  item: LabItem;
  items: LabItem[];
  sessions: LabSession[];
  results: LabResult[];
  onBack: () => void;
  onOpenSession: (id: string) => void;
  onDeleted: () => void;
}

export function LabItemDetail({ item, items, sessions, results, onBack, onOpenSession, onDeleted }: Props) {
  const todayDate = today();
  const [period, setPeriod] = usePeriod(todayDate, 'all');
  const { from, to } = resolvePeriod(period, todayDate);
  const series = seriesByUnit(item.id, sessions, results, from, to);

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← 뒤로
        </button>
        <h2>{item.name}</h2>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} end={todayDate} presets={MONTH_PRESETS} />

      {series.length === 0 && <p className="muted">이 기간에는 기록이 없어요.</p>}
      {series.length > 1 && (
        <p className="muted small-text">단위가 다른 값은 따로 보여줘요. 단위는 변환하지 않아요.</p>
      )}

      {series.map(({ unit, points }) => (
        <section key={unit} className="section">
          <h3 className="unit-heading">{unit}</h3>
          <TrendChart title={item.name} unit={unit} points={points} />
          <ul className="list">
            {[...points].reverse().map((p) => (
              <li key={p.sessionId}>
                <button type="button" className="row" onClick={() => onOpenSession(p.sessionId)}>
                  <span className="row-main">{formatDate(p.date, true)}</span>
                  <strong className="value">
                    {formatLabValue(p)} <span className="muted">{unit}</span>
                  </strong>
                  <span aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ItemSettings item={item} items={items} sessions={sessions} results={results} onDeleted={onDeleted} />
    </div>
  );
}

interface SettingsProps {
  item: LabItem;
  items: LabItem[];
  sessions: LabSession[];
  results: LabResult[];
  onDeleted: () => void;
}

function ItemSettings({ item, items, sessions, results, onDeleted }: SettingsProps) {
  const { db } = useDb();
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.defaultUnit ?? '');
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setMessage('이름을 넣어 주세요.');
    const clash = findItemByName(items, trimmed);
    if (clash && clash.id !== item.id) return setMessage('같은 이름의 항목이 이미 있어요.');
    const next: LabItem = { ...item, name: trimmed };
    if (unit.trim()) next.defaultUnit = unit.trim();
    else delete next.defaultUnit;
    await db.put('lab_items', next);
    setMessage('저장했어요.');
  }

  async function remove() {
    const plan = planItemDelete(item.id, sessions, results);
    const total = plan.resultIds.length;
    const msg =
      total > 0
        ? `'${item.name}' 항목과 기록된 값 ${total}개를 모두 삭제할까요?`
        : `'${item.name}' 항목을 삭제할까요?`;
    if (!confirm(msg)) return;
    await db.batch((b) => {
      b.remove('lab_items', item.id);
      b.remove('lab_results', ...plan.resultIds);
      b.remove('lab_sessions', ...plan.sessionIds);
    });
    onDeleted();
  }

  return (
    <details className="settings-panel">
      <summary>항목 관리</summary>
      <label className="field">
        <span>이름</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>기본 단위</span>
        <input value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
      </label>
      {message && (
        <p className="muted small-text" role="status">
          {message}
        </p>
      )}
      <div className="danger-zone">
        <button type="button" onClick={() => void save()}>
          저장
        </button>
        <button type="button" className="danger" onClick={() => void remove()}>
          항목 삭제
        </button>
      </div>
    </details>
  );
}
