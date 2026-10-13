import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DbContext, useDb } from './app/DbContext';
import { isInitialized, openRecordStore, type Database } from './db';
import type { RecordStore } from './db/recordStore';
import { AppointmentsScreen } from './features/appointments/AppointmentsScreen';
import { JournalScreen } from './features/journal/JournalScreen';
import { LockScreen } from './features/lock/LockScreen';
import { MedicationsScreen } from './features/medications/MedicationsScreen';
import { cleanCaptureLeftovers } from './services/images';
import { REMINDER_INPUTS, syncReminders } from './services/notifications';

// The chart library is large; load it only when the labs tab is opened.
const LabsScreen = lazy(() => import('./features/labs/LabsScreen').then((m) => ({ default: m.LabsScreen })));

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'locked'; store: RecordStore; mode: 'setup' | 'unlock' }
  | { kind: 'unlocked'; store: RecordStore; db: Database };

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
      <UnlockedApp />
    </DbContext.Provider>
  );
}

const TABS = [
  { id: 'meds', label: '투약' },
  { id: 'labs', label: '검사' },
  { id: 'journal', label: '일지' },
  { id: 'appointments', label: '일정' },
  { id: 'settings', label: '설정' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function UnlockedApp() {
  const { db, lock } = useDb();
  const [tab, setTab] = useState<TabId>('meds');

  useEffect(() => {
    const sync = () => void syncReminders(db).catch(() => undefined);
    sync();
    return db.subscribe((tables) => {
      if (REMINDER_INPUTS.some((t) => tables.has(t))) sync();
    });
  }, [db]);

  useEffect(() => {
    // Housekeeping after unlock: drop unreferenced photo blobs and any plaintext camera leftovers.
    void db.sweepOrphanBlobs().catch(() => undefined);
    void cleanCaptureLeftovers();
  }, [db]);

  return (
    <>
      <header className="topbar">
        <span>Dayline</span>
        <button type="button" onClick={lock}>
          잠그기
        </button>
      </header>
      <main className="content">
        {tab === 'meds' ? (
          <MedicationsScreen />
        ) : tab === 'labs' ? (
          <Suspense fallback={null}>
            <LabsScreen />
          </Suspense>
        ) : tab === 'journal' ? (
          <JournalScreen />
        ) : tab === 'appointments' ? (
          <AppointmentsScreen />
        ) : (
          <p className="muted screen">다음 단계에서 만들어요.</p>
        )}
      </main>
      <nav className="tabbar" aria-label="메뉴">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
