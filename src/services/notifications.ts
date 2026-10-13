import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Database } from '../db';
import { withDefaults, type NotificationLink, type TableName } from '../db/types';
import { planAppointmentReminders } from '../features/appointments/appointments';
import { planDoseReminders } from '../features/medications/notificationPlan';
import { toDate } from '../utils/time';

/**
 * Local notifications only — no push server.
 *
 * Privacy: Android stores scheduled notifications in plaintext (app-private storage)
 * so they survive a reboot. So a notification carries only a neutral text from
 * settings: no medication names, appointment titles, places, ids or `extra` payload.
 * The mapping from notification id to records lives in the encrypted
 * `notification_links` table.
 */

const CHANNEL_ID = 'reminders';

/** Tables whose changes affect which reminders should be scheduled. */
export const REMINDER_INPUTS: TableName[] = ['medications', 'dose_logs', 'appointments', 'settings'];

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
 * Cancels every reminder this app scheduled and schedules the current set
 * (dose reminders + day-before appointment reminders). Safe to call often;
 * calls are serialized.
 */
export function syncReminders(db: Database, now = new Date()): Promise<void> {
  const run = async () => {
    if ((await getPermission()) !== 'granted') return;

    const [meds, logs, appts, links, stored] = await Promise.all([
      db.all('medications'),
      db.all('dose_logs'),
      db.all('appointments'),
      db.all('notification_links'),
      db.get('settings', 'app'),
    ]);
    const settings = withDefaults(stored);

    if (links.length > 0) {
      await LocalNotifications.cancel({ notifications: links.map((l) => ({ id: l.notificationId })) });
    }

    const used = new Set<number>();
    const next: (NotificationLink & { title: string })[] = [
      ...planDoseReminders(meds, logs, now).map((at) => ({
        refType: 'dose' as const,
        refId: at,
        fireAt: at,
        title: settings.notificationText,
      })),
      ...planAppointmentReminders(appts, now).map((r) => ({
        refType: 'appointment' as const,
        refId: r.appointmentId,
        fireAt: r.fireAt,
        title: settings.appointmentText,
      })),
    ].map((n) => {
      const notificationId = allocateId(used);
      return { ...n, id: String(notificationId), notificationId };
    });

    if (next.length > 0) {
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: next.map((n) => ({
          id: n.notificationId,
          title: n.title,
          body: '',
          channelId: CHANNEL_ID,
          schedule: { at: toDate(n.fireAt), allowWhileIdle: true },
        })),
      });
    }

    await db.batch((b) => {
      b.remove('notification_links', ...links.map((l) => l.id));
      b.put(
        'notification_links',
        ...next.map((n): NotificationLink => ({
          id: n.id,
          notificationId: n.notificationId,
          refType: n.refType,
          refId: n.refId,
          fireAt: n.fireAt,
        })),
      );
    });
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
