import { useState } from 'react';
import type { LocalDate } from '../db/types';
import { addDays } from '../utils/time';

export type PeriodPreset = 7 | 30 | 90 | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  /** Used only for 'custom'. */
  from: LocalDate;
  to: LocalDate;
}

export interface Period {
  from: LocalDate;
  to: LocalDate;
}

/** Longest custom range, to keep schedule expansion cheap. */
const MAX_DAYS = 366;

/** Resolves a picker value to concrete dates ending no later than `end`. */
export function resolvePeriod(value: PeriodValue, end: LocalDate): Period {
  if (value.preset !== 'custom') return { from: addDays(end, -(value.preset - 1)), to: end };
  const to = value.to > end ? end : value.to;
  let from = value.from > to ? to : value.from;
  const earliest = addDays(to, -(MAX_DAYS - 1));
  if (from < earliest) from = earliest;
  return { from, to };
}

export function usePeriod(end: LocalDate, preset: PeriodPreset = 30) {
  return useState<PeriodValue>({ preset, from: addDays(end, -29), to: end });
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
  { value: 'custom', label: '직접 지정' },
];

interface Props {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  /** Latest selectable date (e.g. today or yesterday). */
  end: LocalDate;
}

export function PeriodPicker({ value, onChange, end }: Props) {
  const resolved = resolvePeriod(value, end);
  return (
    <div className="period">
      <div className="chips" role="group" aria-label="기간">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className="chip"
            aria-pressed={value.preset === p.value}
            onClick={() =>
              onChange(
                p.value === 'custom'
                  ? { preset: 'custom', from: resolved.from, to: resolved.to }
                  : { ...value, preset: p.value },
              )
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="field-row">
          <label className="field">
            <span>시작</span>
            <input
              type="date"
              value={value.from}
              max={end}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
            />
          </label>
          <label className="field">
            <span>끝</span>
            <input
              type="date"
              value={value.to}
              max={end}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
            />
          </label>
        </div>
      )}
      {value.preset === 'custom' && resolved.from !== value.from && (
        <p className="muted small-text">한 번에 최대 1년까지 볼 수 있어요.</p>
      )}
    </div>
  );
}
