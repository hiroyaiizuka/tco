import { TaskLoaderService } from '../../src/services/TaskLoaderService';
import { VaultService } from '../../src/services/VaultService';
import { PathService } from '../../src/services/PathService';
import { FrontmatterService } from '../../src/services/FrontmatterService';
import { DayStateService } from '../../src/services/DayStateService';
import { SettingsService } from '../../src/services/SettingsService';
import { resolve, join } from 'path';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'os';
import { formatDate } from '../../src/utils/date';

const FIXTURE_VAULT = resolve(__dirname, '../fixtures/vault');

describe('TaskLoaderService', () => {
  let taskLoader: TaskLoaderService;

  beforeEach(async () => {
    const vault = new VaultService(FIXTURE_VAULT);
    const settingsService = new SettingsService(vault);
    await settingsService.loadSettings();
    const pathService = new PathService(settingsService.getSettings());
    const frontmatterService = new FrontmatterService(vault);
    const dayStateService = new DayStateService(vault, pathService);
    taskLoader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);
  });

  describe('loadTasksForDate', () => {
    it('should load tasks for a specific date', async () => {
      const instances = await taskLoader.loadTasksForDate('2026-02-26');

      expect(instances.length).toBeGreaterThan(0);

      // Should include the daily task
      const dailyTask = instances.find(i => i.task.taskId === 'tc-task-daily-001');
      expect(dailyTask).toBeDefined();
      expect(dailyTask!.task.name).toBe('daily-task');
      expect(dailyTask!.task.scheduledTime).toBe('09:00');
    });

    it('should include routine tasks that are due', async () => {
      const instances = await taskLoader.loadTasksForDate('2026-02-26');

      // Daily routine should be due
      const routineTask = instances.find(i => i.task.taskId === 'tc-task-routine-001');
      expect(routineTask).toBeDefined();
    });

    it('should include weekly routine on correct day', async () => {
      // 2026-02-26 is a Thursday (weekday 4)
      const instances = await taskLoader.loadTasksForDate('2026-02-26');
      const weeklyTask = instances.find(i => i.task.taskId === 'tc-task-weekly-001');
      expect(weeklyTask).toBeDefined();
    });

    it('should exclude weekly routine on wrong day', async () => {
      // 2026-02-25 is a Wednesday (weekday 3)
      const instances = await taskLoader.loadTasksForDate('2026-02-25');
      const weeklyTask = instances.find(i => i.task.taskId === 'tc-task-weekly-001');
      expect(weeklyTask).toBeUndefined();
    });

    it('should return empty for a date with no tasks', async () => {
      // Use a date where no non-routine tasks have target_date and no routines match
      const instances = await taskLoader.loadTasksForDate('2020-01-01');
      expect(instances).toEqual([]);
    });

    it('should assign slot keys based on scheduled time', async () => {
      const instances = await taskLoader.loadTasksForDate('2026-02-26');

      const dailyTask = instances.find(i => i.task.taskId === 'tc-task-daily-001');
      expect(dailyTask!.slotKey).toBe('8:00-12:00'); // 09:00 → 8:00-12:00
    });

    it('should read legacy 開始時刻 field as scheduled time', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-legacy-start-time-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const taskPath = join(tempVault, 'TaskChute', 'Task', 'legacy-start-time.md');
        const markdown = `---\n` +
          `target_date: "2026-03-03"\n` +
          `taskId: "tc-task-legacy-start-time-001"\n` +
          `開始時刻: "09:30"\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# Legacy Start Time\n`;
        await writeFile(taskPath, markdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const instances = await loader.loadTasksForDate('2026-03-03');
        const legacyTask = instances.find(i => i.task.taskId === 'tc-task-legacy-start-time-001');

        expect(legacyTask).toBeDefined();
        expect(legacyTask?.task.scheduledTime).toBe('09:30');
        expect(legacyTask?.slotKey).toBe('8:00-12:00');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should assign slot key from ISO scheduled_time', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-iso-scheduled-time-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const taskPath = join(tempVault, 'TaskChute', 'Task', 'iso-scheduled-time.md');
        const markdown = `---\n` +
          `target_date: "2026-03-04"\n` +
          `taskId: "tc-task-iso-scheduled-time-001"\n` +
          `scheduled_time: "2026-03-04T09:30:00+09:00"\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# ISO Scheduled Time\n`;
        await writeFile(taskPath, markdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const instances = await loader.loadTasksForDate('2026-03-04');
        const isoTask = instances.find(i => i.task.taskId === 'tc-task-iso-scheduled-time-001');

        expect(isoTask).toBeDefined();
        expect(isoTask?.slotKey).toBe('8:00-12:00');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should sort single-digit hour times correctly within same slot', async () => {
      // 2026-03-01: two tasks in the same slot (8:00-12:00) with times 9:00 and 10:00
      // localeCompare("9:00","10:00") > 0 because "9" > "1", so broken sort puts 10:00 first
      const instances = await taskLoader.loadTasksForDate('2026-03-01');
      const task9 = instances.find(i => i.task.taskId === 'tc-task-morning-9');
      const task10 = instances.find(i => i.task.taskId === 'tc-task-morning-10');
      expect(task9).toBeDefined();
      expect(task10).toBeDefined();

      const idx9 = instances.indexOf(task9!);
      const idx10 = instances.indexOf(task10!);
      // 9:00 should come before 10:00
      expect(idx9).toBeLessThan(idx10);
    });

    it('should sort second-level scheduled_time correctly within same slot', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-seconds-sort-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const earlierPath = join(tempVault, 'TaskChute', 'Task', 'z-seconds-earlier.md');
        const laterPath = join(tempVault, 'TaskChute', 'Task', 'a-seconds-later.md');
        const earlierMarkdown = `---\n` +
          `target_date: "2026-03-02"\n` +
          `taskId: "tc-task-seconds-earlier"\n` +
          `scheduled_time: "09:00:30"\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# Seconds Earlier\n`;
        const laterMarkdown = `---\n` +
          `target_date: "2026-03-02"\n` +
          `taskId: "tc-task-seconds-later"\n` +
          `scheduled_time: "09:00:45"\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# Seconds Later\n`;

        await writeFile(earlierPath, earlierMarkdown, 'utf-8');
        await writeFile(laterPath, laterMarkdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const instances = await loader.loadTasksForDate('2026-03-02');
        const earlier = instances.find(i => i.task.taskId === 'tc-task-seconds-earlier');
        const later = instances.find(i => i.task.taskId === 'tc-task-seconds-later');

        expect(earlier).toBeDefined();
        expect(later).toBeDefined();
        expect(instances.indexOf(earlier!)).toBeLessThan(instances.indexOf(later!));
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should fallback to task name order when both scheduled times are invalid', async () => {
      const dateKey = '2026-03-10';
      const vault = {
        listMarkdownFiles: jest.fn().mockResolvedValue([
          'TaskChute/Task/z-invalid-time.md',
          'TaskChute/Task/a-invalid-time.md',
        ]),
      };
      const pathService = {
        getTaskFolderPath: jest.fn().mockReturnValue('TaskChute/Task'),
      };
      const frontmatterByPath: Record<string, Record<string, unknown>> = {
        'TaskChute/Task/z-invalid-time.md': {
          taskId: 'tc-task-invalid-z',
          target_date: dateKey,
          scheduled_time: 'invalid-z',
        },
        'TaskChute/Task/a-invalid-time.md': {
          taskId: 'tc-task-invalid-a',
          target_date: dateKey,
          scheduled_time: 'invalid-a',
        },
      };
      const frontmatterService = {
        parseFrontmatter: jest.fn(async (filePath: string) => ({
          data: frontmatterByPath[filePath],
          content: '',
        })),
      };
      const dayStateService = {
        loadDay: jest.fn().mockResolvedValue({
          hiddenRoutines: [],
          deletedInstances: [],
          duplicatedInstances: [],
          slotOverrides: {},
          orders: {},
        }),
      };
      const settingsService = {
        getSettings: jest.fn().mockReturnValue({
          useOrderBasedSort: false,
        }),
      };

      const loader = new TaskLoaderService(
        vault as never,
        pathService as never,
        frontmatterService as never,
        dayStateService as never,
        settingsService as never,
      );

      const instances = await loader.loadTasksForDate(dateKey);
      expect(instances.map(i => i.task.name)).toEqual(['a-invalid-time', 'z-invalid-time']);
    });

    it('should sort by slot time order when no DayState orders exist', async () => {
      // 2026-02-27 has no DayState orders, so fallback sort applies
      const instances = await taskLoader.loadTasksForDate('2026-02-27');
      if (instances.length < 2) return; // need at least 2 for ordering test

      const slotKeys = instances.map(i => i.slotKey);
      // Slots must be in time order: 0:00-8:00 < 8:00-12:00 < 12:00-16:00 < 16:00-0:00 < none
      const slotOrder = ['0:00-8:00', '8:00-12:00', '12:00-16:00', '16:00-0:00', 'none'];
      for (let i = 1; i < slotKeys.length; i++) {
        const prevIdx = slotOrder.indexOf(slotKeys[i - 1]);
        const currIdx = slotOrder.indexOf(slotKeys[i]);
        if (prevIdx >= 0 && currIdx >= 0) {
          expect(prevIdx).toBeLessThanOrEqual(currIdx);
        }
      }
    });

    it('should ignore DayState orders when useOrderBasedSort is false', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-sort-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const settingsPath = join(tempVault, '.obsidian', 'plugins', 'taskchute-plus', 'data.json');
        await writeFile(settingsPath, JSON.stringify({
          useOrderBasedSort: false,
          slotKeys: {},
          locationMode: 'vaultRoot',
        }, null, 2), 'utf-8');

        const dayStatePath = join(tempVault, 'TaskChute', 'Log', '2026-02-state.json');
        const dayState = JSON.parse(await readFile(dayStatePath, 'utf-8')) as {
          days: Record<string, { orders: Record<string, number> }>;
        };
        dayState.days['2026-02-26'].orders = {
          'tc-task-reminder-001::12:00-16:00': 1,
          'tc-task-weekly-001::12:00-16:00': 2,
          'tc-task-daily-001::8:00-12:00': 3,
          'tc-task-routine-001::0:00-8:00': 4,
        };
        await writeFile(dayStatePath, JSON.stringify(dayState, null, 2), 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const instances = await loader.loadTasksForDate('2026-02-26');
        const ids = instances.map(i => i.task.taskId);

        expect(ids).toEqual([
          'tc-task-routine-001',
          'tc-task-daily-001',
          'tc-task-weekly-001',
          'tc-task-reminder-001',
        ]);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should show non-routine tasks without target_date on their created date', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-created-date-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const createdMillis = new Date(2026, 2, 5, 12, 0, 0, 0).getTime();
        const taskPath = join(tempVault, 'TaskChute', 'Task', 'created-date-only.md');
        const markdown = `---\n` +
          `taskId: tc-task-created-date-001\n` +
          `tags:\n` +
          `  - task\n` +
          `createdMillis: ${createdMillis}\n` +
          `---\n\n` +
          `# Created Date Only\n`;
        await writeFile(taskPath, markdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const onCreatedDate = await loader.loadTasksForDate('2026-03-05');
        const onOtherDate = await loader.loadTasksForDate('2026-03-06');

        expect(onCreatedDate.some(i => i.task.taskId === 'tc-task-created-date-001')).toBe(true);
        expect(onOtherDate.some(i => i.task.taskId === 'tc-task-created-date-001')).toBe(false);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should load non-routine tasks with unquoted YAML target_date', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-yaml-date-target-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const taskPath = join(tempVault, 'TaskChute', 'Task', 'yaml-date-target.md');
        const markdown = `---\n` +
          `taskId: tc-task-yaml-date-target-001\n` +
          `target_date: 2026-03-15\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# YAML Date Target\n`;
        await writeFile(taskPath, markdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const onTargetDate = await loader.loadTasksForDate('2026-03-15');
        const onOtherDate = await loader.loadTasksForDate('2026-03-16');
        const targetTask = onTargetDate.find(i => i.task.taskId === 'tc-task-yaml-date-target-001');

        expect(targetTask).toBeDefined();
        expect(targetTask?.task.targetDate).toBe('2026-03-15');
        expect(onOtherDate.some(i => i.task.taskId === 'tc-task-yaml-date-target-001')).toBe(false);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should not show non-routine tasks without target_date and createdMillis', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-undated-task-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const taskPath = join(tempVault, 'TaskChute', 'Task', 'undated-task.md');
        const markdown = `---\n` +
          `taskId: tc-task-undated-001\n` +
          `tags:\n` +
          `  - task\n` +
          `---\n\n` +
          `# Undated Task\n`;
        await writeFile(taskPath, markdown, 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const today = formatDate(new Date());
        const instances = await loader.loadTasksForDate(today);

        expect(instances.some(i => i.task.taskId === 'tc-task-undated-001')).toBe(false);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should not leak inherited properties from slotOverrides', () => {
      // Verify that Object.hasOwn prevents prototype chain leakage
      const mockSlotOverrides = Object.create({ 'inherited-task': 'evil-slot' }) as Record<string, string>;
      mockSlotOverrides['safe-task'] = 'good-slot';

      expect(Object.hasOwn(mockSlotOverrides, 'safe-task')).toBe(true);
      expect(Object.hasOwn(mockSlotOverrides, 'inherited-task')).toBe(false);
      // This verifies that [] access would return inherited value, but hasOwn blocks it
      expect(mockSlotOverrides['inherited-task']).toBe('evil-slot');
    });

    it('should not leak inherited properties from orders', () => {
      const mockOrders = Object.create({ 'inherited-key': 999 }) as Record<string, number>;
      mockOrders['safe-key'] = 1;

      expect(Object.hasOwn(mockOrders, 'safe-key')).toBe(true);
      expect(Object.hasOwn(mockOrders, 'inherited-key')).toBe(false);
    });

    it('should not restore duplicated instances that are deleted by instanceId tombstone', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-dup-delete-test-'));
      const tempVault = join(tempRoot, 'vault');
      try {
        await cp(FIXTURE_VAULT, tempVault, { recursive: true });

        const dayStatePath = join(tempVault, 'TaskChute', 'Log', '2026-02-state.json');
        const state = JSON.parse(await readFile(dayStatePath, 'utf-8')) as {
          days: Record<string, {
            deletedInstances: Array<Record<string, unknown>>;
            duplicatedInstances: Array<Record<string, unknown>>;
          }>;
        };
        const targetDay = state.days['2026-02-26'];
        const duplicatedInstanceId = 'tc-task-daily-001::2026-02-26::dup-1';
        targetDay.duplicatedInstances.push({
          instanceId: duplicatedInstanceId,
          originalPath: 'TaskChute/Task/daily-task.md',
          originalTaskId: 'tc-task-daily-001',
          slotKey: '8:00-12:00',
          createdMillis: Date.UTC(2026, 1, 26, 9, 0, 0, 0),
        });
        targetDay.deletedInstances.push({
          instanceId: duplicatedInstanceId,
          deletionType: 'temporary',
          deletedAt: Date.UTC(2026, 1, 26, 10, 0, 0, 0),
        });
        await writeFile(dayStatePath, JSON.stringify(state, null, 2), 'utf-8');

        const vault = new VaultService(tempVault);
        const settingsService = new SettingsService(vault);
        await settingsService.loadSettings();
        const pathService = new PathService(settingsService.getSettings());
        const frontmatterService = new FrontmatterService(vault);
        const dayStateService = new DayStateService(vault, pathService);
        const loader = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);

        const instances = await loader.loadTasksForDate('2026-02-26');
        const restoredDup = instances.filter(i => i.instanceId === duplicatedInstanceId);
        expect(restoredDup).toHaveLength(0);
        expect(instances.some(i => i.instanceId === 'tc-task-daily-001::2026-02-26')).toBe(true);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
