import type { TaskData, TaskInstance, DayState } from '../types/index.js';
import type { VaultService } from './VaultService.js';
import type { PathService } from './PathService.js';
import type { FrontmatterService } from './FrontmatterService.js';
import { DayStateService } from './DayStateService.js';
import { RoutineService } from './RoutineService.js';
import { SectionConfigService } from './SectionConfigService.js';
import type { SettingsService } from './SettingsService.js';
import { generateInstanceId } from '../utils/id.js';
import { formatDate } from '../utils/date.js';

/**
 * TaskLoaderService - Heart of the `tco list` command.
 * Loads tasks for a given date by scanning TaskChute/Task/ folder,
 * evaluating routines, and applying DayState.
 */
export class TaskLoaderService {
  private sectionConfig: SectionConfigService;
  private useOrderBasedSort: boolean;

  constructor(
    private readonly vault: VaultService,
    private readonly pathService: PathService,
    private readonly frontmatterService: FrontmatterService,
    private readonly dayStateService: DayStateService,
    private readonly settingsService: SettingsService,
  ) {
    const settings = this.settingsService.getSettings();
    this.sectionConfig = new SectionConfigService(settings.customSections);
    this.useOrderBasedSort = settings.useOrderBasedSort !== false;
  }

  /** Load all task instances for a given date (YYYY-MM-DD) */
  async loadTasksForDate(dateKey: string): Promise<TaskInstance[]> {
    const taskFolderPath = this.pathService.getTaskFolderPath();
    const mdFiles = await this.vault.listMarkdownFiles(taskFolderPath);
    const dayState = await this.dayStateService.loadDay(dateKey);

    const instances: TaskInstance[] = [];

    // Process each markdown file
    for (const filePath of mdFiles) {
      const taskInstances = await this.processFile(filePath, dateKey, dayState);
      instances.push(...taskInstances);
    }

    // Add duplicated instances
    const duplicated = this.restoreDuplicatedInstances(dayState, instances, dateKey);
    instances.push(...duplicated);

    // Sort by order
    this.sortInstances(instances, dayState);

    return instances;
  }

  private async processFile(
    filePath: string,
    dateKey: string,
    dayState: DayState,
  ): Promise<TaskInstance[]> {
    try {
      const { data } = await this.frontmatterService.parseFrontmatter(filePath);
      const taskData = this.buildTaskData(filePath, data);

      const isRoutine = taskData.isRoutine === true;
      const routineEnabled = taskData.routineEnabled !== false;

      let shouldShow: boolean;

      if (isRoutine && routineEnabled) {
        // Active routine: use RoutineService.isDue()
        const targetDate = this.normalizeDateValue(data.target_date);
        const routineStart = this.normalizeDateValue(data.routine_start);
        const movedTargetDate = targetDate && targetDate !== routineStart
          ? targetDate : undefined;
        const rule = RoutineService.parseFrontmatter(data);
        shouldShow = RoutineService.isDue(dateKey, rule, movedTargetDate);
      } else if (isRoutine && !routineEnabled) {
        // Disabled routine: show on target_date only, or today if no target_date
        const targetDate = this.normalizeDateValue(data.target_date);
        if (targetDate) {
          shouldShow = targetDate === dateKey;
        } else {
          shouldShow = dateKey === formatDate(new Date());
        }
      } else {
        // Non-routine: show on target_date, or creation date
        const targetDate = this.normalizeDateValue(data.target_date);
        if (targetDate) {
          shouldShow = targetDate === dateKey;
        } else {
          const createdDate = this.resolveCreatedDate(taskData);
          if (createdDate) {
            shouldShow = createdDate === dateKey;
          } else {
            shouldShow = false;
          }
        }
      }

      if (!shouldShow) return [];

      // Check hidden routines
      if (isRoutine && this.isHiddenInDayState(filePath, dayState)) {
        return [];
      }

      // Check deleted instances
      const instanceId = generateInstanceId(taskData.taskId || filePath, dateKey);
      if (this.isDeletedInDayState(filePath, instanceId, taskData.taskId, dayState)) {
        return [];
      }

      // Determine slot key
      const slotKey = this.resolveSlotKey(taskData, dayState);

      const instance: TaskInstance = {
        task: taskData,
        instanceId,
        state: 'idle',
        slotKey,
        date: dateKey,
        createdMillis: typeof data.createdMillis === 'number' ? data.createdMillis : undefined,
      };

      return [instance];
    } catch {
      // Skip files that can't be parsed
      return [];
    }
  }

