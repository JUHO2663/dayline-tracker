import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Database } from '../db';
import { DEFAULT_SETTINGS, type NotificationLink } from '../db/types';
import { planDoseReminders } from '../features/medications/notificationPlan';
import { toDate } from '../utils/time';

/**
 * Local notifications only — no push server.
 *
 * Privacy: Android stores scheduled notifications in plaintext (app-private storage)
 * so they survive a reboot. So a notification carries only the neutral text from
 * settings: no medication names, no ids, no `extra` payload. The mapping from
 * notification id to records lives in the encrypted `notification_links` table.
 */

const CHANNEL_ID = 'reminders';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform() || 'Notification' in globalThis;
}

/** In the browser, reminders only fire while the tab is open. */
export function remindersNeedOpenTab(): boolean {
  return !Capacitor.isNativePlatform();
}

export async function getPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

let channel: Promise<void> | undefined;
function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve();
  channel ??= LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: '알림',
    importance: 4,
    // Private: on a secure lock screen the content is hidden.
    visibility: 0,
  });
  return channel;
}

function allocateId(used: Set<number>): number {
  for (;;) {
    const id = 1 + Math.floor(Math.random() * 2_000_000_000);
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Cancels previously scheduled dose reminders and schedules the next ones.
 * Safe to call often; calls are serialized.
 */
export function syncDoseReminders(db: Database, now = new Date()): Promise<void> {
  const run = async () => {
    if ((await getPermission()) !== 'granted') return;

    const [meds, logs, links, settings] = await Promise.all([
      db.all('medications'),
      db.all('dose_logs'),
      db.all('notification_links'),
      db.get('settings', 'app'),
    ]);
    const text = (settings ?? DEFAULT_SETTINGS).notificationText;

    const old = links.filter((l) => l.refType === 'dose');
    if (old.length > 0) {
      await LocalNotifications.cancel({
        notifications: old.map((l) => ({ id: l.notificationId })),
      });
    }

    const used = new Set(links.filter((l) => l.refType !== 'dose').map((l) => l.notificationId));
    const next: NotificationLink[] = planDoseReminders(meds, logs, now).map((at) => {
      const notificationId = allocateId(used);
      return { id: String(notificationId), notificationId, refType: 'dose', refId: at, fireAt: at };
    });

    if (next.length > 0) {
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: next.map((n) => ({
          id: n.notificationId,
          title: text,
          body: '',
          channelId: CHANNEL_ID,
          schedule: { at: toDate(n.fireAt), allowWhileIdle: true },
        })),
      });
    }

    await db.batch((b) => {
      b.remove('notification_links', ...old.map((l) => l.id));
      b.put('notification_links', ...next);
    });
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
