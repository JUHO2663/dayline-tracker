import type { RecordStore, StoredBlob, StoredRecord, WriteOp } from '../recordStore';

/** In-memory store for tests. */
export class MemoryRecordStore implements RecordStore {
  readonly records = new Map<string, StoredRecord>();
  readonly blobs = new Map<string, StoredBlob>();
  readonly meta = new Map<string, string>();

  private static key(table: string, id: string) {
    return `${table}\u0000${id}`;
  }

  async getMeta(key: string) {
    return this.meta.get(key);
  }

  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  async listTable(table: string) {
    return [...this.records.values()].filter((r) => r.table === table);
  }

  async write(ops: WriteOp[]) {
    for (const op of ops) {
      if (op.type === 'put') {
        this.records.set(MemoryRecordStore.key(op.record.table, op.record.id), op.record);
      } else {
        this.records.delete(MemoryRecordStore.key(op.table, op.id));
      }
    }
  }

  async putBlob(id: string, blob: StoredBlob) {
    this.blobs.set(id, blob);
  }

  async getBlob(id: string) {
    return this.blobs.get(id);
  }

  async deleteBlobs(ids: string[]) {
    for (const id of ids) this.blobs.delete(id);
  }

  async listBlobIds() {
    return [...this.blobs.keys()];
  }

  async wipe() {
    this.records.clear();
    this.blobs.clear();
    this.meta.clear();
  }

  async close() {}
}
