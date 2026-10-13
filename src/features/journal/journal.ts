import type { Database } from '../../db';
import type { JournalEntry, JournalPhoto, LocalDate, Mood } from '../../db/types';

export const MOODS: { value: Mood; label: string; face: string }[] = [
  { value: 1, label: '매우 나쁨', face: '😣' },
  { value: 2, label: '나쁨', face: '🙁' },
  { value: 3, label: '보통', face: '😐' },
  { value: 4, label: '좋음', face: '🙂' },
  { value: 5, label: '매우 좋음', face: '😄' },
];

export function moodOf(value: Mood | undefined) {
  return MOODS.find((m) => m.value === value);
}

/** Per entry, more photos than this get unwieldy on a phone. */
export const MAX_PHOTOS = 10;

export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function photosByEntry(photos: JournalPhoto[]): Map<string, JournalPhoto[]> {
  const map = new Map<string, JournalPhoto[]>();
  for (const p of [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const list = map.get(p.entryId) ?? [];
    list.push(p);
    map.set(p.entryId, list);
  }
  return map;
}

export interface EntryInput {
  /** Existing entry when editing. */
  entry?: JournalEntry;
  date: LocalDate;
  mood?: Mood;
  note: string;
  sideEffects: string;
  /** JPEG bytes of photos added in this edit. */
  newPhotos: Uint8Array<ArrayBuffer>[];
  /** Existing photos removed in this edit. */
  removedPhotoIds: string[];
  /** Existing photos kept. */
  keptPhotoCount: number;
}

export function validateEntry(input: EntryInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return '날짜를 넣어 주세요.';
  const hasContent =
    input.mood !== undefined ||
    input.note.trim() !== '' ||
    input.sideEffects.trim() !== '' ||
    input.keptPhotoCount + input.newPhotos.length > 0;
  return hasContent ? null : '기분, 메모, 사진 중 하나는 남겨 주세요.';
}

/**
 * Saves an entry with its photo changes. Blobs are written before the records that
 * point to them and deleted after, so a crash can only leave unreferenced blobs.
 */
export async function saveEntry(db: Database, input: EntryInput, now = new Date()): Promise<JournalEntry> {
  const ts = now.toISOString();
  const entry: JournalEntry = input.entry
    ? { ...input.entry, date: input.date, updatedAt: ts }
    : { id: crypto.randomUUID(), date: input.date, createdAt: ts, updatedAt: ts };
  if (input.mood !== undefined) entry.mood = input.mood;
  else delete entry.mood;
  const note = input.note.trim();
  if (note) entry.note = note;
  else delete entry.note;
  const sideEffects = input.sideEffects.trim();
  if (sideEffects) entry.sideEffects = sideEffects;
  else delete entry.sideEffects;

  const photos: JournalPhoto[] = [];
  for (const bytes of input.newPhotos) {
    const photo: JournalPhoto = { id: crypto.randomUUID(), entryId: entry.id, mime: 'image/jpeg', createdAt: ts };
    await db.putBlob(photo.id, bytes);
    photos.push(photo);
  }

  await db.batch((b) => {
    b.put('journal_entries', entry);
    b.put('journal_photos', ...photos);
    b.remove('journal_photos', ...input.removedPhotoIds);
  });
  await db.deleteBlobs(input.removedPhotoIds);
  return entry;
}

/** Deletes an entry, its photo records and the encrypted photo files. */
export async function deleteEntry(db: Database, entryId: string): Promise<void> {
  const removed = await db.removeCascade('journal_entries', entryId);
  await db.deleteBlobs(removed.filter((r) => r.table === 'journal_photos').map((r) => r.id));
}
