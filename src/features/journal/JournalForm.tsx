import { useRef, useState, type ChangeEvent } from 'react';
import { useDb } from '../../app/DbContext';
import type { JournalEntry, JournalPhoto, Mood } from '../../db/types';
import { cleanCaptureLeftovers, prepareImage, UnsupportedImageError } from '../../services/images';
import { today } from '../../utils/time';
import { deleteEntry, MAX_PHOTOS, MOODS, saveEntry, validateEntry } from './journal';
import { PhotoThumb, PhotoViewer, StoredPhotoThumb } from './Photos';

interface Props {
  entry?: JournalEntry;
  photos: JournalPhoto[];
  onDone: () => void;
}

interface NewPhoto {
  key: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export function JournalForm({ entry, photos, onDone }: Props) {
  const { db } = useDb();
  const [date, setDate] = useState(entry?.date ?? today());
  const [mood, setMood] = useState<Mood | undefined>(entry?.mood);
  const [note, setNote] = useState(entry?.note ?? '');
  const [sideEffects, setSideEffects] = useState(entry?.sideEffects ?? '');
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedAlbum, setUsedAlbum] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);

  const kept = photos.filter((p) => !removed.includes(p.id));
  const photoCount = kept.length + added.length;

  async function onFiles(e: ChangeEvent<HTMLInputElement>, fromAlbum: boolean) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    if (fromAlbum) setUsedAlbum(true);
    const room = MAX_PHOTOS - photoCount;
    if (files.length > room) setError(`사진은 한 번에 ${MAX_PHOTOS}장까지 넣을 수 있어요.`);
    setProcessing(true);
    try {
      const next: NewPhoto[] = [];
      for (const file of files.slice(0, Math.max(0, room))) {
        next.push({ key: crypto.randomUUID(), bytes: await prepareImage(file) });
      }
      setAdded((a) => [...a, ...next]);
    } catch (err) {
      setError(err instanceof UnsupportedImageError ? '이 형식의 사진은 열 수 없어요.' : '사진을 불러오지 못했어요.');
    } finally {
      setProcessing(false);
      // Taking a photo leaves a plaintext copy behind on Android; remove it right away.
      void cleanCaptureLeftovers();
    }
  }

  async function save() {
    const input = {
      entry,
      date,
      mood,
      note,
      sideEffects,
      newPhotos: added.map((a) => a.bytes),
      removedPhotoIds: removed,
      keptPhotoCount: kept.length,
    };
    const problem = validateEntry(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await saveEntry(db, input);
      onDone();
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry) return;
    const extra = photos.length > 0 ? `\n사진 ${photos.length}장도 함께 지워져요.` : '';
    if (!confirm(`이 일지를 삭제할까요?${extra}`)) return;
    await deleteEntry(db, entry.id);
    onDone();
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="ghost" onClick={onDone}>
          ← 뒤로
        </button>
        <h2>{entry ? '일지 수정' : '일지 쓰기'}</h2>
      </div>

      <label className="field">
        <span>날짜</span>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>기분 (선택)</legend>
        <div className="chips mood-chips">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className="chip mood-chip"
              aria-pressed={mood === m.value}
              onClick={() => setMood((cur) => (cur === m.value ? undefined : m.value))}
            >
              <span aria-hidden>{m.face}</span>
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>메모</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={5000} />
      </label>

      <label className="field">
        <span>부작용 메모 (선택)</span>
        <textarea value={sideEffects} onChange={(e) => setSideEffects(e.target.value)} rows={3} maxLength={2000} />
      </label>

      <fieldset className="field">
        <legend>사진 (선택)</legend>
        <p className="muted small-text">
          사진은 암호화되어 이 앱 안에만 저장되고, 갤러리에는 나타나지 않아요. 위치 같은 사진 정보는 지워져요.
        </p>
        {photoCount > 0 && (
          <div className="thumbs">
            {kept.map((p, i) => (
              <StoredPhotoThumb
                key={p.id}
                id={p.id}
                label={`사진 ${i + 1}`}
                onOpen={setViewing}
                onRemove={() => setRemoved((r) => [...r, p.id])}
              />
            ))}
            {added.map((a, i) => (
              <PhotoThumb
                key={a.key}
                bytes={a.bytes}
                label={`사진 ${kept.length + i + 1}`}
                onOpen={setViewing}
                onRemove={() => setAdded((list) => list.filter((x) => x.key !== a.key))}
              />
            ))}
          </div>
        )}
        {processing && <p className="muted small-text">사진을 준비하는 중…</p>}
        {photoCount < MAX_PHOTOS && (
          <div className="inline">
            <button type="button" onClick={() => cameraInput.current?.click()} disabled={processing}>
              사진 찍기
            </button>
            <button type="button" onClick={() => albumInput.current?.click()} disabled={processing}>
              앨범에서 선택
            </button>
          </div>
        )}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void onFiles(e, false)}
        />
        <input
          ref={albumInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e, true)}
        />
        {usedAlbum && (
          <p className="muted small-text">앨범에서 고른 원본은 앨범에 그대로 남아요. 필요하면 앨범에서 직접 지워 주세요.</p>
        )}
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="primary" onClick={() => void save()} disabled={saving || processing}>
        저장
      </button>

      {entry && (
        <div className="danger-zone">
          <span />
          <button type="button" className="danger" onClick={() => void remove()}>
            일지 삭제
          </button>
        </div>
      )}

      {viewing && <PhotoViewer url={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
