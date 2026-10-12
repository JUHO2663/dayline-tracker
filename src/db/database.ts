import { openJson, sealJson } from '../crypto/cipher';
import type { RecordStore, WriteOp } from './recordStore';
import { RELATIONS, type TableName, type TableTypes } from './types';

type Row<K extends TableName> = TableTypes[K];
type Table<K extends TableName> = Map<string, Row<K>>;

export interface RecordRef {
  table: TableName;
  id: string;
}

export interface Batch {
  put<K extends TableName>(table: K, ...items: Row<K>[]): void;
  remove(table: TableName, ...ids: string[]): void;
}

/**
 * Encrypted document database shared by every platform.
 *
 * Each table is decrypted into memory on first access and kept in sync on writes.
 * A personal log stays small (thousands of rows), so filtering happens in memory
 * instead of through indexes — which also means nothing but ids is stored in plaintext.
 */
export class Database {
  private readonly tables = new Map<TableName, Promise<Map<string, unknown>>>();
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: RecordStore,
    private readonly key: CryptoKey,
  ) {}

  private load<K extends TableName>(table: K): Promise<Table<K>> {
    let loading = this.tables.get(table);
    if (!loading) {
      loading = this.store.listTable(table).then(async (stored) => {
        const rows = await Promise.all(
          stored.map((r) => openJson<Row<K>>(this.key, table, r.id, r)),
        );
        return new Map(rows.map((row) => [row.id, row]));
      });
      loading.catch(() => this.tables.delete(table));
      this.tables.set(table, loading);
    }
    return loading as Promise<Table<K>>;
  }

  async all<K extends TableName>(table: K): Promise<Row<K>[]> {
    return [...(await this.load(table)).values()];
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | undefined> {
    return (await this.load(table)).get(id);
  }

  async put<K extends TableName>(table: K, ...items: Row<K>[]): Promise<void> {
    await this.batch((b) => b.put(table, ...items));
  }

  /** Removes rows without touching children. Prefer removeCascade for parent tables. */
  async remove(table: TableName, ...ids: string[]): Promise<void> {
    await this.batch((b) => b.remove(table, ...ids));
  }

  /**
   * Removes a row and, recursively, every child row that references it (see RELATIONS).
   * Returns everything that was removed so callers can clean up photos and notifications.
   */
  async removeCascade(table: TableName, id: string): Promise<RecordRef[]> {
    const removed: RecordRef[] = [];
    const visit = async (t: TableName, rowId: string) => {
      if (removed.some((r) => r.table === t && r.id === rowId)) return;
      removed.push({ table: t, id: rowId });
      for (const rel of RELATIONS.filter((r) => r.parent === t)) {
        for (const child of await this.all(rel.child)) {
          if ((child as unknown as Record<string, unknown>)[rel.field] === rowId) {
            await visit(rel.child, child.id);
          }
        }
      }
    };
    await visit(table, id);
    await this.batch((b) => {
      for (const r of removed) b.remove(r.table, r.id);
    });
    return removed;
  }

  /** Runs several puts/removes as one atomic write. */
  batch(build: (b: Batch) => void): Promise<void> {
    const puts: { table: TableName; item: { id: string } }[] = [];
    const removes: RecordRef[] = [];
    build({
      put: (table, ...items) => items.forEach((item) => puts.push({ table, item })),
      remove: (table, ...ids) => ids.forEach((id) => removes.push({ table, id })),
    });
    const run = () => this.commit(puts, removes);
    const result = this.writes.then(run, run);
    this.writes = result.catch(() => undefined);
    return result;
  }

  private async commit(
    puts: { table: TableName; item: { id: string } }[],
    removes: RecordRef[],
  ): Promise<void> {
    if (puts.length === 0 && removes.length === 0) return;
    // Load affected tables first so the in-memory copy can't miss this write.
    const touched = new Set<TableName>([...puts, ...removes].map((x) => x.table));
    await Promise.all([...touched].map((t) => this.load(t)));

    const ops: WriteOp[] = [];
    for (const { table, item } of puts) {
      const sealed = await sealJson(this.key, table, item.id, item);
      ops.push({ type: 'put', record: { table, id: item.id, ...sealed } });
    }
    for (const { table, id } of removes) ops.push({ type: 'delete', table, id });

    await this.store.write(ops);

    for (const { table, item } of puts) {
      (await this.tables.get(table)!).set(item.id, structuredClone(item));
    }
    for (const { table, id } of removes) {
      (await this.tables.get(table)!).delete(id);
    }
  }

  /** Drops decrypted data from memory. The Database must not be used afterwards. */
  async close(): Promise<void> {
    await this.writes;
    this.tables.clear();
    await this.store.close();
  }
}
