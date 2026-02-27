import type { DayState } from '../types/index.js';
import type { VaultService } from './VaultService.js';
import type { PathService } from './PathService.js';
import type { FrontmatterService } from './FrontmatterService.js';
import { DayStateService } from './DayStateService.js';
import { generateInstanceId } from '../utils/id.js';
import { isValidTaskId, isSafeKey } from '../utils/security.js';

function cloneDayState(state: DayState): DayState {
  return JSON.parse(JSON.stringify(state)) as DayState;
}

/**
 * TaskMutationService - Handles task modifications:
 * move (date/slot), delete (temporary/permanent)
 */
export class TaskMutationService {
  constructor(
    private readonly vault: VaultService,
    private readonly pathService: PathService,
    private readonly frontmatterService: FrontmatterService,
    private readonly dayStateService: DayStateService,
  ) {}

  private validateTaskId(taskId: string): void {
    if (!isValidTaskId(taskId)) {
      throw new Error(`Invalid taskId format: "${taskId}". Expected "tc-task-<id>".`);
    }
  }

  /** Find a task file by taskId, scanning TaskChute/Task/ folder */
  async findTaskByTaskId(taskId: string): Promise<{ filePath: string; frontmatter: Record<string, unknown> } | null> {
    this.validateTaskId(taskId);
    const taskFolderPath = this.pathService.getTaskFolderPath();
    const mdFiles = await this.vault.listMarkdownFiles(taskFolderPath);

    for (const filePath of mdFiles) {
      try {
        const { data } = await this.frontmatterService.parseFrontmatter(filePath);
        if (data.taskId === taskId) {
          return { filePath, frontmatter: data };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Move task to a different date */
  async moveToDate(
    taskId: string,
    fromDate: string,
    toDate: string,
  ): Promise<void> {
    this.validateTaskId(taskId);
    const task = await this.findTaskByTaskId(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (fromDate === toDate) return;

    const { filePath, frontmatter } = task;
    const isRoutine = frontmatter.isRoutine === true;
    const sourceState = await this.dayStateService.loadDay(fromDate);
    const destinationState = await this.dayStateService.loadDay(toDate);
    const rollbackSnapshots = new Map<string, DayState>([
      [fromDate, cloneDayState(sourceState)],
      [toDate, cloneDayState(destinationState)],
    ]);
    const touchedDates = new Set<string>();
    const updateDay = async (
      dateKey: string,
      mutator: (state: DayState) => DayState | void,
    ): Promise<DayState> => {
      touchedDates.add(dateKey);
      return this.dayStateService.updateDay(dateKey, mutator);
    };

    const timestamp = Date.now();
    const destinationInstanceId = generateInstanceId(taskId, toDate);

    try {
      // Restore deleted tombstones on destination so moved tasks become visible again.
      await updateDay(toDate, (state) => {
        for (const entry of state.deletedInstances) {
          const matchesTaskId = entry.taskId === taskId;
          const matchesInstance = entry.instanceId === destinationInstanceId;
          const matchesPermanentPath = entry.deletionType === 'permanent' && entry.path === filePath;
          if (!matchesTaskId && !matchesInstance && !matchesPermanentPath) continue;

          const deletedAt = entry.deletedAt ?? 0;
          const restoredAt = entry.restoredAt ?? 0;
          if (deletedAt === 0 || deletedAt >= restoredAt) {
            entry.restoredAt = timestamp;
          }
        }
      });

      if (isRoutine) {
        // Restore hidden tombstones in destination date first to avoid hiding source on destination failure.
        await updateDay(toDate, (state) => {
          for (const entry of state.hiddenRoutines) {
            if (entry.path !== filePath) continue;
            const hiddenAt = entry.hiddenAt ?? 0;
            const restoredAt = entry.restoredAt ?? 0;
            if (hiddenAt === 0 || hiddenAt >= restoredAt) {
              entry.restoredAt = timestamp;
            }
          }
        });

        // Add hidden routine tombstone in source date's DayState
        await updateDay(fromDate, (state) => {
          state.hiddenRoutines.push({
            path: filePath,
            instanceId: null,
            hiddenAt: timestamp,
          });
        });
      }

      // Transfer slot overrides from source to target
      if (sourceState.slotOverrides[taskId]) {
        if (!isSafeKey(taskId)) throw new Error(`Unsafe key rejected: "${taskId}".`);
        const slotKey = sourceState.slotOverrides[taskId];
        await updateDay(toDate, (state) => {
          state.slotOverrides[taskId] = slotKey;
          if (!state.slotOverridesMeta) state.slotOverridesMeta = {};
          state.slotOverridesMeta[taskId] = { slotKey, updatedAt: Date.now() };
        });
        await updateDay(fromDate, (state) => {
          delete state.slotOverrides[taskId];
          if (state.slotOverridesMeta) {
            delete state.slotOverridesMeta[taskId];
          }
        });
      }

      // Transfer duplicated instances
      const dupsToMove = sourceState.duplicatedInstances.filter(
        d => d.originalTaskId === taskId || d.originalPath === filePath,
      );
      if (dupsToMove.length > 0) {
        const dupInstanceIds = new Set(dupsToMove.map(d => d.instanceId));
        const deletedDupEntriesToMove = sourceState.deletedInstances
          .filter(entry =>
            typeof entry.instanceId === 'string'
            && dupInstanceIds.has(entry.instanceId)
            && DayStateService.isDeleted(entry),
          )
          .map(entry => ({ ...entry }));

        await updateDay(toDate, (state) => {
          const existing = new Set(state.duplicatedInstances.map(d => d.instanceId));
          for (const dup of dupsToMove) {
            if (existing.has(dup.instanceId)) continue;
            state.duplicatedInstances.push(dup);
            existing.add(dup.instanceId);
          }

          if (deletedDupEntriesToMove.length > 0) {
            const activeDeletedDupIds = new Set(
              state.deletedInstances
                .filter(d => typeof d.instanceId === 'string' && DayStateService.isDeleted(d))
                .map(d => d.instanceId as string),
            );

            for (const deletedEntry of deletedDupEntriesToMove) {
              const instanceId = deletedEntry.instanceId;
              if (typeof instanceId !== 'string') continue;
              if (activeDeletedDupIds.has(instanceId)) continue;
              state.deletedInstances.push({ ...deletedEntry });
              activeDeletedDupIds.add(instanceId);
            }
          }
        });

        await updateDay(fromDate, (state) => {
          state.duplicatedInstances = state.duplicatedInstances.filter(
            d => !(d.originalTaskId === taskId || d.originalPath === filePath),
          );

          if (deletedDupEntriesToMove.length > 0) {
            const movedDeletedDupIds = new Set(
              deletedDupEntriesToMove
                .map(d => d.instanceId)
                .filter((id): id is string => typeof id === 'string'),
            );
            state.deletedInstances = state.deletedInstances.filter(
              d => !(typeof d.instanceId === 'string'
                && movedDeletedDupIds.has(d.instanceId)
                && DayStateService.isDeleted(d)),
            );
          }
        });
      }

      // Update frontmatter after DayState updates to avoid partial move on DayState failure.
      await this.frontmatterService.updateFrontmatter(filePath, {
        target_date: toDate,
      });
    } catch (error) {
      await this.rollbackMoveDayState(touchedDates, rollbackSnapshots);
      throw error;
    }
  }

  /** Move task to a different slot */
  async moveToSlot(
    taskId: string,
    dateKey: string,
    slotKey: string,
  ): Promise<void> {
    this.validateTaskId(taskId);
    const task = await this.findTaskByTaskId(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (!isSafeKey(taskId)) throw new Error(`Unsafe key rejected: "${taskId}".`);
    await this.dayStateService.updateDay(dateKey, (state) => {
      state.slotOverrides[taskId] = slotKey;
      if (!state.slotOverridesMeta) state.slotOverridesMeta = {};
      state.slotOverridesMeta[taskId] = { slotKey, updatedAt: Date.now() };
    });
  }

  /** Delete a task (temporary or permanent) */
  async deleteTask(
    taskId: string,
    dateKey: string,
    permanent: boolean,
  ): Promise<void> {
    this.validateTaskId(taskId);
    const task = await this.findTaskByTaskId(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const { filePath, frontmatter } = task;
    const isRoutine = frontmatter.isRoutine === true;
    const instanceId = generateInstanceId(taskId, dateKey);
    let trashedPath: string | undefined;

    // Permanent deletion: move file to trash first so failed move does not leave stale tombstones.
    if (permanent) {
      trashedPath = await this.vault.moveToTrash(filePath);
    }

    try {
      await this.dayStateService.updateDay(dateKey, (state) => {
        if (isRoutine) {
          // Add hidden routine entry
          state.hiddenRoutines.push({
            path: filePath,
            instanceId: null,
            hiddenAt: Date.now(),
          });
        }

        // Add deleted instance entry
        const deleteEntry: DayState['deletedInstances'][number] = {
          path: filePath,
          deletionType: permanent ? 'permanent' : 'temporary',
          deletedAt: Date.now(),
          taskId,
        };

        if (!permanent) {
          deleteEntry.instanceId = instanceId;
        }

        state.deletedInstances.push(deleteEntry);
      });
    } catch (error) {
      if (permanent && trashedPath) {
        try {
          await this.vault.restoreFromTrash(trashedPath, filePath);
        } catch (rollbackError) {
          const original = error instanceof Error ? error.message : String(error);
          const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          throw new Error(
            `Failed to update DayState after moving task to trash: ${original}. `
            + `Rollback failed while restoring file: ${rollback}`,
          );
        }
      }
      throw error;
    }
  }

  private async rollbackMoveDayState(
    touchedDates: Set<string>,
    snapshots: Map<string, DayState>,
  ): Promise<void> {
    if (touchedDates.size === 0) return;

    for (const dateKey of touchedDates) {
      const snapshot = snapshots.get(dateKey);
      if (!snapshot) continue;
      await this.dayStateService.updateDay(dateKey, () => cloneDayState(snapshot));
    }
  }
}
