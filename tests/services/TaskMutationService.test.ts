import { TaskMutationService } from '../../src/services/TaskMutationService';
import type { DayState } from '../../src/types';

function createMockDayState(): DayState {
  return {
    hiddenRoutines: [],
    deletedInstances: [],
    duplicatedInstances: [],
    slotOverrides: {},
    orders: {},
  };
}

describe('TaskMutationService', () => {
  describe('moveToDate', () => {
    it('should no-op for same-day move and avoid hidden routine tombstones', async () => {
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue(['TaskChute/Task/routine.md']),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId: 'tc-task-00000000-0000-0000-0000-000000000001', isRoutine: true },
        }),
        updateFrontmatter: jest.fn(),
      };
      const dayStateService = {
        updateDay: jest.fn().mockResolvedValue(createMockDayState()),
        loadDay: jest.fn().mockResolvedValue(createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate('tc-task-00000000-0000-0000-0000-000000000001', '2026-02-26', '2026-02-26');

      expect(frontmatterService.parseFrontmatter).toHaveBeenCalledTimes(1);
      expect(frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
      expect(dayStateService.updateDay).not.toHaveBeenCalled();
      expect(dayStateService.loadDay).not.toHaveBeenCalled();
    });

    it('should restore hidden routine entries on destination date when moved back', async () => {
      const taskPath = 'TaskChute/Task/routine.md';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId: 'tc-task-00000000-0000-0000-0000-000000000001', isRoutine: true },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        '2026-02-26': {
          ...createMockDayState(),
          hiddenRoutines: [{ path: taskPath, instanceId: null, hiddenAt: 100 }],
        },
        '2026-02-27': createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => {
          return stateByDate[dateKey] ?? createMockDayState();
        }),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate('tc-task-00000000-0000-0000-0000-000000000001', '2026-02-27', '2026-02-26');

      expect(frontmatterService.updateFrontmatter).toHaveBeenCalledWith(taskPath, { target_date: '2026-02-26' });
      expect(stateByDate['2026-02-27'].hiddenRoutines.some(h => h.path === taskPath)).toBe(true);

      const restoredEntry = stateByDate['2026-02-26'].hiddenRoutines.find(h => h.path === taskPath);
      expect(restoredEntry).toBeDefined();
      expect(restoredEntry?.restoredAt).toBeDefined();
      expect((restoredEntry?.restoredAt ?? 0)).toBeGreaterThan(restoredEntry?.hiddenAt ?? 0);
    });

    it('should not duplicate duplicatedInstances on round-trip move', async () => {
      const taskPath = 'TaskChute/Task/routine.md';
      const dup = {
        instanceId: 'tc-task-00000000-0000-0000-0000-000000000001::2026-02-26::dup-1',
        originalPath: taskPath,
        originalTaskId: 'tc-task-00000000-0000-0000-0000-000000000001',
      };
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId: 'tc-task-00000000-0000-0000-0000-000000000001', isRoutine: true },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        '2026-02-26': {
          ...createMockDayState(),
          duplicatedInstances: [dup],
        },
        '2026-02-27': createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => {
          return stateByDate[dateKey] ?? createMockDayState();
        }),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate('tc-task-00000000-0000-0000-0000-000000000001', '2026-02-26', '2026-02-27');
      await service.moveToDate('tc-task-00000000-0000-0000-0000-000000000001', '2026-02-27', '2026-02-26');

      const entriesOnA = stateByDate['2026-02-26'].duplicatedInstances;
      const matching = entriesOnA.filter(i => i.instanceId === dup.instanceId);
      expect(matching).toHaveLength(1);
    });

    it('should remove source slot overrides after moving to another date', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';

      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: {
          ...createMockDayState(),
          slotOverrides: { [taskId]: 'slot-1' },
          slotOverridesMeta: { [taskId]: { slotKey: 'slot-1', updatedAt: 1000 } },
        },
        [toDate]: createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => {
          return stateByDate[dateKey] ?? createMockDayState();
        }),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate(taskId, fromDate, toDate);

      expect(stateByDate[toDate].slotOverrides[taskId]).toBe('slot-1');
      expect(stateByDate[toDate].slotOverridesMeta?.[taskId]?.slotKey).toBe('slot-1');
      expect(stateByDate[fromDate].slotOverrides[taskId]).toBeUndefined();
      expect(stateByDate[fromDate].slotOverridesMeta?.[taskId]).toBeUndefined();
    });

    it('should not update frontmatter when DayState loading fails', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';

      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
        updateFrontmatter: jest.fn(),
      };
      const dayStateService = {
        updateDay: jest.fn(),
        loadDay: jest.fn().mockRejectedValue(new Error('broken daystate')),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.moveToDate(taskId, '2026-02-26', '2026-02-27')).rejects.toThrow('broken daystate');
      expect(frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should keep source routine visible when destination DayState update fails', async () => {
      const taskPath = 'TaskChute/Task/routine.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: true },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: createMockDayState(),
        [toDate]: createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          if (dateKey === toDate) {
            throw new Error('dest daystate broken');
          }
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => stateByDate[dateKey] ?? createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.moveToDate(taskId, fromDate, toDate)).rejects.toThrow('dest daystate broken');
      expect(stateByDate[fromDate].hiddenRoutines).toHaveLength(0);
      expect(frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should keep duplicated instances in source when destination transfer fails', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';
      const dup = {
        instanceId: `${taskId}::${fromDate}::dup-1`,
        originalPath: taskPath,
        originalTaskId: taskId,
      };
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: {
          ...createMockDayState(),
          duplicatedInstances: [dup],
        },
        [toDate]: createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          if (dateKey === toDate) {
            throw new Error('dest write failed');
          }
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => stateByDate[dateKey] ?? createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.moveToDate(taskId, fromDate, toDate)).rejects.toThrow('dest write failed');
      expect(stateByDate[fromDate].duplicatedInstances).toHaveLength(1);
      expect(stateByDate[fromDate].duplicatedInstances[0].instanceId).toBe(dup.instanceId);
      expect(frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should preserve deleted duplicated instance tombstones when moving date', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';
      const dup = {
        instanceId: `${taskId}::${fromDate}::dup-1`,
        originalPath: taskPath,
        originalTaskId: taskId,
      };
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: {
          ...createMockDayState(),
          duplicatedInstances: [dup],
          deletedInstances: [
            {
              instanceId: dup.instanceId,
              deletionType: 'temporary',
              deletedAt: 100,
            },
          ],
        },
        [toDate]: createMockDayState(),
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => stateByDate[dateKey] ?? createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate(taskId, fromDate, toDate);

      expect(stateByDate[toDate].duplicatedInstances.map(d => d.instanceId)).toContain(dup.instanceId);
      expect(
        stateByDate[toDate].deletedInstances.some(
          d => d.instanceId === dup.instanceId && d.deletionType === 'temporary',
        ),
      ).toBe(true);
      expect(stateByDate[fromDate].deletedInstances.some(d => d.instanceId === dup.instanceId)).toBe(false);
    });

    it('should restore matching deleted tombstones on destination date', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
        updateFrontmatter: jest.fn(),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: createMockDayState(),
        [toDate]: {
          ...createMockDayState(),
          deletedInstances: [
            {
              taskId,
              deletionType: 'temporary',
              deletedAt: 100,
            },
          ],
        },
      };
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => stateByDate[dateKey] ?? createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.moveToDate(taskId, fromDate, toDate);

      const restoredEntry = stateByDate[toDate].deletedInstances.find(d => d.taskId === taskId);
      expect(restoredEntry).toBeDefined();
      expect((restoredEntry?.restoredAt ?? 0)).toBeGreaterThan(restoredEntry?.deletedAt ?? 0);
      expect(frontmatterService.updateFrontmatter).toHaveBeenCalledWith(taskPath, { target_date: toDate });
    });

    it('should rollback DayState updates when frontmatter update fails', async () => {
      const taskPath = 'TaskChute/Task/routine.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const fromDate = '2026-02-26';
      const toDate = '2026-02-27';
      const dup = {
        instanceId: `${taskId}::${fromDate}::dup-1`,
        originalPath: taskPath,
        originalTaskId: taskId,
      };
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: true },
        }),
        updateFrontmatter: jest.fn().mockRejectedValue(new Error('frontmatter write failed')),
      };
      const stateByDate: Record<string, DayState> = {
        [fromDate]: {
          ...createMockDayState(),
          slotOverrides: { [taskId]: '8:00-12:00' },
          slotOverridesMeta: { [taskId]: { slotKey: '8:00-12:00', updatedAt: 100 } },
          duplicatedInstances: [dup],
        },
        [toDate]: {
          ...createMockDayState(),
          hiddenRoutines: [{ path: taskPath, instanceId: null, hiddenAt: 1000 }],
          deletedInstances: [{ taskId, deletionType: 'temporary', deletedAt: 1000 }],
        },
      };
      const beforeFrom = JSON.parse(JSON.stringify(stateByDate[fromDate])) as DayState;
      const beforeTo = JSON.parse(JSON.stringify(stateByDate[toDate])) as DayState;
      const dayStateService = {
        updateDay: jest.fn(async (dateKey: string, mutator: (state: DayState) => DayState | void) => {
          const current = stateByDate[dateKey] ?? createMockDayState();
          const working: DayState = JSON.parse(JSON.stringify(current)) as DayState;
          const result = mutator(working);
          stateByDate[dateKey] = (result as DayState) || working;
          return stateByDate[dateKey];
        }),
        loadDay: jest.fn(async (dateKey: string) => stateByDate[dateKey] ?? createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.moveToDate(taskId, fromDate, toDate)).rejects.toThrow('frontmatter write failed');
      expect(stateByDate[fromDate]).toEqual(beforeFrom);
      expect(stateByDate[toDate]).toEqual(beforeTo);
    });
  });

  describe('deleteTask', () => {
    it('should not update DayState when permanent trash move fails', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
        moveToTrash: jest.fn().mockRejectedValue(new Error('trash move failed')),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
      };
      const dayStateService = {
        updateDay: jest.fn(),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.deleteTask(taskId, '2026-02-26', true)).rejects.toThrow('trash move failed');
      expect(dayStateService.updateDay).not.toHaveBeenCalled();
    });

    it('should move to trash before updating DayState for permanent delete', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
        moveToTrash: jest.fn().mockResolvedValue(undefined),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
      };
      const dayStateService = {
        updateDay: jest.fn().mockResolvedValue(createMockDayState()),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await service.deleteTask(taskId, '2026-02-26', true);

      expect(vault.moveToTrash).toHaveBeenCalledWith(taskPath);
      expect(dayStateService.updateDay).toHaveBeenCalledTimes(1);
      expect(vault.moveToTrash.mock.invocationCallOrder[0]).toBeLessThan(
        dayStateService.updateDay.mock.invocationCallOrder[0],
      );
    });

    it('should rollback trash move when permanent delete DayState update fails', async () => {
      const taskPath = 'TaskChute/Task/task.md';
      const taskId = 'tc-task-00000000-0000-0000-0000-000000000001';
      const trashedPath = '.trash/task.md';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([taskPath]),
        moveToTrash: jest.fn().mockResolvedValue(trashedPath),
        restoreFromTrash: jest.fn().mockResolvedValue(undefined),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn().mockResolvedValue({
          data: { taskId, isRoutine: false },
        }),
      };
      const dayStateService = {
        updateDay: jest.fn().mockRejectedValue(new Error('daystate write failed')),
      };

      const service = new TaskMutationService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
      );

      await expect(service.deleteTask(taskId, '2026-02-26', true)).rejects.toThrow('daystate write failed');
      expect(vault.moveToTrash).toHaveBeenCalledWith(taskPath);
      expect(vault.restoreFromTrash).toHaveBeenCalledWith(trashedPath, taskPath);
      expect(dayStateService.updateDay.mock.invocationCallOrder[0]).toBeLessThan(
        vault.restoreFromTrash.mock.invocationCallOrder[0],
      );
    });
  });

  describe('taskId validation', () => {
    it('should reject __proto__ as taskId in findTaskByTaskId', async () => {
      const vault = { listMarkdownFiles: jest.fn() };
      const pathService = { getTaskFolderPath: jest.fn() };
      const frontmatterService = {};
      const dayStateService = {};

      const service = new TaskMutationService(
        vault as never, pathService as never,
        frontmatterService as never, dayStateService as never,
      );

      await expect(service.findTaskByTaskId('__proto__')).rejects.toThrow('Invalid taskId format');
    });

    it('should accept legacy format taskId in moveToDate validation', async () => {
      const vault = { listMarkdownFiles: jest.fn().mockResolvedValue([]) };
      const pathService = { getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task') };
      const frontmatterService = { parseFrontmatter: jest.fn() };
      const dayStateService = {};

      const service = new TaskMutationService(
        vault as never, pathService as never,
        frontmatterService as never, dayStateService as never,
      );

      await expect(service.moveToDate('tc-task-001', '2026-02-26', '2026-02-27')).rejects.toThrow('Task not found');
    });

    it('should reject invalid taskId in deleteTask', async () => {
      const vault = { listMarkdownFiles: jest.fn() };
      const pathService = { getTaskFolderPath: jest.fn() };
      const frontmatterService = {};
      const dayStateService = {};

      const service = new TaskMutationService(
        vault as never, pathService as never,
        frontmatterService as never, dayStateService as never,
      );

      await expect(service.deleteTask('constructor', '2026-02-26', false)).rejects.toThrow('Invalid taskId format');
    });

    it('should reject invalid taskId in moveToSlot', async () => {
      const vault = { listMarkdownFiles: jest.fn() };
      const pathService = { getTaskFolderPath: jest.fn() };
      const frontmatterService = {};
      const dayStateService = {};

      const service = new TaskMutationService(
        vault as never, pathService as never,
        frontmatterService as never, dayStateService as never,
      );

      await expect(service.moveToSlot('evil-id', '2026-02-26', 'slot-1')).rejects.toThrow('Invalid taskId format');
    });
  });
});
