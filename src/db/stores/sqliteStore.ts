import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes, bytesToBase64 } from '../../crypto/encoding';
import type { RecordStore, StoredBlob, StoredRecord, WriteOp } from '../recordStore';

/**
 * Physical schema. Every row's content is AES-GCM ciphertext (base64) produced by the app,
 * so SQLCipher is not needed. The database file lives in the app's private storage.
 *
 * Blobs (photos) are files in app-private internal storage (Directory.Data), never in
 * shared/media storage, so they don't appear in the gallery. Each file is iv ‖ ciphertext.
 */
const BLOB_DIR = 'blobs';
const IV_BYTES = 12;
const isMissing = (err: unknown) => /not exist|does not exist|no such file/i.test(String(err));
const DDL = `
CREATE TABLE IF NOT EXISTS records (
  tbl TEXT NOT NULL,
  id  TEXT NOT NULL,
  iv  TEXT NOT NULL,
  ct  TEXT NOT NULL,
  PRIMARY KEY (tbl, id)
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

interface RecordRow {
  tbl: string;
  id: string;
  iv: string;
  ct: string;
}

/** Android storage via @capacitor-community/sqlite. */
export class SqliteRecordStore implements RecordStore {
  private constructor(
    private readonly sqlite: SQLiteConnection,
    private readonly conn: SQLiteDBConnection,
    private readonly name: string,
  ) {}

  static async open(name: string): Promise<SqliteRecordStore> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.checkConnectionsConsistency();
    const exists = (await sqlite.isConnection(name, false)).result;
    const conn = exists
      ? await sqlite.retrieveConnection(name, false)
      : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
    if (!(await conn.isDBOpen()).result) await conn.open();
    await conn.execute(DDL);
    return new SqliteRecordStore(sqlite, conn, name);
  }

  async getMeta(key: string) {
    const res = await this.conn.query('SELECT value FROM meta WHERE key = ?', [key]);
    return (res.values?.[0] as { value: string } | undefined)?.value;
  }

  async setMeta(key: string, value: string) {
    await this.conn.run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  async listTable(table: string): Promise<StoredRecord[]> {
    const res = await this.conn.query('SELECT tbl, id, iv, ct FROM records WHERE tbl = ?', [table]);
    return ((res.values ?? []) as RecordRow[]).map((row) => ({
      table: row.tbl,
      id: row.id,
      iv: base64ToBytes(row.iv),
      ct: base64ToBytes(row.ct),
    }));
  }

  async write(ops: WriteOp[]) {
    if (ops.length === 0) return;
    await this.conn.executeSet(
      ops.map((op) =>
        op.type === 'put'
          ? {
              statement:
                'INSERT OR REPLACE INTO records (tbl, id, iv, ct) VALUES (?, ?, ?, ?)',
              values: [
                op.record.table,
                op.record.id,
                bytesToBase64(op.record.iv),
                bytesToBase64(op.record.ct),
              ],
            }
          : { statement: 'DELETE FROM records WHERE tbl = ? AND id = ?', values: [op.table, op.id] },
      ),
      true,
    );
  }

  async putBlob(id: string, blob: StoredBlob) {
    const joined = new Uint8Array(IV_BYTES + blob.ct.length);
    joined.set(blob.iv, 0);
    joined.set(blob.ct, IV_BYTES);
    await Filesystem.writeFile({
      path: `${BLOB_DIR}/${id}`,
      data: bytesToBase64(joined),
      directory: Directory.Data,
      recursive: true,
    });
  }

  async getBlob(id: string): Promise<StoredBlob | undefined> {
    try {
      const { data } = await Filesystem.readFile({ path: `${BLOB_DIR}/${id}`, directory: Directory.Data });
      if (typeof data !== 'string') throw new Error('Unexpected blob data');
      const joined = base64ToBytes(data);
      return { iv: joined.slice(0, IV_BYTES), ct: joined.slice(IV_BYTES) };
    } catch (err) {
      if (isMissing(err)) return undefined;
      throw err;
    }
  }

  async deleteBlobs(ids: string[]) {
    for (const id of ids) {
      try {
        await Filesystem.deleteFile({ path: `${BLOB_DIR}/${id}`, directory: Directory.Data });
      } catch (err) {
        if (!isMissing(err)) throw err;
      }
    }
  }

  async listBlobIds() {
    try {
      const { files } = await Filesystem.readdir({ path: BLOB_DIR, directory: Directory.Data });
      return files.map((f) => f.name);
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }

  async wipe() {
    await this.conn.execute('DELETE FROM records; DELETE FROM meta;');
    try {
      await Filesystem.rmdir({ path: BLOB_DIR, directory: Directory.Data, recursive: true });
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }

  async close() {
    await this.sqlite.closeConnection(this.name, false);
  }
}
