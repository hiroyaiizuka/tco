import { moveCommand } from '../../src/commands/move';
import type { ServiceContainer } from '../../src/cli';

function createMockServices(): ServiceContainer {
  return {
    settingsService: {
      getSettings: jest.fn().mockReturnValue({
        useOrderBasedSort: true,
        slotKeys: {},
      }),
    },
    taskMutationService: {
      moveToDate: jest.fn(),
      moveToSlot: jest.fn(),
    },
  } as unknown as ServiceContainer;
}

describe('moveCommand', () => {
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

  it('should reject unknown --slot key in JSON mode', async () => {
    const services = createMockServices();
    await moveCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
      json: true,
      from: '2026-02-26',
      slot: 'typo-slot',
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(services.taskMutationService.moveToSlot).not.toHaveBeenCalled();
    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid slot key');
  });

  it('should reject invalid taskId format (human mode)', async () => {
    const services = createMockServices();
    await moveCommand(services, '__proto__', {
      json: false,
      from: '2026-02-26',
      date: '2026-02-27',
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid taskId format'),
    );
  });

  it('should reject invalid taskId format (JSON mode)', async () => {
    const services = createMockServices();
    await moveCommand(services, 'bad-id', {
      json: true,
      from: '2026-02-26',
      date: '2026-02-27',
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid taskId format');
  });

  it('should accept valid --slot key', async () => {
    const services = createMockServices();
    await moveCommand(services, 'tc-task-00000000-0000-0000-0000-000000000001', {
      json: false,
      from: '2026-02-26',
      slot: '8:00-12:00',
    });

    expect(mockExit).not.toHaveBeenCalled();
    expect(services.taskMutationService.moveToSlot).toHaveBeenCalledWith(
      'tc-task-00000000-0000-0000-0000-000000000001',
      '2026-02-26',
      '8:00-12:00',
    );
  });
});
