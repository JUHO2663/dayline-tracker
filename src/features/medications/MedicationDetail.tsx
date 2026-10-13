import { useState } from 'react';
import { useDb } from '../../app/DbContext';
import { useNow, useTable } from '../../app/hooks';
import { PeriodPicker, resolvePeriod, usePeriod } from '../../components/PeriodPicker';
import type { Medication } from '../../db/types';
import { datePart, formatDate, timePart, today } from '../../utils/time';
import { countByStatus, medicationHistory, recordDose, undoDose, type HistoryStatus } from './doses';
import { DoseRow } from './DoseRow';
import { groupBy } from '../../utils/group';
import { FORM_LABELS } from './MedicationForm';
import { describeSchedule, MAX_DAYS } from './schedule';

const PAGE = 60;

const TAGS: Partial<Record<HistoryStatus, string>> = {
  missed: '놓침',
  overdue: '지남',
  upcoming: '예정',
};

interface Props {
  med: Medication;
  onBack: () => void;
  onEdit: () => void;
}

export function MedicationDetail({ med, onBack, onEdit }: Props) {
  const { db } = useDb();
  const logs = useTable('dose_logs');
  const now = useNow();
  const todayDate = today(now);
  const [period, setPeriod] = usePeriod(todayDate);
  const [limit, setLimit] = useState(PAGE);

  if (!logs) return null;

  const { from, to } = resolvePeriod(period, todayDate, MAX_DAYS);
  const entries = medicationHistory(med, logs, from, to, now);
  const counts = countByStatus(entries);
  const shown = entries.slice(0, limit);

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← 뒤로
        </button>
        <h2>{med.name}</h2>
        <button type="button" className="small push-right" onClick={onEdit}>
          수정
        </button>
      </div>

      <p className="muted summary">
        {FORM_LABELS[med.form]} · {med.dose}
        {med.unit} · {describeSchedule(med.schedule)}
        {!med.active && ' · 사용 중지됨'}
      </p>

      {med.scheduleHistory.length > 0 && (
        <details className="history-periods">
          <summary>주기 변경 이력</summary>
          <ul>
            {med.scheduleHistory.map((p) => (
              <li key={p.from}>
                {formatDate(p.from)} – {formatDate(p.to)}:{' '}
                {p.schedule ? describeSchedule(p.schedule) : '사용 중지'}
              </li>
            ))}
            <li>
              {formatDate(med.scheduleFrom)} –: {describeSchedule(med.schedule)}
            </li>
          </ul>
        </details>
      )}

      <section className="section">
        <h2>기록</h2>
        <PeriodPicker
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setLimit(PAGE);
          }}
          end={todayDate}
          maxDays={MAX_DAYS}
        />
        <p className="counts">
          <span>체크 {counts.taken}</span>
          <span>건너뜀 {counts.skipped}</span>
          <span className={counts.missed > 0 ? 'missed' : undefined}>놓침 {counts.missed}</span>
        </p>

        {entries.length === 0 ? (
          <p className="muted">이 기간에는 예정된 항목이 없어요.</p>
        ) : (
          groupBy(shown, (e) => datePart(e.scheduledAt)).map(([date, items]) => (
            <div key={date} className="day-group">
              <h3 className="muted">{formatDate(date)}</h3>
              <ul className="list">
                {items.map((e) => {
                  const when = timePart(e.scheduledAt);
                  return (
                    <DoseRow
                      key={e.scheduledAt}
                      when={when}
                      title={e.log ? `${e.log.doseSnapshot}${e.log.unitSnapshot}` : `${med.dose}${med.unit}`}
                      tag={TAGS[e.status]}
                      log={e.log}
                      accessibleName={`${formatDate(date)} ${when}`}
                      onRecord={(status) => void recordDose(db, med, e.scheduledAt, status)}
                      onUndo={(log) => void undoDose(db, log)}
                    />
                  );
                })}
              </ul>
            </div>
          ))
        )}
        {entries.length > limit && (
          <button type="button" className="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            더 보기 ({entries.length - limit}건)
          </button>
        )}
      </section>
    </div>
  );
}
