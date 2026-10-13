import { useState } from 'react';
import { useDb } from '../../app/DbContext';
import { useNow, useTable } from '../../app/hooks';
import { ReminderBanner } from '../../components/ReminderBanner';
import { withDefaults, type Appointment, type AppointmentKind } from '../../db/types';
import { combine, datePart, daysBetween, formatDate, isValidTime, timePart, today } from '../../utils/time';
import { KIND_LABELS, REMIND_AT, splitAppointments } from './appointments';

export function AppointmentsScreen() {
  const appts = useTable('appointments');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (!appts) return null;
  if (editing) {
    return (
      <AppointmentForm
        key={editing}
        appointment={editing === 'new' ? undefined : appts.find((a) => a.id === editing)}
        onDone={() => setEditing(null)}
      />
    );
  }
  return <AppointmentList appts={appts} onOpen={setEditing} onAdd={() => setEditing('new')} />;
}

function relativeDay(days: number): string {
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 후`;
}

interface ListProps {
  appts: Appointment[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}

function AppointmentList({ appts, onOpen, onAdd }: ListProps) {
  const now = useNow();
  const todayDate = today(now);
  const { upcoming, past } = splitAppointments(appts, now);

  const row = (a: Appointment, showRelative: boolean) => (
    <li key={a.id}>
      <button type="button" className="row" onClick={() => onOpen(a.id)}>
        <span className="row-main">
          <strong>{a.title}</strong>
          <span className="muted">
            {formatDate(datePart(a.datetime), true)} {timePart(a.datetime)} · {KIND_LABELS[a.kind]}
            {a.location && ` · ${a.location}`}
          </span>
          {showRelative && a.remind && <span className="muted small-text">전날 알림</span>}
        </span>
        {showRelative && <span className="tag">{relativeDay(daysBetween(todayDate, datePart(a.datetime)))}</span>}
        <span aria-hidden>›</span>
      </button>
    </li>
  );

  return (
    <div className="screen">
      <ReminderBanner wantsReminders={upcoming.some((a) => a.remind)} />

      <button type="button" className="primary" onClick={onAdd}>
        + 일정 추가
      </button>

      <section className="section">
        <h2>다가오는 일정</h2>
        {upcoming.length === 0 ? (
          <p className="muted">예정된 일정이 없어요.</p>
        ) : (
          <ul className="list">{upcoming.map((a) => row(a, true))}</ul>
        )}
      </section>

      {past.length > 0 && (
        <details className="section past">
          <summary>
            <h2>지난 일정 ({past.length})</h2>
          </summary>
          <ul className="list">{past.map((a) => row(a, false))}</ul>
        </details>
      )}
    </div>
  );
}

interface FormProps {
  appointment?: Appointment;
  onDone: () => void;
}

function AppointmentForm({ appointment: appt, onDone }: FormProps) {
  const { db } = useDb();
  const settings = useTable('settings');
  const [title, setTitle] = useState(appt?.title ?? '');
  const [kind, setKind] = useState<AppointmentKind>(appt?.kind ?? 'visit');
  const [date, setDate] = useState(appt ? datePart(appt.datetime) : today());
  const [time, setTime] = useState(appt ? timePart(appt.datetime) : '10:00');
  const [location, setLocation] = useState(appt?.location ?? '');
  const [memo, setMemo] = useState(appt?.memo ?? '');
  const [remind, setRemind] = useState(appt?.remind ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reminderText = withDefaults(settings?.[0]).appointmentText;

  async function save() {
    if (!title.trim()) return setError('제목을 넣어 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('날짜를 넣어 주세요.');
    if (!isValidTime(time)) return setError('시간을 넣어 주세요.');
    setSaving(true);
    const ts = new Date().toISOString();
    const next: Appointment = {
      id: appt?.id ?? crypto.randomUUID(),
      title: title.trim(),
      kind,
      datetime: combine(date, time),
      remind,
      createdAt: appt?.createdAt ?? ts,
      updatedAt: ts,
    };
    if (location.trim()) next.location = location.trim();
    if (memo.trim()) next.memo = memo.trim();
    try {
      await db.put('appointments', next);
      onDone();
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!appt || !confirm('이 일정을 삭제할까요?')) return;
    await db.remove('appointments', appt.id);
    onDone();
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={onDone}>
          ← 뒤로
        </button>
        <h2>{appt ? '일정 수정' : '새 일정'}</h2>
      </div>

      <label className="field">
        <span>제목</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </label>

      <fieldset className="field">
        <legend>종류</legend>
        <div className="chips">
          {(Object.keys(KIND_LABELS) as AppointmentKind[]).map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>날짜</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>시간</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>장소 (선택)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} />
      </label>

      <label className="field">
        <span>메모 (선택)</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={1000} />
      </label>

      <label className="inline">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
        전날 알림 받기
      </label>
      {remind && (
        <p className="muted small-text">
          전날 {REMIND_AT}에 &lsquo;{reminderText}&rsquo;라고만 알려 드려요. 제목이나 장소는 알림에 나오지 않아요.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
        저장
      </button>

      {appt && (
        <div className="danger-zone">
          <span />
          <button type="button" className="danger" onClick={() => void remove()}>
            일정 삭제
          </button>
        </div>
      )}
    </div>
  );
}
