import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CorruptRecordError } from '../crypto/cipher';
import { utf8 } from '../crypto/encoding';
import { WrongSecretError } from '../crypto/vault';
import type { RecordStore } from './recordStore';
import { initialize, isInitialized, unlock } from './session';
import { IndexedDbRecordStore } from './stores/indexedDbStore';
import { MemoryRecordStore } from './stores/memoryStore';
import { doseLogId, labResultId, type DoseLog, type Medication } from './types';

const IT = 1_000;
const NOW = '2026-10-13T00:00:00.000Z';

function medication(id: string, name: string): Medication {
  return {
    id,
    name,
    form: 'pill',
    dose: 2,
    unit: 'mg',
    schedule: { type: 'daily', times: ['09:00'] },
    startDate: '2026-10-01',
    notify: true,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function doseLog(medicationId: string, scheduledAt: string): DoseLog {
  return {
    id: doseLogId(medicationId, scheduledAt),
    medicationId,
    scheduledAt,
    status: 'taken',
    doseSnapshot: 2,
    unitSnapshot: 'mg',
    createdAt: NOW,
  };
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

let dbCounter = 0;
const stores: Record<string, () => Promise<{ store: RecordStore; reopen: () => Promise<RecordStore> }>> = {
  memory: async () => {
    const store = new MemoryRecordStore();
    return { store, reopen: async () => store };
  },
  indexeddb: async () => {
    const name = `test-${++dbCounter}`;
    return { store: await IndexedDbRecordStore.open(name), reopen: () => IndexedDbRecordStore.open(name) };
  },
};

for (const [label, make] of Object.entries(stores)) {
  describe(`Database on ${label}`, () => {
    it('round-trips records across unlocks', async () => {
      const { store, reopen } = await make();
      expect(await isInitialized(store)).toBe(false);

      const db = await initialize(store, 'passphrase', IT);
      await db.put('medications', medication('m1', 'Sample A'));
      expect(await db.get('medications', 'm1')).toMatchObject({ name: 'Sample A' });

      const db2 = await unlock(await reopen(), 'passphrase');
      expect(await db2.all('medications')).toEqual([medication('m1', 'Sample A')]);
    });

    it('rejects a wrong secret', async () => {
      const { store } = await make();
      await initialize(store, 'passphrase', IT);
      await expect(unlock(store, 'nope')).rejects.toBeInstanceOf(WrongSecretError);
    });

    it('never writes plaintext to the store', async () => {
      const { store } = await make();
      const db = await initialize(store, 'passphrase', IT);
      await db.put('medications', medication('m1', 'VerySecretName'));

      const needle = utf8.encode('VerySecretName');
      for (const r of await store.listTable('medications')) {
        expect(containsBytes(r.ct, needle)).toBe(false);
      }
    });

    it('cascades deletes to child rows', async () => {
      const { store } = await make();
      const db = await initialize(store, 'passphrase', IT);
      await db.batch((b) => {
        b.put('medications', medication('m1', 'A'), medication('m2', 'B'));
        b.put('dose_logs', doseLog('m1', '2026-10-12T09:00'), doseLog('m2', '2026-10-12T09:00'));
      });

      const removed = await db.removeCascade('medications', 'm1');
      expect(removed).toEqual([
        { table: 'medications', id: 'm1' },
        { table: 'dose_logs', id: doseLogId('m1', '2026-10-12T09:00') },
      ]);
      expect((await db.all('dose_logs')).map((d) => d.medicationId)).toEqual(['m2']);
    });

    it('removes lab results when either parent is removed', async () => {
      const { store } = await make();
      const db = await initialize(store, 'passphrase', IT);
      await db.batch((b) => {
        b.put('lab_items', { id: 'i1', name: 'Item', sortOrder: 0, createdAt: NOW });
        b.put('lab_sessions', { id: 's1', date: '2026-10-01', createdAt: NOW });
        b.put('lab_results', {
          id: labResultId('s1', 'i1'),
          sessionId: 's1',
          itemId: 'i1',
          value: 1.5,
          unit: 'u',
        });
      });
      await db.removeCascade('lab_items', 'i1');
      expect(await db.all('lab_results')).toEqual([]);
      expect(await db.all('lab_sessions')).toHaveLength(1);
    });
  });
}

describe('change notifications', () => {
  it('reports touched tables after a successful write', async () => {
    const db = await initialize(new MemoryRecordStore(), 'passphrase', IT);
    const seen: string[][] = [];
    const unsubscribe = db.subscribe((tables) => seen.push([...tables].sort()));

    await db.batch((b) => {
      b.put('medications', medication('m1', 'A'));
      b.put('dose_logs', doseLog('m1', '2026-10-12T09:00'));
    });
    unsubscribe();
    await db.put('medications', medication('m2', 'B'));

    expect(seen).toEqual([['dose_logs', 'medications']]);
  });
});

describe('tamper detection', () => {
  it('fails when a ciphertext is moved to another id', async () => {
    const store = new MemoryRecordStore();
    const db = await initialize(store, 'passphrase', IT);
    await db.put('medications', medication('m1', 'A'));

    const [row] = await store.listTable('medications');
    await store.write([{ type: 'put', record: { ...row!, id: 'm2' } }]);

    const fresh = await unlock(store, 'passphrase');
    await expect(fresh.all('medications')).rejects.toBeInstanceOf(CorruptRecordError);
  });
});
