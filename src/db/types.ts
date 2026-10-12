/**
 * Logical schema. Each entity is stored as one encrypted JSON document.
 * See docs/architecture.md for the storage layout.
 *
 * Conventions
 * - id: crypto.randomUUID() unless noted
 * - LocalDate: 'YYYY-MM-DD'
 * - LocalDateTime: 'YYYY-MM-DDTHH:mm' in the device's local time, no time zone
 * - Timestamp: ISO 8601 UTC, e.g. new Date().toISOString()
 *
 * Do not add reference ranges, "normal/abnormal" flags or dose suggestions to
 * any type here — the app records what the user enters and nothing more.
 */

export type LocalDate = string;
export type LocalDateTime = string;
export type Timestamp = string;
/** 'HH:mm' */
export type LocalTime = string;

// ---------- Medications ----------

export type MedicationForm = 'pill' | 'injection' | 'patch' | 'gel';

export type Schedule =
  | { type: 'daily'; times: LocalTime[] }
  /** weekdays: 1 = Monday … 7 = Sunday */
  | { type: 'weekly'; weekdays: number[]; times: LocalTime[] }
  | { type: 'interval'; everyDays: number; times: LocalTime[] };

export interface Medication {
  id: string;
  name: string;
  form: MedicationForm;
  dose: number;
  /** Free text: mg, mL, pump, … */
  unit: string;
  schedule: Schedule;
  startDate: LocalDate;
  endDate?: LocalDate;
  notify: boolean;
  active: boolean;
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DoseStatus = 'taken' | 'skipped';

/**
 * One check-off for a scheduled occurrence.
 * "Missed" is never stored: it is any past scheduled occurrence without a log.
 * id = doseLogId(medicationId, scheduledAt), which keeps (medication, time) unique.
 */
export interface DoseLog {
  id: string;
  medicationId: string;
  scheduledAt: LocalDateTime;
  status: DoseStatus;
  takenAt?: LocalDateTime;
  /** Copied at check time so editing the medication later doesn't rewrite history. */
  doseSnapshot: number;
  unitSnapshot: string;
  note?: string;
  createdAt: Timestamp;
}

export function doseLogId(medicationId: string, scheduledAt: LocalDateTime): string {
  return `${medicationId}@${scheduledAt}`;
}

// ---------- Lab results ----------

/** A user-defined test item. Names are unique (case-insensitive) — enforced by the service layer. */
export interface LabItem {
  id: string;
  name: string;
  defaultUnit?: string;
  sortOrder: number;
  createdAt: Timestamp;
}

/** One lab visit / blood draw. */
export interface LabSession {
  id: string;
  date: LocalDate;
  memo?: string;
  createdAt: Timestamp;
}

/**
 * id = labResultId(sessionId, itemId): one value per item per session.
 * The unit is stored per result; values with different units are never converted.
 */
export interface LabResult {
  id: string;
  sessionId: string;
  itemId: string;
  value: number;
  unit: string;
}

export function labResultId(sessionId: string, itemId: string): string {
  return `${sessionId}:${itemId}`;
}

// ---------- Journal ----------

export type Mood = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: string;
  date: LocalDate;
  mood?: Mood;
  note?: string;
  sideEffects?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Metadata only. The encrypted image bytes live in the photo store, keyed by id. */
export interface JournalPhoto {
  id: string;
  entryId: string;
  mime: string;
  createdAt: Timestamp;
}

// ---------- Appointments ----------

export type AppointmentKind = 'visit' | 'test' | 'other';

export interface Appointment {
  id: string;
  title: string;
  kind: AppointmentKind;
  datetime: LocalDateTime;
  location?: string;
  memo?: string;
  /** Notify the day before. */
  remind: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------- System ----------

/** Links an OS notification (integer id) to the record it was scheduled for. id = String(notificationId). */
export interface NotificationLink {
  id: string;
  notificationId: number;
  refType: 'dose' | 'appointment';
  refId: string;
  fireAt: LocalDateTime;
}

export interface AppSettings {
  id: 'app';
  /** Shown in every notification. Must stay neutral: no medication or health words. */
  notificationText: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  notificationText: '체크할 시간이에요',
};

// ---------- Table registry ----------

export interface TableTypes {
  medications: Medication;
  dose_logs: DoseLog;
  lab_items: LabItem;
  lab_sessions: LabSession;
  lab_results: LabResult;
  journal_entries: JournalEntry;
  journal_photos: JournalPhoto;
  appointments: Appointment;
  notification_links: NotificationLink;
  settings: AppSettings;
}

export type TableName = keyof TableTypes;

export const TABLE_NAMES = [
  'medications',
  'dose_logs',
  'lab_items',
  'lab_sessions',
  'lab_results',
  'journal_entries',
  'journal_photos',
  'appointments',
  'notification_links',
  'settings',
] as const satisfies readonly TableName[];

/** Child rows that are deleted together with their parent. */
export const RELATIONS: ReadonlyArray<{ child: TableName; field: string; parent: TableName }> = [
  { child: 'dose_logs', field: 'medicationId', parent: 'medications' },
  { child: 'lab_results', field: 'sessionId', parent: 'lab_sessions' },
  { child: 'lab_results', field: 'itemId', parent: 'lab_items' },
  { child: 'journal_photos', field: 'entryId', parent: 'journal_entries' },
];
