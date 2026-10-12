import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RecordStore, StoredRecord, WriteOp } from '../recordStore';

interface DaylineIdb extends DBSchema {
  records: {
    key: [string, string];
    value: StoredRecord;
    indexes: { by_table: string };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

/** Web storage. Rows hold AES-GCM ciphertext only. */
export class IndexedDbRecordStore implements RecordStore {
  private constructor(private readonly db: IDBPDatabase<DaylineIdb>) {}

  static async open(name: string): Promise<IndexedDbRecordStore> {
    const db = await openDB<DaylineIdb>(name, 1, {
      upgrade(db) {
        const records = db.createObjectStore('records', { keyPath: ['table', 'id'] });
        records.createIndex('by_table', 'table');
        db.createObjectStore('meta', { keyPath: 'key' });
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

  async wipe() {
    const tx = this.db.transaction(['records', 'meta'], 'readwrite');
    await Promise.all([tx.objectStore('records').clear(), tx.objectStore('meta').clear(), tx.done]);
  }

  async close() {
    this.db.close();
  }
}
