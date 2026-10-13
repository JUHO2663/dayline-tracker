import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RecordStore, StoredBlob, StoredRecord, WriteOp } from '../recordStore';

interface DaylineIdb extends DBSchema {
  records: {
    key: [string, string];
    value: StoredRecord;
    indexes: { by_table: string };
  };
  blobs: {
    key: string;
    value: StoredBlob & { id: string };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

/** Web storage. Rows and blobs hold AES-GCM ciphertext only. */
export class IndexedDbRecordStore implements RecordStore {
  private constructor(private readonly db: IDBPDatabase<DaylineIdb>) {}

  static async open(name: string): Promise<IndexedDbRecordStore> {
    const db = await openDB<DaylineIdb>(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const records = db.createObjectStore('records', { keyPath: ['table', 'id'] });
          records.createIndex('by_table', 'table');
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      },
    });
    return new IndexedDbRecordStore(db);
  }

  async getMeta(key: string) {
    return (await this.db.get('meta', key))?.value;
  }

  async setMeta(key: string, value: string) {
    await this.db.put('meta', { key, value });
  }

  async listTable(table: string) {
    return this.db.getAllFromIndex('records', 'by_table', table);
  }

  async write(ops: WriteOp[]) {
    if (ops.length === 0) return;
    const tx = this.db.transaction('records', 'readwrite');
    await Promise.all([
      ...ops.map((op) =>
        op.type === 'put' ? tx.store.put(op.record) : tx.store.delete([op.table, op.id]),
      ),
      tx.done,
    ]);
  }

  async putBlob(id: string, blob: StoredBlob) {
    await this.db.put('blobs', { id, iv: blob.iv, ct: blob.ct });
  }

  async getBlob(id: string) {
    const row = await this.db.get('blobs', id);
    return row && { iv: row.iv, ct: row.ct };
  }

  async deleteBlobs(ids: string[]) {
    if (ids.length === 0) return;
    const tx = this.db.transaction('blobs', 'readwrite');
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  }

  async listBlobIds() {
    return this.db.getAllKeys('blobs');
  }

  async wipe() {
    const tx = this.db.transaction(['records', 'blobs', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('records').clear(),
      tx.objectStore('blobs').clear(),
      tx.objectStore('meta').clear(),
      tx.done,
    ]);
  }

  async close() {
    this.db.close();
  }
}
