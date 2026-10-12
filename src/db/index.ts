import { Capacitor } from '@capacitor/core';
import type { RecordStore } from './recordStore';

const DB_NAME = 'dayline';

/** SQLite on Android, IndexedDB in the browser. Both only ever receive ciphertext. */
export async function openRecordStore(): Promise<RecordStore> {
  if (Capacitor.isNativePlatform()) {
    const { SqliteRecordStore } = await import('./stores/sqliteStore');
    return SqliteRecordStore.open(DB_NAME);
  }
  const { IndexedDbRecordStore } = await import('./stores/indexedDbStore');
  return IndexedDbRecordStore.open(DB_NAME);
}

export { Database } from './database';
export * from './session';
export * from './types';