  private buildTaskData(filePath: string, data: Record<string, unknown>): TaskData {
    const name = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
    const scheduledTime = this.resolveScheduledTime(data);
    return {
      filePath,
      frontmatter: data,
      name,
      taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
      scheduledTime,
      targetDate: this.normalizeDateValue(data.target_date),
      estimatedMinutes: typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : undefined,
      project: typeof data.project === 'string' ? data.project : undefined,
      projectPath: typeof data.projectPath === 'string' ? data.projectPath : undefined,
      isRoutine: data.isRoutine === true,
      routineType: typeof data.routine_type === 'string' ? data.routine_type as TaskData['routineType'] : undefined,
      routineEnabled: data.routine_enabled === false ? false : undefined,
      reminderTime: typeof data.reminder_time === 'string' ? data.reminder_time : undefined,
      createdMillis: typeof data.createdMillis === 'number' ? data.createdMillis : undefined,
    };
  }

  private resolveScheduledTime(data: Record<string, unknown>): string | undefined {
    if (typeof data.scheduled_time === 'string') {
      return data.scheduled_time;
    }
    if (typeof data['開始時刻'] === 'string') {
      return data['開始時刻'];
    }
    return undefined;
  }

  private normalizeDateValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return this.normalizeDateString(value);
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return undefined;
  }

  private normalizeDateString(value: string): string | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return undefined;

    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() !== y
      || parsed.getMonth() + 1 !== m
      || parsed.getDate() !== d
    ) {
      return undefined;
    }
    return value;
  }

  private isHiddenInDayState(filePath: string, dayState: DayState): boolean {
    return dayState.hiddenRoutines.some(h => {
      if (h.path !== filePath) return false;
      return DayStateService.isHidden(h);
    });
  }

  private isDeletedInDayState(
    filePath: string,
    instanceId: string,
    taskId: string | undefined,
    dayState: DayState,
  ): boolean {
    return dayState.deletedInstances.some(d => {
      if (!DayStateService.isDeleted(d)) return false;

      // Match by taskId first
      if (taskId && d.taskId === taskId) return true;
      // Match by instanceId
      if (d.instanceId === instanceId) return true;
      // Match by path (for permanent deletion)
      if (d.deletionType === 'permanent' && d.path === filePath) return true;

      return false;
    });
  }

  private resolveSlotKey(taskData: TaskData, dayState: DayState): string {
    const taskId = taskData.taskId;

    // 1. Check slot overrides in DayState
    if (taskId && Object.hasOwn(dayState.slotOverrides, taskId)) {
      return dayState.slotOverrides[taskId];
    }

    // 2. Calculate from scheduled_time
    if (taskData.scheduledTime) {
      const slot = this.sectionConfig.calculateSlotKeyFromTime(taskData.scheduledTime);
      if (slot) return slot;
    }

    // 3. Default to 'none'
    return 'none';
  }

  private resolveCreatedDate(taskData: TaskData): string | undefined {
    if (typeof taskData.createdMillis !== 'number' || !Number.isFinite(taskData.createdMillis)) {
      return undefined;
    }
    return formatDate(new Date(taskData.createdMillis));
  }

  private restoreDuplicatedInstances(
    dayState: DayState,
    existingInstances: TaskInstance[],
    dateKey: string,
  ): TaskInstance[] {
    const result: TaskInstance[] = [];
    const existingIds = new Set(existingInstances.map(i => i.instanceId));
    const deletedDuplicatedIds = new Set(
      dayState.deletedInstances
        .filter(d => typeof d.instanceId === 'string' && DayStateService.isDeleted(d))
        .map(d => d.instanceId as string),
    );

    for (const dup of dayState.duplicatedInstances) {
      if (existingIds.has(dup.instanceId)) continue;
      if (deletedDuplicatedIds.has(dup.instanceId)) continue;
      if (dup.restoredAt && dup.createdMillis && dup.restoredAt > dup.createdMillis) continue;

      // Find the original task in existing instances
      const original = existingInstances.find(i =>
        i.task.filePath === dup.originalPath || i.task.taskId === dup.originalTaskId,
      );

      if (original) {
        const instance: TaskInstance = {
          task: { ...original.task },
          instanceId: dup.instanceId,
          state: 'idle',
          slotKey: dup.slotKey || original.slotKey,
          date: dateKey,
          createdMillis: dup.createdMillis,
        };
        result.push(instance);
      }
    }

    return result;
  }

  private timeToSeconds(time: string): number | undefined {
    const trimmed = time.trim();
    if (!trimmed) return undefined;

    const hhmmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const isoMatch = trimmed.match(
      /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    );
    const match = hhmmMatch ?? isoMatch;
    if (!match) return undefined;

    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = match[3] ? parseInt(match[3], 10) : 0;
    if (
      Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)
      || h < 0 || h > 23
      || m < 0 || m > 59
      || s < 0 || s > 59
    ) {
      return undefined;
    }

    return h * 3600 + m * 60 + s;
  }

  private sortInstances(instances: TaskInstance[], dayState: DayState): void {
    const slotKeys = this.sectionConfig.getSlotKeys();
    const slotIndex = (key: string): number => {
      if (key === 'none') return slotKeys.length; // 'none' goes last
      const idx = slotKeys.indexOf(key);
      return idx >= 0 ? idx : slotKeys.length; // unknown slots after known ones
    };

    instances.sort((a, b) => {
      if (this.useOrderBasedSort) {
        // Sort by order if enabled and available
        const orderKeyA = `${a.task.taskId || a.task.filePath}::${a.slotKey}`;
        const orderKeyB = `${b.task.taskId || b.task.filePath}::${b.slotKey}`;
        const orderA = (Object.hasOwn(dayState.orders, orderKeyA) ? dayState.orders[orderKeyA] : undefined)
          ?? (dayState.ordersMeta && Object.hasOwn(dayState.ordersMeta, orderKeyA) ? dayState.ordersMeta[orderKeyA]?.order : undefined);
        const orderB = (Object.hasOwn(dayState.orders, orderKeyB) ? dayState.orders[orderKeyB] : undefined)
          ?? (dayState.ordersMeta && Object.hasOwn(dayState.ordersMeta, orderKeyB) ? dayState.ordersMeta[orderKeyB]?.order : undefined);

        if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
        if (orderA !== undefined) return -1;
        if (orderB !== undefined) return 1;
      }

      // Fallback: sort by slot index (time order), then scheduled time, then name
      const slotDiff = slotIndex(a.slotKey) - slotIndex(b.slotKey);
      if (slotDiff !== 0) return slotDiff;
      const timeA = a.task.scheduledTime || '';
      const timeB = b.task.scheduledTime || '';
      if (timeA !== timeB) {
        const timeValueA = this.timeToSeconds(timeA);
        const timeValueB = this.timeToSeconds(timeB);

        if (timeValueA !== undefined && timeValueB !== undefined) {
          const diff = timeValueA - timeValueB;
          if (diff !== 0) return diff;
        } else if (timeValueA !== undefined) {
          return -1;
        } else if (timeValueB !== undefined) {
          return 1;
        }
      }
      return a.task.name.localeCompare(b.task.name);
    });
  }
}
