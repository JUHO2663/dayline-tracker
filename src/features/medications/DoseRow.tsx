import type { DoseLog, DoseStatus } from '../../db/types';
import { timePart } from '../../utils/time';

interface Props {
  when: string;
  title: string;
  subtitle?: string;
  /** Short marker for unlogged rows, e.g. '놓침', '지남'. */
  tag?: string;
  log?: DoseLog;
  /** Used in button labels for screen readers, e.g. "Sample 10월 12일 09:00". */
  accessibleName: string;
  onRecord: (status: DoseStatus) => void;
  onUndo: (log: DoseLog) => void;
}

export function DoseRow({ when, title, subtitle, tag, log, accessibleName, onRecord, onUndo }: Props) {
  return (
    <li className="row">
      <span className="time">{when}</span>
      <span className="row-main">
        <strong>{title}</strong>
        {(subtitle || tag) && (
          <span className="muted">
            {subtitle}
            {tag && <span className="tag">{tag}</span>}
          </span>
        )}
      </span>
      {log ? (
        <span className="actions">
          <span className={log.status === 'taken' ? 'badge done' : 'badge'}>
            {log.status === 'taken' ? `✓ ${log.takenAt ? timePart(log.takenAt) : '체크함'}` : '건너뜀'}
          </span>
          <button
            type="button"
            className="ghost small"
            onClick={() => onUndo(log)}
            aria-label={`${accessibleName} 기록 취소`}
          >
            취소
          </button>
        </span>
      ) : (
        <span className="actions">
          <button
            type="button"
            className="ghost small"
            onClick={() => onRecord('skipped')}
            aria-label={`${accessibleName} 건너뛰기`}
          >
            건너뛰기
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => onRecord('taken')}
            aria-label={`${accessibleName} 체크`}
          >
            체크
          </button>
        </span>
      )}
    </li>
  );
}

/** Groups items by their date, preserving order. */
export function groupByDate<T>(items: T[], dateOf: (item: T) => string): [string, T[]][] {
  const groups: [string, T[]][] = [];
  for (const item of items) {
    const d = dateOf(item);
    const last = groups[groups.length - 1];
    if (last && last[0] === d) last[1].push(item);
    else groups.push([d, [item]]);
  }
  return groups;
}
