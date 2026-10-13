import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../app/DbContext';

/** Object URL for decrypted bytes; revoked on unmount so plaintext doesn't linger. */
function useObjectUrl(bytes: Uint8Array<ArrayBuffer> | undefined, mime = 'image/jpeg'): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!bytes) return;
    const next = URL.createObjectURL(new Blob([bytes], { type: mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, mime]);
  return url;
}

/** Decrypts a stored photo. */
export function useStoredPhoto(id: string): Uint8Array<ArrayBuffer> | undefined | null {
  const { db } = useDb();
  const [bytes, setBytes] = useState<Uint8Array<ArrayBuffer> | null>();
  useEffect(() => {
    let alive = true;
    db.getBlob(id).then(
      (b) => alive && setBytes(b ?? null),
      () => alive && setBytes(null),
    );
    return () => {
      alive = false;
    };
  }, [db, id]);
  return bytes;
}

interface ThumbProps {
  bytes: Uint8Array<ArrayBuffer> | undefined | null;
  label: string;
  onOpen: (url: string) => void;
  onRemove?: () => void;
}

export function PhotoThumb({ bytes, label, onOpen, onRemove }: ThumbProps) {
  const url = useObjectUrl(bytes ?? undefined);
  return (
    <div className="thumb">
      {bytes === null ? (
        <span className="thumb-missing">열 수 없음</span>
      ) : url ? (
        <button type="button" className="thumb-open" onClick={() => onOpen(url)} aria-label={`${label} 크게 보기`}>
          <img src={url} alt="" />
        </button>
      ) : (
        <span className="thumb-loading" aria-label="불러오는 중" />
      )}
      {onRemove && (
        <button type="button" className="thumb-remove" onClick={onRemove} aria-label={`${label} 삭제`}>
          ✕
        </button>
      )}
    </div>
  );
}

export function StoredPhotoThumb({ id, ...rest }: Omit<ThumbProps, 'bytes'> & { id: string }) {
  return <PhotoThumb bytes={useStoredPhoto(id)} {...rest} />;
}

/** Full-size view in a modal dialog. */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="photo-viewer"
      aria-label="사진"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <img src={url} alt="" />
      <button type="button" className="photo-viewer-close" onClick={onClose}>
        닫기
      </button>
    </dialog>
  );
}
