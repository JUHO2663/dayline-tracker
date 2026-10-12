import { useState } from 'react';
import { useDb } from '../../app/DbContext';
import { useTable } from '../../app/hooks';
import { ChoiceDialog } from '../../components/ChoiceDialog';
import type { Medication, MedicationForm as Form, Schedule } from '../../db/types';
import { isValidTime, today, weekdayLabel } from '../../utils/time';
import {
  createMedication,
  deactivate,
  needsScheduleDecision,
  reactivate,
  updateMedication,
  type MedicationFields,
  type ScheduleChangeMode,
} from './medicationOps';
import { validateSchedule } from './schedule';

export const FORM_LABELS: Record<Form, string> = {
  pill: '알약',
  injection: '주사',
  patch: '패치',
  gel: '젤',
};

const UNIT_SUGGESTIONS = ['mg', 'mL', 'µg', '정', '펌프', '장'];

interface Props {
  /** undefined = new medication */
  medication?: Medication;
  onDone: (saved?: Medication) => void;
  onDeleted: () => void;
}

type ScheduleType = Schedule['type'];

export function MedicationForm({ medication: med, onDone, onDeleted }: Props) {
  const { db } = useDb();
  const logs = useTable('dose_logs');
  const [name, setName] = useState(med?.name ?? '');
  const [form, setForm] = useState<Form>(med?.form ?? 'pill');
  const [dose, setDose] = useState(med ? String(med.dose) : '');
  const [unit, setUnit] = useState(med?.unit ?? 'mg');
  const [scheduleType, setScheduleType] = useState<ScheduleType>(med?.schedule.type ?? 'daily');
  const [times, setTimes] = useState<string[]>(med?.schedule.times ?? ['09:00']);
  const [weekdays, setWeekdays] = useState<number[]>(
    med?.schedule.type === 'weekly' ? med.schedule.weekdays : [],
  );
  const [everyDays, setEveryDays] = useState(
    med?.schedule.type === 'interval' ? String(med.schedule.everyDays) : '7',
  );
  const [anchor, setAnchor] = useState(
    med?.schedule.type === 'interval' ? med.schedule.anchor : (med?.startDate ?? today()),
  );
  const [startDate, setStartDate] = useState(med?.startDate ?? today());
  const [endDate, setEndDate] = useState(med?.endDate ?? '');
  const [notify, setNotify] = useState(med?.notify ?? true);
  const [memo, setMemo] = useState(med?.memo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<MedicationFields | null>(null);

  const logCount = med && logs ? logs.filter((l) => l.medicationId === med.id).length : 0;

  function buildSchedule(): Schedule {
    const t = [...new Set(times)].sort();
    if (scheduleType === 'weekly') return { type: 'weekly', weekdays: [...weekdays].sort(), times: t };
    if (scheduleType === 'interval') {
      return { type: 'interval', everyDays: Number(everyDays), anchor, times: t };
    }
    return { type: 'daily', times: t };
  }

  function validate(schedule: Schedule): string | null {
    if (!name.trim()) return '이름을 넣어 주세요.';
    const d = Number(dose);
    if (!dose.trim() || !Number.isFinite(d) || d <= 0) return '용량을 0보다 큰 숫자로 넣어 주세요.';
    if (!unit.trim()) return '단위를 넣어 주세요.';
    if (times.some((t) => !isValidTime(t))) return '시간을 모두 채워 주세요.';
    if (!startDate) return '시작일을 넣어 주세요.';
    if (endDate && endDate < startDate) return '종료일은 시작일보다 뒤여야 해요.';
    return validateSchedule(schedule);
  }

  async function persist(fields: MedicationFields, mode?: ScheduleChangeMode) {
    setSaving(true);
    try {
      if (!med) {
        const created = createMedication(fields);
        await db.put('medications', created);
        onDone(created);
        return;
      }
      const next = updateMedication(med, fields, today(), mode);
      await db.batch((b) => {
        b.put('medications', next);
        if (mode === 'reset' && logs) {
          b.remove('dose_logs', ...logs.filter((l) => l.medicationId === med.id).map((l) => l.id));
        }
      });
      onDone(next);
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  function save() {
    const schedule = buildSchedule();
    const problem = validate(schedule);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const fields: MedicationFields = {
      name: name.trim(),
      form,
      dose: Number(dose),
      unit: unit.trim(),
      schedule,
      startDate,
      notify,
    };
    if (endDate) fields.endDate = endDate;
    if (memo.trim()) fields.memo = memo.trim();

    if (med && needsScheduleDecision(med, fields, today())) {
      setPending(fields);
      return;
    }
    void persist(fields);
  }

  async function toggleActive() {
    if (!med) return;
    const next = med.active ? deactivate(med, today()) : reactivate(med, today());
    await db.put('medications', next);
    onDone(next);
  }

  async function remove() {
    if (!med) return;
    if (!confirm(`'${med.name}'을(를) 삭제할까요?\n이 항목의 체크 기록도 모두 지워져요.`)) return;
    await db.removeCascade('medications', med.id);
    onDeleted();
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={() => onDone()}>
          ← 뒤로
        </button>
        <h2>{med ? '수정' : '새 항목'}</h2>
      </div>

      <label className="field">
        <span>이름</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </label>

      <fieldset className="field">
        <legend>제형</legend>
        <div className="chips">
          {(Object.keys(FORM_LABELS) as Form[]).map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={form === f}
              onClick={() => setForm(f)}
            >
              {FORM_LABELS[f]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>용량</span>
          <input
            inputMode="decimal"
            value={dose}
            onChange={(e) => setDose(e.target.value.replace(',', '.'))}
          />
        </label>
        <label className="field">
          <span>단위</span>
          <input list="unit-suggestions" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>

      <fieldset className="field">
        <legend>주기</legend>
        <div className="chips">
          {(
            [
              ['daily', '매일'],
              ['weekly', '요일 지정'],
              ['interval', 'N일마다'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              className="chip"
              aria-pressed={scheduleType === type}
              onClick={() => setScheduleType(type)}
            >
              {label}
            </button>
          ))}
        </div>

        {scheduleType === 'weekly' && (
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={weekdays.includes(d)}
                onClick={() =>
                  setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))
                }
              >
                {weekdayLabel(d)}
              </button>
            ))}
          </div>
        )}

        {scheduleType === 'interval' && (
          <div className="interval">
            <label className="inline">
              <input
                inputMode="numeric"
                className="short"
                value={everyDays}
                onChange={(e) => setEveryDays(e.target.value.replace(/\D/g, ''))}
                aria-label="며칠마다"
              />
              일마다
            </label>
            <label className="field">
              <span>기준일 (이 날짜부터 {everyDays || 'N'}일 간격)</span>
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>시간</legend>
        {times.map((t, i) => (
          <div key={i} className="inline">
            <input
              type="time"
              value={t}
              aria-label={`시간 ${i + 1}`}
              onChange={(e) => setTimes((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {times.length > 1 && (
              <button
                type="button"
                className="ghost"
                aria-label={`시간 ${i + 1} 삭제`}
                onClick={() => setTimes((ts) => ts.filter((_, j) => j !== i))}
              >
                삭제
              </button>
            )}
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setTimes((ts) => [...ts, '21:00'])}>
          + 시간 추가
        </button>
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>시작일</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span>종료일 (선택)</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>

      <label className="inline">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        알림 받기
      </label>

      <label className="field">
        <span>메모 (선택)</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={1000} />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary" onClick={save} disabled={saving}>
        저장
      </button>

      {med && (
        <div className="danger-zone">
          <button type="button" onClick={() => void toggleActive()}>
            {med.active ? '사용 중지' : '다시 사용'}
          </button>
          <button type="button" className="danger" onClick={() => void remove()}>
            항목 삭제
          </button>
        </div>
      )}

      {pending && (
        <ChoiceDialog<ScheduleChangeMode>
          title="주기가 바뀌었어요"
          choices={[
            {
              value: 'keep',
              label: '이전 기록 유지',
              description: '오늘 전까지는 이전 주기로 기록과 놓친 기록을 계속 보여줘요.',
              tone: 'primary',
            },
            {
              value: 'reset',
              label: '이전 기록 삭제',
              description:
                logCount > 0
                  ? `이 항목의 체크 기록 ${logCount}건을 모두 지우고 오늘부터 새로 시작해요.`
                  : '이전 주기를 지우고 오늘부터 새로 시작해요.',
              tone: 'danger',
            },
          ]}
          onChoose={(mode) => {
            const fields = pending;
            setPending(null);
            if (mode === 'reset' && logCount > 0 && !confirm(`체크 기록 ${logCount}건을 삭제할까요? 되돌릴 수 없어요.`)) {
              return;
            }
            void persist(fields, mode);
          }}
          onCancel={() => setPending(null)}
        >
          <p className="muted">이전 체크 기록을 어떻게 할까요?</p>
        </ChoiceDialog>
      )}
    </div>
  );
}
