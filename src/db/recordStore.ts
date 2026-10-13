/**
 * Platform storage boundary. Implementations only ever see ciphertext:
 * they store opaque (table, id, iv, ct) rows, opaque encrypted blobs (photos),
 * plus a few plaintext meta values (vault header, schema version).
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

export interface StoredBlob {
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

export interface RecordStore {
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  listTable(table: string): Promise<StoredRecord[]>;
  /** Applies all ops atomically: either every op succeeds or none does. */
  write(ops: WriteOp[]): Promise<void>;

  /** Large binary values (photos), kept out of the record table. */
  putBlob(id: string, blob: StoredBlob): Promise<void>;
  getBlob(id: string): Promise<StoredBlob | undefined>;
  deleteBlobs(ids: string[]): Promise<void>;
  listBlobIds(): Promise<string[]>;

  /** Deletes all records, blobs and meta. */
  wipe(): Promise<void>;
  close(): Promise<void>;
}

export const META_VAULT = 'vault';
export const META_SCHEMA_VERSION = 'schema_version';
