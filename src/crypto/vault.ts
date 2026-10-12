import { base64ToBytes, bytesToBase64, randomBytes, utf8 } from './encoding';

/**
 * Envelope encryption.
 *
 * - A random 256-bit data key encrypts every record.
 * - The data key is stored only in wrapped (encrypted) form, using a key derived from the
 *   user's PIN/passphrase with PBKDF2-SHA256.
 * - Unlocking = unwrapping. A wrong secret fails the AES-GCM tag check, so no PIN hash is stored.
 * - Changing the secret only re-wraps the data key; records are not re-encrypted.
 *
 * If the secret is forgotten the data cannot be recovered. That is intentional.
 */

/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_KDF_ITERATIONS = 600_000;

const HEADER_AAD = utf8.encode('dayline/vault/v1');

export interface VaultHeader {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  wrapped: { iv: string; key: string };
}

export class WrongSecretError extends Error {
  constructor() {
    super('Wrong PIN or passphrase');
    this.name = 'WrongSecretError';
  }
}

async function deriveWrappingKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    utf8.encode(secret.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function unwrapDataKey(
  header: VaultHeader,
  wrappingKey: CryptoKey,
  extractable: boolean,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      base64ToBytes(header.wrapped.key),
      wrappingKey,
      { name: 'AES-GCM', iv: base64ToBytes(header.wrapped.iv), additionalData: HEADER_AAD },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'OperationError') throw new WrongSecretError();
    throw err;
  }
}

async function wrapDataKey(
  dataKey: CryptoKey,
  secret: string,
  iterations: number,
): Promise<{ header: VaultHeader; wrappingKey: CryptoKey }> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, {
    name: 'AES-GCM',
    iv,
    additionalData: HEADER_AAD,
  });
  const header: VaultHeader = {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
    wrapped: { iv: bytesToBase64(iv), key: bytesToBase64(new Uint8Array(wrapped)) },
  };
  return { header, wrappingKey };
}

/** Creates a new vault. Returns the header to persist and a non-extractable data key. */
export async function createVault(
  secret: string,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<{ header: VaultHeader; key: CryptoKey }> {
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const { header, wrappingKey } = await wrapDataKey(dataKey, secret, iterations);
  // Re-import as non-extractable so the raw key can't be read back from memory via the API.
  const key = await unwrapDataKey(header, wrappingKey, false);
  return { header, key };
}

/** Throws WrongSecretError if the secret does not match. */
export async function unlockVault(
  header: VaultHeader,
  secret: string,
  extractable = false,
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(
    secret,
    base64ToBytes(header.kdf.salt),
    header.kdf.iterations,
  );
  return unwrapDataKey(header, wrappingKey, extractable);
}

/** Re-wraps the same data key under a new secret. Existing records stay readable. */
export async function changeSecret(
  header: VaultHeader,
  oldSecret: string,
  newSecret: string,
  iterations = header.kdf.iterations,
): Promise<VaultHeader> {
  const dataKey = await unlockVault(header, oldSecret, true);
  return (await wrapDataKey(dataKey, newSecret, iterations)).header;
}

export function parseVaultHeader(json: string): VaultHeader {
  const header = JSON.parse(json) as VaultHeader;
  if (header.v !== 1 || header.kdf?.name !== 'PBKDF2') {
    throw new Error('Unsupported vault format');
  }
  return header;
}
