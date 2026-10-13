import { useEffect, useState } from 'react';
import { useDb } from '../app/DbContext';
import {
  getPermission,
  remindersNeedOpenTab,
  requestPermission,
  syncReminders,
  type PermissionState,
} from '../services/notifications';

/** Explains the notification permission state when the screen has reminders turned on. */
export function ReminderBanner({ wantsReminders }: { wantsReminders: boolean }) {
  const { db } = useDb();
  const [permission, setPermission] = useState<PermissionState>();

  useEffect(() => {
    void getPermission().then(setPermission);
  }, []);

  if (!wantsReminders || permission === undefined || permission === 'unsupported') return null;

  if (permission === 'granted') {
    return remindersNeedOpenTab() ? (
      <p className="banner">웹에서는 이 탭이 열려 있을 때만 알림이 와요.</p>
    ) : null;
  }

  if (permission === 'denied') {
    return (
      <p className="banner">
        {remindersNeedOpenTab()
          ? '알림이 차단되어 있어요. 브라우저의 사이트 설정에서 알림을 허용해 주세요.'
          : '알림이 꺼져 있어요. 기기 설정에서 이 앱의 알림을 허용해 주세요.'}
      </p>
    );
  }

  return (
    <div className="banner">
      <span>알림을 받으려면 권한이 필요해요.</span>
      <button
        type="button"
        className="primary small"
        onClick={async () => {
          const next = await requestPermission();
          setPermission(next);
          if (next === 'granted') await syncReminders(db);
        }}
      >
        허용하기
      </button>
    </div>
  );
}
