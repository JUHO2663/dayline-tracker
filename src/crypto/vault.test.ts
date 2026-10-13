import { describe, expect, it } from 'vitest';
import { CorruptRecordError, openBytes, openJson, sealBytes, sealJson } from './cipher';
import { changeSecret, createVault, unlockVault, WrongSecretError } from './vault';

// Low iteration count keeps tests fast; production uses DEFAULT_KDF_ITERATIONS.
const IT = 1_000;

describe('vault', () => {
  it('unlocks with the right secret and rejects a wrong one', async () => {
    const { header, key } = await createVault('123456', IT);
    const sealed = await sealJson(key, 't', 'a', { hello: 'world' });

    const again = await unlockVault(header, '123456');
    await expect(openJson(again, 't', 'a', sealed)).resolves.toEqual({ hello: 'world' });

    await expect(unlockVault(header, '654321')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('keeps data readable after changing the secret', async () => {
    const { header, key } = await createVault('old-secret', IT);
    const sealed = await sealJson(key, 't', 'a', 42);

    const next = await changeSecret(header, 'old-secret', 'new-secret');
    expect(next.kdf.salt).not.toBe(header.kdf.salt);

    const key2 = await unlockVault(next, 'new-secret');
    await expect(openJson(key2, 't', 'a', sealed)).resolves.toBe(42);
    await expect(unlockVault(next, 'old-secret')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('does not expose the data key', async () => {
    const { key } = await createVault('123456', IT);
    expect(key.extractable).toBe(false);
  });

  it('seals bytes bound to their id', async () => {
    const { key } = await createVault('123456', IT);
    const bytes = new Uint8Array([1, 2, 3, 255]);
    const sealed = await sealBytes(key, 'a', bytes);
    await expect(openBytes(key, 'a', sealed)).resolves.toEqual(bytes);
    await expect(openBytes(key, 'b', sealed)).rejects.toBeInstanceOf(CorruptRecordError);
  });

  it('treats Unicode-equivalent secrets as equal (NFKC)', async () => {
    const { header } = await createVault('café', IT);
    await expect(unlockVault(header, 'café')).resolves.toBeDefined();
  });
});
