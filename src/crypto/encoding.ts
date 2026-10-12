// Base64 helpers. Uint8Array.toBase64 is not yet available in every Android WebView,
// so this uses btoa/atob in chunks.

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = {
  encode: (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text),
  decode: (bytes: Uint8Array): string => decoder.decode(bytes),
};
