import { useState, type KeyboardEvent } from 'react';
import { WrongSecretError } from '../../crypto/vault';
import { initialize, unlock, type Database } from '../../db';
import type { RecordStore } from '../../db/recordStore';

const MIN_LENGTH = 6;

interface Props {
  store: RecordStore;
  mode: 'setup' | 'unlock';
  onUnlocked: (db: Database) => void;
}

/**
 * Minimal first version: create a passphrase or unlock with it.
 * Biometrics, auto-lock and changing the passphrase come in step 5.
 *
 * Deliberately not a <form>: browsers offer to save submitted passwords to a
 * synced password manager, which would move the secret off the device.
 */
export function LockScreen({ store, mode, onUnlocked }: Props) {
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    !busy && secret.length >= MIN_LENGTH && (mode === 'unlock' || secret === confirm);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const db = mode === 'setup' ? await initialize(store, secret) : await unlock(store, secret);
      onUnlocked(db);
    } catch (err) {
      const wrong = err instanceof WrongSecretError;
      if (wrong) setSecret('');
      setError(wrong ? '비밀번호가 맞지 않아요.' : '열 수 없어요. 다시 시도해 주세요.');
      setBusy(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <main className="lock">
      <h1>Dayline</h1>
      {mode === 'setup' ? (
        <>
          <p>이 기기에서 사용할 비밀번호를 정해 주세요. ({MIN_LENGTH}자 이상)</p>
          <p className="warning">
            비밀번호를 잊으면 기록을 복구할 수 없어요. 모든 기록은 이 비밀번호로 암호화돼요.
          </p>
        </>
      ) : (
        <p>비밀번호를 입력해 주세요.</p>
      )}

      <input
        type="password"
        autoComplete="off"
        aria-label="비밀번호"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
      />
      {mode === 'setup' && (
        <input
          type="password"
          autoComplete="off"
          aria-label="비밀번호 확인"
          placeholder="한 번 더 입력"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      {mode === 'setup' && confirm.length > 0 && secret !== confirm && (
        <p className="error">두 비밀번호가 달라요.</p>
      )}
      {error && <p className="error">{error}</p>}

      <button type="button" onClick={() => void submit()} disabled={!canSubmit}>
        {busy ? '여는 중…' : mode === 'setup' ? '시작하기' : '열기'}
      </button>
    </main>
  );
}
