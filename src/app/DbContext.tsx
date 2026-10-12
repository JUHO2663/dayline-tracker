import { createContext, useContext } from 'react';
import type { Database } from '../db';

export interface DbContextValue {
  db: Database;
  lock: () => void;
}

export const DbContext = createContext<DbContextValue | null>(null);

/** Available only below the lock screen, i.e. after a successful unlock. */
export function useDb(): DbContextValue {
  const value = useContext(DbContext);
  if (!value) throw new Error('useDb must be used inside an unlocked app');
  return value;
}
