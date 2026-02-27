/**
 * tco CLI - Type definitions
 * Derived from TaskChute Plus plugin types, without Obsidian dependencies.
 */

// ============================================================================
// Base Types
// ============================================================================

export type DateString = string; // YYYY-MM-DD
export type TimeString = string; // HH:mm
export type RoutineType = 'daily' | 'weekly' | 'monthly' | 'monthly_date';
export type RoutineWeek = 1 | 2 | 3 | 4 | 5 | 'last';
export type RoutineMonthday =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31
  | 'last';
export type LocationMode = 'vaultRoot' | 'specifiedFolder';

// ============================================================================
// Section Boundaries
// ============================================================================

export interface SectionBoundary {
  hour: number;   // 0-23
  minute: number;  // 0-59
}

// ============================================================================
// Settings (from data.json)
// ============================================================================

export interface TaskChuteSettings {
  locationMode?: LocationMode;
  specifiedFolder?: string;
  projectsFolder?: string | null;
  useOrderBasedSort: boolean;
  slotKeys: Record<string, string>;
  customSections?: SectionBoundary[];
  defaultReminderMinutes?: number;
}

// ============================================================================
// Task Data
// ============================================================================

export interface TaskData {
  filePath: string;       // Vault-relative path (e.g., "TaskChute/Task/my-task.md")
  frontmatter: Record<string, unknown>;
  name: string;           // File basename without extension
  taskId?: string;
  scheduledTime?: string; // HH:mm
  targetDate?: string;    // YYYY-MM-DD
  estimatedMinutes?: number;
  project?: string;
  projectPath?: string;
  isRoutine?: boolean;
  routineType?: RoutineType;
  routineEnabled?: boolean;
  reminderTime?: string;  // HH:mm
  createdMillis?: number;
  [key: string]: unknown;
}

// ============================================================================
// Task Instance (for list display)
// ============================================================================

export interface TaskInstance {
  task: TaskData;
  instanceId: string;
  state: 'idle' | 'running' | 'done' | 'paused';
  slotKey: string;
  date: string; // YYYY-MM-DD
  createdMillis?: number;
  order?: number;
}

// ============================================================================
// DayState Types
// ============================================================================

export interface DeletedInstance {
  instanceId?: string;
  path?: string;
  deletionType?: 'temporary' | 'permanent';
  deletedAt?: number;
  restoredAt?: number;
  taskId?: string;
}

export interface HiddenRoutine {
  path: string;
  instanceId?: string | null;
  hiddenAt?: number;
  restoredAt?: number;
}

export interface DuplicatedInstance {
  instanceId: string;
  originalPath: string;
  timestamp?: number;
  createdMillis?: number;
  originalTaskId?: string;
  restoredAt?: number;
  slotKey?: string;
  originalSlotKey?: string;
}

export interface SlotOverrideEntry {
  slotKey: string;
  updatedAt: number;
}

export interface DayState {
  hiddenRoutines: HiddenRoutine[];
  deletedInstances: DeletedInstance[];
  duplicatedInstances: DuplicatedInstance[];
  slotOverrides: Record<string, string>;
  slotOverridesMeta?: Record<string, SlotOverrideEntry>;
  orders: Record<string, number>;
  ordersMeta?: Record<string, { order: number; updatedAt: number }>;
}

export interface MonthlyDayStateFile {
  days: Record<string, DayState>;
  metadata: {
    version: string;
    lastUpdated: string;
  };
}

// ============================================================================
// Routine Rule
// ============================================================================

export interface RoutineRule {
  type: RoutineType;
  interval: number; // >= 1
  start?: string;   // YYYY-MM-DD
  end?: string;     // YYYY-MM-DD
  enabled: boolean;
  // weekly
  weekday?: number;         // 0..6
  weekdaySet?: number[];
  // monthly
  week?: number | 'last';   // 1..5 | 'last'
  monthWeekday?: number;    // 0..6
  weekSet?: (number | 'last')[];
  monthWeekdaySet?: number[];
  // monthly date
  monthDay?: RoutineMonthday;
  monthDaySet?: RoutineMonthday[];
}

// ============================================================================
// Config (.tcorc)
// ============================================================================

export interface TcoConfig {
  vaultPath: string;
}
