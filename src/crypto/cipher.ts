import { randomBytes, utf8 } from './encoding';

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

export class CorruptRecordError extends Error {
  constructor(context: string) {
    super(`Record could not be decrypted: ${context}`);
    this.name = 'CorruptRecordError';
  }
}

/**
 * Binds a ciphertext to where it is stored, so a record cannot be swapped into
 * another table or id without failing authentication.
 */
function recordAad(table: string, id: string): Uint8Array<ArrayBuffer> {
  return utf8.encode(`dayline/record/v1\u0000${table}\u0000${id}`);
}

function blobAad(id: string): Uint8Array<ArrayBuffer> {
  return utf8.encode(`dayline/blob/v1\u0000${id}`);
}

/** Encrypts binary data (photos), bound to its blob id. */
export async function sealBytes(key: CryptoKey, id: string, bytes: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: blobAad(id) }, key, bytes);
  return { iv, ct: new Uint8Array(ct) };
}

export async function openBytes(key: CryptoKey, id: string, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: blobAad(id) },
      key,
      sealed.ct,
    );
    return new Uint8Array(plain);
  } catch {
    throw new CorruptRecordError(`blob/${id}`);
  }
}

export async function sealJson(
  key: CryptoKey,
  table: string,
  id: string,
  value: unknown,
): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: recordAad(table, id) },
    key,
    utf8.encode(JSON.stringify(value)),
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function openJson<T>(
  key: CryptoKey,
  table: string,
  id: string,
  sealed: Sealed,
): Promise<T> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.iv, additionalData: recordAad(table, id) },
      key,
      sealed.ct,
    );
  } catch {
    throw new CorruptRecordError(`${table}/${id}`);
  }
  return JSON.parse(utf8.decode(new Uint8Array(plain))) as T;
}
