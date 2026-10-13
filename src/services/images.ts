import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/** Longest edge after resizing. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export class UnsupportedImageError extends Error {
  constructor() {
    super('Unsupported image');
    this.name = 'UnsupportedImageError';
  }
}

/**
 * Resizes and re-encodes a photo as JPEG.
 *
 * Re-encoding through a canvas also drops all metadata (EXIF: GPS location, camera,
 * timestamps), so nothing but pixels is stored. Orientation is applied first.
 */
export async function prepareImage(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UnsupportedImageError();
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UnsupportedImageError();
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  canvas.width = canvas.height = 0;
  if (!blob) throw new UnsupportedImageError();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Android only. When a photo is taken through the WebView file chooser, Capacitor writes
 * the original JPEG to the app's external files dir (Android/data/<app>/files/Pictures)
 * and never deletes it. Remove those plaintext copies once the encrypted copy is saved,
 * and keep a .nomedia marker so media scanners on older Android versions skip the folder.
 */
export async function cleanCaptureLeftovers(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const dir = 'Pictures';
  try {
    const { files } = await Filesystem.readdir({ path: dir, directory: Directory.External });
    for (const f of files) {
      if (f.name === '.nomedia' || f.type === 'directory') continue;
      await Filesystem.deleteFile({ path: `${dir}/${f.name}`, directory: Directory.External });
    }
  } catch {
    // Folder doesn't exist yet: nothing to clean.
  }
  try {
    await Filesystem.writeFile({
      path: `${dir}/.nomedia`,
      data: '',
      directory: Directory.External,
      recursive: true,
    });
  } catch {
    // Best effort; the cleanup above is what matters.
  }
}
