import { useState } from 'react';
import { useTable } from '../../app/hooks';
import type { LabItem, LabResult, LabSession } from '../../db/types';
import { formatDate } from '../../utils/time';
import { LabItemDetail } from './LabItemDetail';
import { LabSessionForm } from './LabSessionForm';
import { formatLabValue, latestByItem, sortItems, sortSessions } from './labs';

type View =
  | { kind: 'overview' }
  | { kind: 'item'; id: string }
  | { kind: 'session'; id: string | null; back: View };

export function LabsScreen() {
  const items = useTable('lab_items');
  const sessions = useTable('lab_sessions');
  const results = useTable('lab_results');
  const [view, setView] = useState<View>({ kind: 'overview' });
  const overview: View = { kind: 'overview' };

  if (!items || !sessions || !results) return null;
  const data = { items, sessions, results };

  if (view.kind === 'session') {
    const session = view.id ? sessions.find((s) => s.id === view.id) : undefined;
    return (
      <LabSessionForm
        key={view.id ?? 'new'}
        session={session}
        {...data}
        onDone={() => setView(view.back)}
        onDeleted={() => setView(view.back)}
      />
    );
  }

  if (view.kind === 'item') {
    const item = items.find((i) => i.id === view.id);
    if (item) {
      return (
        <LabItemDetail
          item={item}
          {...data}
          onBack={() => setView(overview)}
          onOpenSession={(id) => setView({ kind: 'session', id, back: view })}
          onDeleted={() => setView(overview)}
        />
      );
    }
  }

  return (
    <Overview
      {...data}
      onAdd={() => setView({ kind: 'session', id: null, back: overview })}
      onOpenItem={(id) => setView({ kind: 'item', id })}
      onOpenSession={(id) => setView({ kind: 'session', id, back: overview })}
    />
  );
}

interface OverviewProps {
  items: LabItem[];
  sessions: LabSession[];
  results: LabResult[];
  onAdd: () => void;
  onOpenItem: (id: string) => void;
  onOpenSession: (id: string) => void;
}

function Overview({ items, sessions, results, onAdd, onOpenItem, onOpenSession }: OverviewProps) {
  const latest = latestByItem(sessions, results);
  const countBySession = new Map<string, number>();
  for (const r of results) countBySession.set(r.sessionId, (countBySession.get(r.sessionId) ?? 0) + 1);

  return (
    <div className="screen">
      <button type="button" className="primary" onClick={onAdd}>
        + 검사 기록 추가
      </button>

      <section className="section">
        <h2>항목별 추이</h2>
        {items.length === 0 ? (
          <p className="muted">검사 기록을 추가하면 항목별로 모아서 보여줘요.</p>
        ) : (
          <ul className="list">
            {sortItems(items).map((item) => {
              const l = latest.get(item.id);
              return (
                <li key={item.id}>
                  <button type="button" className="row" onClick={() => onOpenItem(item.id)}>
                    <span className="row-main">
                      <strong>{item.name}</strong>
                      <span className="muted">
                        {l ? `${formatDate(l.session.date, true)} · ${l.count}회` : '기록 없음'}
                      </span>
                    </span>
                    {l && (
                      <span className="value">
                        {formatLabValue(l.result)} <span className="muted">{l.result.unit}</span>
                      </span>
                    )}
                    <span aria-hidden>›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sessions.length > 0 && (
        <section className="section">
          <h2>검사 기록</h2>
          <ul className="list">
            {sortSessions(sessions).map((s) => (
              <li key={s.id}>
                <button type="button" className="row" onClick={() => onOpenSession(s.id)}>
                  <span className="row-main">
                    <strong>{formatDate(s.date, true)}</strong>
                    <span className="muted ellipsis">
                      {countBySession.get(s.id) ?? 0}개 항목
                      {s.memo && ` · ${s.memo.split('\n')[0]}`}
                    </span>
                  </span>
                  <span aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
