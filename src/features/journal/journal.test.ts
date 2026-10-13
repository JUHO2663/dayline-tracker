import { describe, expect, it } from 'vitest';
import { initialize } from '../../db/session';
import { MemoryRecordStore } from '../../db/stores/memoryStore';
import { deleteEntry, saveEntry, validateEntry, type EntryInput } from './journal';

const input = (overrides: Partial<EntryInput> = {}): EntryInput => ({
  date: '2026-10-13',
  note: '',
  sideEffects: '',
  newPhotos: [],
  removedPhotoIds: [],
  keptPhotoCount: 0,
  ...overrides,
});

const photo = (n: number) => new Uint8Array([n, n, n]);

async function setup() {
  const store = new MemoryRecordStore();
  return { store, db: await initialize(store, 'passphrase', 1_000) };
}

describe('validateEntry', () => {
  it('needs at least one of mood, note, side effects or photo', () => {
    expect(validateEntry(input())).not.toBeNull();
    expect(validateEntry(input({ note: '   ' }))).not.toBeNull();
    expect(validateEntry(input({ mood: 3 }))).toBeNull();
    expect(validateEntry(input({ sideEffects: 'x' }))).toBeNull();
    expect(validateEntry(input({ newPhotos: [photo(1)] }))).toBeNull();
    expect(validateEntry(input({ date: '' , note: 'x' }))).not.toBeNull();
  });
});

describe('saveEntry / deleteEntry', () => {
  it('saves photos encrypted and links them to the entry', async () => {
    const { store, db } = await setup();
    const entry = await saveEntry(db, input({ mood: 4, note: ' hello ', newPhotos: [photo(1), photo(2)] }));
    expect(entry).toMatchObject({ mood: 4, note: 'hello' });
    expect(entry).not.toHaveProperty('sideEffects');

    const photos = await db.all('journal_photos');
    expect(photos).toHaveLength(2);
    expect(photos.every((p) => p.entryId === entry.id)).toBe(true);
    expect(store.blobs.size).toBe(2);
    expect(await db.getBlob(photos[0]!.id)).toBeDefined();
  });

  it('removes photo records and files when editing', async () => {
    const { store, db } = await setup();
    const entry = await saveEntry(db, input({ note: 'a', newPhotos: [photo(1), photo(2)] }));
    const [first, second] = await db.all('journal_photos');

    const edited = await saveEntry(
      db,
      input({ entry, note: '', mood: 2, removedPhotoIds: [first!.id], keptPhotoCount: 1 }),
    );
    expect(edited).not.toHaveProperty('note');
    expect((await db.all('journal_photos')).map((p) => p.id)).toEqual([second!.id]);
    expect([...store.blobs.keys()]).toEqual([second!.id]);
  });

  it('deletes the entry with all its photos', async () => {
    const { store, db } = await setup();
    const keep = await saveEntry(db, input({ note: 'keep', newPhotos: [photo(9)] }));
    const gone = await saveEntry(db, input({ note: 'gone', newPhotos: [photo(1), photo(2)] }));

    await deleteEntry(db, gone.id);
    expect((await db.all('journal_entries')).map((e) => e.id)).toEqual([keep.id]);
    expect(await db.all('journal_photos')).toHaveLength(1);
    expect(store.blobs.size).toBe(1);
  });
});
