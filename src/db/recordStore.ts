/**
 * Platform storage boundary. Implementations only ever see ciphertext:
 * they store opaque (table, id, iv, ct) rows plus a few plaintext meta values
 * (vault header, schema version).
 *
 * Implementations: IndexedDbRecordStore (web), SqliteRecordStore (Android), MemoryRecordStore (tests).
 */

export interface StoredRecord {
  table: string;
  id: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

export type WriteOp =
  | { type: 'put'; record: StoredRecord }
  | { type: 'delete'; table: string; id: string };

export interface RecordStore {
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  listTable(table: string): Promise<StoredRecord[]>;
  /** Applies all ops atomically: either every op succeeds or none does. */
  write(ops: WriteOp[]): Promise<void>;
  /** Deletes all records and meta. */
  wipe(): Promise<void>;
  close(): Promise<void>;
}

export const META_VAULT = 'vault';
export const META_SCHEMA_VERSION = 'schema_version';
