import { useEffect, useMemo, useState } from 'react';
import { DbContext } from './app/DbContext';
import { isInitialized, openRecordStore, type Database } from './db';
import type { RecordStore } from './db/recordStore';
import { LockScreen } from './features/lock/LockScreen';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'locked'; store: RecordStore; mode: 'setup' | 'unlock' }
  | { kind: 'unlocked'; store: RecordStore; db: Database };

const SECTIONS = ['투약', '검사', '일지', '일정', '설정'] as const;

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    openRecordStore()
      .then(async (store) =>
        setState({ kind: 'locked', store, mode: (await isInitialized(store)) ? 'unlock' : 'setup' }),
      )
      .catch(() => setState({ kind: 'error' }));
  }, []);

  const ctx = useMemo(
    () =>
      state.kind === 'unlocked'
        ? {
            db: state.db,
            // Dropping the Database drops the key and decrypted data from memory.
            // The store connection itself stays open for the next unlock.
            lock: () => setState({ kind: 'locked', store: state.store, mode: 'unlock' }),
          }
        : null,
    [state],
  );

  if (state.kind === 'loading') return null;
  if (state.kind === 'error') return <main className="lock">저장소를 열 수 없어요.</main>;
  if (state.kind === 'locked') {
    return (
      <LockScreen
        store={state.store}
        mode={state.mode}
        onUnlocked={(db) => setState({ kind: 'unlocked', store: state.store, db })}
      />
    );
  }

  return (
    <DbContext.Provider value={ctx}>
      <header className="topbar">
        <span>Dayline</span>
        <button type="button" onClick={ctx!.lock}>
          잠그기
        </button>
      </header>
      <main className="placeholder">
        <p>저장소와 암호화가 준비됐어요. 각 화면은 다음 단계에서 만들어요.</p>
      </main>
      <nav className="tabbar">
        {SECTIONS.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </nav>
    </DbContext.Provider>
  );
}
