import { useState } from 'react';
import type { LocalDate } from '../db/types';
import { addDays } from '../utils/time';

/** A number of days ending at `end`, everything, or a custom range. */
export type PeriodPreset = number | 'all' | 'custom';

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

export interface PresetOption {
  value: PeriodPreset;
  label: string;
}

export const DAY_PRESETS: PresetOption[] = [
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 90, label: '90일' },
  { value: 'custom', label: '직접 지정' },
];

export const MONTH_PRESETS: PresetOption[] = [
  { value: 90, label: '3개월' },
  { value: 180, label: '6개월' },
  { value: 365, label: '1년' },
  { value: 'all', label: '전체' },
  { value: 'custom', label: '직접 지정' },
];

const BEGINNING: LocalDate = '1900-01-01';

/**
 * Resolves a picker value to concrete dates ending no later than `end`.
 * `maxDays` caps custom ranges (used where each day is expanded, like schedules).
 */
export function resolvePeriod(value: PeriodValue, end: LocalDate, maxDays?: number): Period {
  if (value.preset === 'all') return { from: BEGINNING, to: end };
  if (value.preset !== 'custom') return { from: addDays(end, -(value.preset - 1)), to: end };
  const to = value.to > end ? end : value.to;
  let from = value.from > to ? to : value.from;
  if (maxDays !== undefined) {
    const earliest = addDays(to, -(maxDays - 1));
    if (from < earliest) from = earliest;
  }
  return { from, to };
}

export function usePeriod(end: LocalDate, preset: PeriodPreset = 30) {
  return useState<PeriodValue>({ preset, from: addDays(end, -29), to: end });
}

interface Props {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  /** Latest selectable date (e.g. today or yesterday). */
  end: LocalDate;
  presets?: PresetOption[];
  maxDays?: number;
}

export function PeriodPicker({ value, onChange, end, presets = DAY_PRESETS, maxDays }: Props) {
  const resolved = resolvePeriod(value, end, maxDays);
  return (
    <div className="period">
      <div className="chips" role="group" aria-label="기간">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            className="chip"
            aria-pressed={value.preset === p.value}
            onClick={() =>
              onChange(
                p.value === 'custom'
                  ? {
                      preset: 'custom',
                      from: resolved.from === BEGINNING ? addDays(end, -364) : resolved.from,
                      to: resolved.to,
                    }
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
      {value.preset === 'custom' && resolved.from !== value.from && maxDays !== undefined && (
        <p className="muted small-text">한 번에 최대 {Math.round(maxDays / 365)}년까지 볼 수 있어요.</p>
      )}
    </div>
  );
}
