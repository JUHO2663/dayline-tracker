import { createVault, parseVaultHeader, unlockVault } from '../crypto/vault';
import { Database } from './database';
import { META_SCHEMA_VERSION, META_VAULT, type RecordStore } from './recordStore';

export const SCHEMA_VERSION = 1;

export async function isInitialized(store: RecordStore): Promise<boolean> {
  return (await store.getMeta(META_VAULT)) !== undefined;
}

/** First run: creates the vault and returns an unlocked database. */
export async function initialize(
  store: RecordStore,
  secret: string,
  iterations?: number,
): Promise<Database> {
  if (await isInitialized(store)) throw new Error('Already initialized');
  const { header, key } = await createVault(secret, iterations);
  await store.setMeta(META_SCHEMA_VERSION, String(SCHEMA_VERSION));
  await store.setMeta(META_VAULT, JSON.stringify(header));
  return new Database(store, key);
}

/** Throws WrongSecretError if the secret is wrong. */
export async function unlock(store: RecordStore, secret: string): Promise<Database> {
  const raw = await store.getMeta(META_VAULT);
  if (raw === undefined) throw new Error('Not initialized');
  const key = await unlockVault(parseVaultHeader(raw), secret);
  return new Database(store, key);
}
