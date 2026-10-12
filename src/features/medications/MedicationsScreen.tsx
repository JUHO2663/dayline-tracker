import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../app/DbContext';
import { useNow, useTable } from '../../app/hooks';
import type { DoseLog, Medication } from '../../db/types';
import {
  getPermission,
  remindersNeedOpenTab,
  requestPermission,
  syncDoseReminders,
  type PermissionState,
} from '../../services/notifications';
import { formatDate, timePart, toLocalDateTime, today } from '../../utils/time';
import { agendaFor, findMissed, recordDose, undoDose, type DoseItem } from './doses';
import { FORM_LABELS, MedicationForm } from './MedicationForm';
import { describeSchedule } from './schedule';

const MISSED_DAYS = 7;

export function MedicationsScreen() {
  const [editing, setEditing] = useState<Medication | 'new' | null>(null);
  if (editing) {
    return (
      <MedicationForm
        medication={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
      />
    );
  }
  return <Overview onEdit={setEditing} />;
}

function Overview({ onEdit }: { onEdit: (m: Medication | 'new') => void }) {
  const meds = useTable('medications');
  const logs = useTable('dose_logs');
  const now = useNow();
  const undo = useUndo();

  if (!meds || !logs) return null;

  const todayDate = today(now);
  const agenda = agendaFor(meds, logs, todayDate);
  const missed = findMissed(meds, logs, todayDate, MISSED_DAYS);
  const active = meds.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));
  const inactive = meds.filter((m) => !m.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="screen">
      <ReminderBanner wantsReminders={meds.some((m) => m.active && m.notify)} />

      <section className="section">
        <h2>오늘 · {formatDate(todayDate)}</h2>
        {agenda.length === 0 ? (
          <p className="muted">오늘 예정된 항목이 없어요.</p>
        ) : (
          <ul className="list">
            {agenda.map((item) => (
              <DoseRow key={`${item.med.id}@${item.scheduledAt}`} item={item} nowDt={toLocalDateTime(now)} />
            ))}
          </ul>
        )}
      </section>

      {missed.length > 0 && (
        <section className="section">
          <h2>놓친 기록 · 최근 {MISSED_DAYS}일</h2>
          <ul className="list">
            {missed.map((item) => (
              <DoseRow
                key={`${item.med.id}@${item.scheduledAt}`}
                item={item}
                showDate
                // Logged rows leave this list, so offer a short-lived undo instead.
                onRecorded={undo.offer}
              />
            ))}
          </ul>
        </section>
      )}

      {undo.log && (
        <div className="toast" role="status">
          <span>{undo.log.status === 'taken' ? '체크했어요.' : '건너뛰었어요.'}</span>
          <button type="button" className="ghost small" onClick={() => void undo.run()}>
            되돌리기
          </button>
        </div>
      )}

      <section className="section">
        <div className="section-header">
          <h2>등록된 항목</h2>
          <button type="button" className="primary small" onClick={() => onEdit('new')}>
            + 추가
          </button>
        </div>
        {active.length === 0 && <p className="muted">아직 등록된 항목이 없어요.</p>}
        <ul className="list">
          {active.map((m) => (
            <MedicationRow key={m.id} med={m} onClick={() => onEdit(m)} />
          ))}
        </ul>
        {inactive.length > 0 && (
          <>
            <h3 className="muted">사용 중지됨</h3>
            <ul className="list">
              {inactive.map((m) => (
                <MedicationRow key={m.id} med={m} onClick={() => onEdit(m)} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function MedicationRow({ med, onClick }: { med: Medication; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="row" onClick={onClick}>
        <span className="row-main">
          <strong>{med.name}</strong>
          <span className="muted">
            {FORM_LABELS[med.form]} · {med.dose}
            {med.unit} · {describeSchedule(med.schedule)}
            {!med.notify && ' · 알림 끔'}
          </span>
        </span>
        <span aria-hidden>›</span>
      </button>
    </li>
  );
}

const UNDO_MS = 6_000;

function useUndo() {
  const { db } = useDb();
  const [log, setLog] = useState<DoseLog | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    log,
    offer: (next: DoseLog) => {
      clearTimeout(timer.current);
      setLog(next);
      timer.current = setTimeout(() => setLog(null), UNDO_MS);
    },
    run: async () => {
      if (!log) return;
      clearTimeout(timer.current);
      setLog(null);
      await undoDose(db, log);
    },
  };
}

interface DoseRowProps {
  item: DoseItem;
  nowDt?: string;
  showDate?: boolean;
  onRecorded?: (log: DoseLog) => void;
}

function DoseRow({ item, nowDt, showDate, onRecorded }: DoseRowProps) {
  const { db } = useDb();
  const record = async (status: DoseLog['status']) => {
    const log = await recordDose(db, item.med, item.scheduledAt, status);
    onRecorded?.(log);
  };
  const { med, scheduledAt, log } = item;
  const overdue = !log && nowDt !== undefined && scheduledAt < nowDt;
  const when = showDate
    ? `${formatDate(scheduledAt.slice(0, 10))} ${timePart(scheduledAt)}`
    : timePart(scheduledAt);

  return (
    <li className="row">
      <span className="time">{when}</span>
      <span className="row-main">
        <strong>{med.name}</strong>
        <span className="muted">
          {log ? `${log.doseSnapshot}${log.unitSnapshot}` : `${med.dose}${med.unit}`}
          {overdue && ' · 지남'}
        </span>
      </span>
      {log ? (
        <span className="actions">
          <span className={log.status === 'taken' ? 'badge done' : 'badge'}>
            {log.status === 'taken'
              ? `✓ ${log.takenAt ? timePart(log.takenAt) : '체크함'}`
              : '건너뜀'}
          </span>
          <button
            type="button"
            className="ghost small"
            onClick={() => void undoDose(db, log)}
            aria-label={`${med.name} ${when} 기록 취소`}
          >
            취소
          </button>
        </span>
      ) : (
        <span className="actions">
          <button
            type="button"
            className="ghost small"
            onClick={() => void record('skipped')}
            aria-label={`${med.name} ${when} 건너뛰기`}
          >
            건너뛰기
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => void record('taken')}
            aria-label={`${med.name} ${when} 체크`}
          >
            체크
          </button>
        </span>
      )}
    </li>
  );
}

function ReminderBanner({ wantsReminders }: { wantsReminders: boolean }) {
  const { db } = useDb();
  const [permission, setPermission] = useState<PermissionState>();

  useEffect(() => {
    void getPermission().then(setPermission);
  }, []);

  if (!wantsReminders || permission === undefined || permission === 'unsupported') return null;

  if (permission === 'granted') {
    return remindersNeedOpenTab() ? (
      <p className="banner">웹에서는 이 탭이 열려 있을 때만 알림이 와요.</p>
    ) : null;
  }

  if (permission === 'denied') {
    return (
      <p className="banner">
        {remindersNeedOpenTab()
          ? '알림이 차단되어 있어요. 브라우저의 사이트 설정에서 알림을 허용해 주세요.'
          : '알림이 꺼져 있어요. 기기 설정에서 이 앱의 알림을 허용해 주세요.'}
      </p>
    );
  }

  return (
    <div className="banner">
      <span>알림을 받으려면 권한이 필요해요.</span>
      <button
        type="button"
        className="primary small"
        onClick={async () => {
          const next = await requestPermission();
          setPermission(next);
          if (next === 'granted') await syncDoseReminders(db);
        }}
      >
        허용하기
      </button>
    </div>
  );
}
