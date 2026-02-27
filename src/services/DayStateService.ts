import type { DayState, MonthlyDayStateFile, HiddenRoutine, DeletedInstance } from '../types/index.js';
import type { VaultService } from './VaultService.js';
import type { PathService } from './PathService.js';

const DAY_STATE_VERSION = '1.0';

function createEmptyDayState(): DayState {
  return {
    hiddenRoutines: [],
    deletedInstances: [],
    duplicatedInstances: [],
    slotOverrides: {},
    orders: {},
  };
}

function cloneDayState(state: DayState): DayState {
  return JSON.parse(JSON.stringify(state)) as DayState;
}

export class DayStateService {
  private cache = new Map<string, MonthlyDayStateFile>();

  constructor(
    private readonly vault: VaultService,
    private readonly pathService: PathService,
  ) {}

  private getStatePath(monthKey: string): string {
    return `${this.pathService.getLogDataPath()}/${monthKey}-state.json`;
  }

  private getMonthKey(dateStr: string): string {
    return dateStr.slice(0, 7);
  }

  /** Load DayState for a specific date (YYYY-MM-DD) */
  async loadDay(dateStr: string): Promise<DayState> {
    const monthKey = this.getMonthKey(dateStr);
    const month = await this.loadMonth(monthKey);
    if (!month.days[dateStr]) {
      month.days[dateStr] = createEmptyDayState();
    }
    return cloneDayState(month.days[dateStr]);
  }

  /** Save DayState for a specific date */
  async saveDay(dateStr: string, state: DayState): Promise<void> {
    const monthKey = this.getMonthKey(dateStr);
    const month = await this.loadMonth(monthKey);
    month.days[dateStr] = cloneDayState(state);
    month.metadata.lastUpdated = new Date().toISOString();
    await this.writeMonth(monthKey, month);
  }

  /** Update DayState with a mutator function */
  async updateDay(dateStr: string, mutator: (state: DayState) => DayState | void): Promise<DayState> {
    const monthKey = this.getMonthKey(dateStr);
    const month = await this.loadMonth(monthKey);
    const current = month.days[dateStr] ?? createEmptyDayState();
    const working = cloneDayState(current);
    const result = (mutator(working) as DayState) || working;
    month.days[dateStr] = cloneDayState(result);
    month.metadata.lastUpdated = new Date().toISOString();
    await this.writeMonth(monthKey, month);
    return cloneDayState(month.days[dateStr]);
  }

  /** Check if a deleted instance is actually deleted (deletedAt >= restoredAt) */
  static isDeleted(entry: DeletedInstance): boolean {
    const deletedAt = entry.deletedAt ?? 0;
    if (deletedAt === 0) return false;
    const restoredAt = entry.restoredAt ?? 0;
    return deletedAt >= restoredAt;
  }

  /** Check if a hidden routine is actually hidden */
  static isHidden(entry: HiddenRoutine): boolean {
    const hiddenAt = entry.hiddenAt ?? 0;
    const restoredAt = entry.restoredAt ?? 0;
    if (hiddenAt === 0) return restoredAt === 0;
    return hiddenAt >= restoredAt;
  }

  private async loadMonth(monthKey: string): Promise<MonthlyDayStateFile> {
    if (this.cache.has(monthKey)) return this.cache.get(monthKey)!;

    const path = this.getStatePath(monthKey);
    let monthly: MonthlyDayStateFile;

    if (this.vault.fileExists(path)) {
      const raw = await this.vault.readFile(path);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse day state file: ${path}. ${reason}`);
      }
      monthly = this.normalizeMonthlyState(parsed);
    } else {
      monthly = this.normalizeMonthlyState({});
    }

    this.cache.set(monthKey, monthly);
    return monthly;
  }

  private async writeMonth(monthKey: string, month: MonthlyDayStateFile): Promise<void> {
    const path = this.getStatePath(monthKey);
    const payload = JSON.stringify(month, null, 2);
    await this.vault.writeFile(path, payload);
    this.cache.set(monthKey, month);
  }

  private normalizeMonthlyState(state: unknown): MonthlyDayStateFile {
    const normalized: MonthlyDayStateFile = {
      days: {},
      metadata: { version: DAY_STATE_VERSION, lastUpdated: new Date().toISOString() },
    };

    if (state && typeof state === 'object') {
      const record = state as { days?: Record<string, unknown>; metadata?: Record<string, unknown> };
      if (record.days && typeof record.days === 'object') {
        for (const [key, value] of Object.entries(record.days)) {
          normalized.days[key] = this.normalizeDayState(value);
        }
      }
      if (record.metadata && typeof record.metadata === 'object') {
        const meta = record.metadata as { version?: unknown; lastUpdated?: unknown };
        if (typeof meta.version === 'string') normalized.metadata.version = meta.version;
        if (typeof meta.lastUpdated === 'string') normalized.metadata.lastUpdated = meta.lastUpdated;
      }
    }

    return normalized;
  }

  private normalizeDayState(value: unknown): DayState {
    const day = createEmptyDayState();
    if (!value || typeof value !== 'object') return day;

    const record = value as Record<string, unknown>;

    if (Array.isArray(record.hiddenRoutines)) {
      day.hiddenRoutines = record.hiddenRoutines.filter(Boolean) as HiddenRoutine[];
    }
    if (Array.isArray(record.deletedInstances)) {
      day.deletedInstances = record.deletedInstances.filter(Boolean) as DeletedInstance[];
    }
    if (Array.isArray(record.duplicatedInstances)) {
      day.duplicatedInstances = record.duplicatedInstances.filter(Boolean) as DayState['duplicatedInstances'];
    }
    if (record.slotOverrides && typeof record.slotOverrides === 'object') {
      day.slotOverrides = Object.fromEntries(
        Object.entries(record.slotOverrides as Record<string, unknown>)
          .filter(([, val]) => typeof val === 'string'),
      ) as Record<string, string>;
    }
    if (record.slotOverridesMeta && typeof record.slotOverridesMeta === 'object') {
      const entries = Object.entries(record.slotOverridesMeta as Record<string, unknown>)
        .filter(([, val]) => {
          if (!val || typeof val !== 'object') return false;
          const m = val as { slotKey?: unknown; updatedAt?: unknown };
          return typeof m.slotKey === 'string' && typeof m.updatedAt === 'number';
        });
      if (entries.length > 0) {
        day.slotOverridesMeta = Object.fromEntries(
          entries.map(([key, val]) => {
            const m = val as { slotKey: string; updatedAt: number };
            return [key, { slotKey: m.slotKey, updatedAt: m.updatedAt }];
          }),
        );
      }
    }
    if (record.orders && typeof record.orders === 'object') {
      day.orders = Object.fromEntries(
        Object.entries(record.orders as Record<string, unknown>)
          .filter(([, val]) => typeof val === 'number'),
      ) as Record<string, number>;
    }
    if (record.ordersMeta && typeof record.ordersMeta === 'object') {
      const entries = Object.entries(record.ordersMeta as Record<string, unknown>)
        .filter(([, val]) => {
          if (!val || typeof val !== 'object') return false;
          const m = val as { order?: unknown; updatedAt?: unknown };
          return typeof m.order === 'number' && typeof m.updatedAt === 'number';
        });
      if (entries.length > 0) {
        day.ordersMeta = Object.fromEntries(
          entries.map(([key, val]) => {
            const m = val as { order: number; updatedAt: number };
            return [key, { order: m.order, updatedAt: m.updatedAt }];
          }),
        );
      }
    }

    return day;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
