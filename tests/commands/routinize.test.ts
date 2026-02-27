import { routinizeCommand } from '../../src/commands/routinize';
import type { ServiceContainer } from '../../src/cli';

function createMockServices(): ServiceContainer {
  return {
    taskMutationService: {
      findTaskByTaskId: jest.fn().mockResolvedValue({
        filePath: 'TaskChute/Task/test.md',
        name: 'test',
        taskId: 'tc-task-00000000-0000-0000-0000-000000000001',
      }),
    },
    frontmatterService: {
      updateFrontmatter: jest.fn(),
    },
  } as unknown as ServiceContainer;
}

describe('routinizeCommand', () => {
  let mockExit: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
  });

  describe('taskId validation', () => {
    it('should reject invalid taskId format (human mode)', async () => {
      const services = createMockServices();
      await routinizeCommand(services, '__proto__', {
        json: false,
        type: 'daily',
        interval: 1,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid taskId format'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject invalid taskId format (JSON mode)', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'bad-id', {
        json: true,
        type: 'daily',
        interval: 1,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid taskId format');
    });
  });

  describe('--interval validation', () => {
    it('should reject NaN interval', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: NaN,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('interval'),
      );
    });

    it('should reject zero interval', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 0,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('interval'),
      );
    });

    it('should reject negative interval', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: -1,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('interval'),
      );
    });

    it('should reject interval > 1 without --start', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 2,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('--start'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });
  });

  describe('required params per routine type', () => {
    it('should reject weekly without --weekday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'weekly',
        interval: 1,
        // weekday not specified
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('weekday'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject monthly without --week', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'monthly',
        interval: 1,
        weekday: '4',
        // week not specified
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('week'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject monthly without --weekday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'monthly',
        interval: 1,
        week: '2',
        // weekday not specified
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('weekday'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject monthly_date without --monthday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'monthly_date',
        interval: 1,
        // monthday not specified
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('monthday'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should accept weekly with --weekday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'weekly',
        interval: 1,
        weekday: '4',
      });

      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should save both routine_weekdays and weekdays for weekly multi-weekday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'weekly',
        interval: 1,
        weekday: '1,3',
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(services.frontmatterService.updateFrontmatter).toHaveBeenCalledTimes(1);

      const updates = (services.frontmatterService.updateFrontmatter as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
      expect(updates.routine_weekdays).toEqual([1, 3]);
      expect(updates.weekdays).toEqual([1, 3]);
      expect(updates.routine_weekday).toBeUndefined();
    });

    it('should save both routine_weekday and weekday for weekly single weekday', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'weekly',
        interval: 1,
        weekday: '4',
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(services.frontmatterService.updateFrontmatter).toHaveBeenCalledTimes(1);

      const updates = (services.frontmatterService.updateFrontmatter as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
      expect(updates.routine_weekday).toBe(4);
      expect(updates.weekday).toBe(4);
      expect(updates.weekdays).toBeUndefined();
    });
  });

  describe('--start/--end validation', () => {
    it('should reject invalid --start format', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
        start: '2026-1-1',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('start'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject non-existent --start date', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
        start: '2026-13-01',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('start'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject non-existent --end date', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
        end: '2026-02-30',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('end'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should reject when --end is earlier than --start', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
        start: '2026-03-10',
        end: '2026-03-01',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('end'),
      );
      expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('should clear target_date when --start is specified', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
        start: '2026-03-01',
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(services.frontmatterService.updateFrontmatter).toHaveBeenCalledTimes(1);

      const updates = (services.frontmatterService.updateFrontmatter as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
      expect(updates.routine_start).toBe('2026-03-01');
      expect(Object.prototype.hasOwnProperty.call(updates, 'target_date')).toBe(true);
      expect(updates.target_date).toBeUndefined();
    });
  });

  describe('strict numeric list validation', () => {
    it('should reject weekday entries with trailing characters', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'weekly',
        interval: 1,
        weekday: '4foo',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('weekday'),
      );
    });

    it('should reject week entries with trailing characters', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'monthly',
        interval: 1,
        week: '2abc',
        weekday: '4',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('week'),
      );
    });

    it('should reject monthday entries with trailing characters', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'monthly_date',
        interval: 1,
        monthday: '15x',
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('monthday'),
      );
    });
  });

  describe('cleanup legacy fields', () => {
    it('should clear legacy weekday field when converting to daily', async () => {
      const services = createMockServices();
      await routinizeCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
        json: false,
        type: 'daily',
        interval: 1,
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(services.frontmatterService.updateFrontmatter).toHaveBeenCalledTimes(1);

      const updates = (services.frontmatterService.updateFrontmatter as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(updates, 'weekday')).toBe(true);
      expect(updates.weekday).toBeUndefined();
    });
  });
});
