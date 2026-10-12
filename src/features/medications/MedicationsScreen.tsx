import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../app/DbContext';
import { useNow, useTable } from '../../app/hooks';
import { PeriodPicker, resolvePeriod, usePeriod } from '../../components/PeriodPicker';
import type { DoseLog, Medication } from '../../db/types';
import {
  getPermission,
  remindersNeedOpenTab,
  requestPermission,
  syncDoseReminders,
  type PermissionState,
} from '../../services/notifications';
import { addDays, datePart, formatDate, timePart, toLocalDateTime, today } from '../../utils/time';
import { agendaFor, findMissed, recordDose, undoDose } from './doses';
import { DoseRow, groupByDate } from './DoseRow';
import { MedicationDetail } from './MedicationDetail';
import { FORM_LABELS, MedicationForm } from './MedicationForm';
import { describeSchedule, MAX_DAYS } from './schedule';

type View =
  | { kind: 'overview' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string | null; back: View };

export function MedicationsScreen() {
  const meds = useTable('medications');
  const [view, setView] = useState<View>({ kind: 'overview' });
  const overview: View = { kind: 'overview' };

  if (!meds) return null;
  const find = (id: string) => meds.find((m) => m.id === id);

  if (view.kind === 'edit') {
    const med = view.id ? find(view.id) : undefined;
    return (
      <MedicationForm
        key={view.id ?? 'new'}
        medication={med}
        onDone={(saved) => setView(saved ? { kind: 'detail', id: saved.id } : view.back)}
        onDeleted={() => setView(overview)}
      />
    );
  }

  if (view.kind === 'detail') {
    const med = find(view.id);
    if (med) {
      return (
        <MedicationDetail
          med={med}
          onBack={() => setView(overview)}
          onEdit={() => setView({ kind: 'edit', id: med.id, back: view })}
        />
      );
    }
  }

  return (
    <Overview
      meds={meds}
      onOpen={(m) => setView({ kind: 'detail', id: m.id })}
      onAdd={() => setView({ kind: 'edit', id: null, back: overview })}
    />
  );
}

const MISSED_PAGE = 20;

interface OverviewProps {
  meds: Medication[];
  onOpen: (m: Medication) => void;
  onAdd: () => void;
}

function Overview({ meds, onOpen, onAdd }: OverviewProps) {
  const { db } = useDb();
  const logs = useTable('dose_logs');
  const now = useNow();
  const todayDate = today(now);
  const yesterday = addDays(todayDate, -1);
  const [period, setPeriod] = usePeriod(yesterday);
  const [missedLimit, setMissedLimit] = useState(MISSED_PAGE);
  const undo = useUndo();

  if (!logs) return null;

  const nowDt = toLocalDateTime(now);
  const agenda = agendaFor(meds, logs, todayDate);
  const { from, to } = resolvePeriod(period, yesterday, MAX_DAYS);
  const missed = findMissed(meds, logs, from, to);
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
            {agenda.map(({ med, scheduledAt, log }) => {
              const when = timePart(scheduledAt);
              return (
                <DoseRow
                  key={`${med.id}@${scheduledAt}`}
                  when={when}
                  title={med.name}
                  subtitle={log ? `${log.doseSnapshot}${log.unitSnapshot}` : `${med.dose}${med.unit}`}
                  tag={!log && scheduledAt < nowDt ? '지남' : undefined}
                  log={log}
                  accessibleName={`${med.name} ${when}`}
                  onRecord={(status) => void recordDose(db, med, scheduledAt, status)}
                  onUndo={(l) => void undoDose(db, l)}
                />
              );
            })}
          </ul>
        )}
      </section>

      {meds.length > 0 && (
        <section className="section">
          <h2>
            놓친 기록 <span className="muted">{missed.length}건</span>
          </h2>
          <PeriodPicker
            value={period}
            onChange={(v) => {
              setPeriod(v);
              setMissedLimit(MISSED_PAGE);
            }}
            end={yesterday}
            maxDays={MAX_DAYS}
          />
          {missed.length === 0 ? (
            <p className="muted">이 기간에 놓친 기록이 없어요.</p>
          ) : (
            groupByDate(missed.slice(0, missedLimit), (m) => datePart(m.scheduledAt)).map(
              ([date, items]) => (
                <div key={date} className="day-group">
                  <h3 className="muted">{formatDate(date)}</h3>
                  <ul className="list">
                    {items.map(({ med, scheduledAt }) => {
                      const when = timePart(scheduledAt);
                      return (
                        <DoseRow
                          key={`${med.id}@${scheduledAt}`}
                          when={when}
                          title={med.name}
                          subtitle={`${med.dose}${med.unit}`}
                          accessibleName={`${med.name} ${formatDate(date)} ${when}`}
                          // Logged rows leave this list, so offer a short-lived undo.
                          onRecord={async (status) => undo.offer(await recordDose(db, med, scheduledAt, status))}
                          onUndo={() => undefined}
                        />
                      );
                    })}
                  </ul>
                </div>
              ),
            )
          )}
          {missed.length > missedLimit && (
            <button type="button" className="ghost" onClick={() => setMissedLimit((l) => l + MISSED_PAGE)}>
              더 보기 ({missed.length - missedLimit}건)
            </button>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-header">
          <h2>등록된 항목</h2>
          <button type="button" className="primary small" onClick={onAdd}>
            + 추가
          </button>
        </div>
        {active.length === 0 && <p className="muted">아직 등록된 항목이 없어요.</p>}
        <ul className="list">
          {active.map((m) => (
            <MedicationRow key={m.id} med={m} onClick={() => onOpen(m)} />
          ))}
        </ul>
        {inactive.length > 0 && (
          <>
            <h3 className="muted">사용 중지됨</h3>
            <ul className="list">
              {inactive.map((m) => (
                <MedicationRow key={m.id} med={m} onClick={() => onOpen(m)} />
              ))}
            </ul>
          </>
        )}
      </section>

      {undo.log && (
        <div className="toast" role="status">
          <span>{undo.log.status === 'taken' ? '체크했어요.' : '건너뛰었어요.'}</span>
          <button type="button" className="ghost small" onClick={() => void undo.run()}>
            되돌리기
          </button>
        </div>
      )}
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
