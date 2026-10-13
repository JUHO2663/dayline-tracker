import { useState } from 'react';
import { useTable } from '../../app/hooks';
import type { JournalEntry, JournalPhoto } from '../../db/types';
import { formatDate } from '../../utils/time';
import { groupBy } from '../../utils/group';
import { JournalForm } from './JournalForm';
import { moodOf, photosByEntry, sortEntries } from './journal';

const PAGE = 30;

export function JournalScreen() {
  const entries = useTable('journal_entries');
  const photos = useTable('journal_photos');
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  if (!entries || !photos) return null;
  const byEntry = photosByEntry(photos);

  if (editing) {
    const entry = editing === 'new' ? undefined : entries.find((e) => e.id === editing);
    return (
      <JournalForm
        key={editing}
        entry={entry}
        photos={entry ? (byEntry.get(entry.id) ?? []) : []}
        onDone={() => setEditing(null)}
      />
    );
  }

  return <JournalList entries={entries} byEntry={byEntry} onOpen={setEditing} onAdd={() => setEditing('new')} />;
}

interface ListProps {
  entries: JournalEntry[];
  byEntry: Map<string, JournalPhoto[]>;
  onOpen: (id: string) => void;
  onAdd: () => void;
}

function JournalList({ entries, byEntry, onOpen, onAdd }: ListProps) {
  const [limit, setLimit] = useState(PAGE);
  const sorted = sortEntries(entries);
  const shown = sorted.slice(0, limit);

  return (
    <div className="screen">
      <button type="button" className="primary" onClick={onAdd}>
        + 일지 쓰기
      </button>

      {sorted.length === 0 ? (
        <p className="muted">아직 쓴 일지가 없어요. 기분, 메모, 몸의 변화, 사진을 남길 수 있어요.</p>
      ) : (
        groupBy(shown, (e) => e.date.slice(0, 7)).map(([month, items]) => {
          const [y, m] = month.split('-').map(Number);
          return (
            <section key={month} className="section">
              <h2>
                {y}년 {m}월
              </h2>
              <ul className="list">
                {items.map((e) => {
                  const mood = moodOf(e.mood);
                  const photoCount = byEntry.get(e.id)?.length ?? 0;
                  return (
                    <li key={e.id}>
                      <button type="button" className="row" onClick={() => onOpen(e.id)}>
                        <span className="row-main">
                          <strong>
                            {formatDate(e.date)}
                            {mood && (
                              <span className="mood-inline">
                                <span aria-hidden>{mood.face}</span> {mood.label}
                              </span>
                            )}
                          </strong>
                          {e.note && <span className="muted ellipsis">{e.note.split('\n')[0]}</span>}
                          {(e.sideEffects || photoCount > 0) && (
                            <span className="muted small-text">
                              {[e.sideEffects && '부작용 메모', photoCount > 0 && `사진 ${photoCount}장`]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </span>
                        <span aria-hidden>›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {sorted.length > limit && (
        <button type="button" className="ghost" onClick={() => setLimit((l) => l + PAGE)}>
          더 보기 ({sorted.length - limit}개)
        </button>
      )}
    </div>
  );
}
