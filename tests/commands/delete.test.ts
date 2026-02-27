import { deleteCommand } from '../../src/commands/delete';
import type { ServiceContainer } from '../../src/cli';

function createMockServices(): ServiceContainer {
  return {
    taskMutationService: {
      deleteTask: jest.fn(),
    },
  } as unknown as ServiceContainer;
}

describe('deleteCommand', () => {
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

  it('should reject invalid taskId format (human mode)', async () => {
    const services = createMockServices();
    await deleteCommand(services, '__proto__', {
      json: false,
      permanent: false,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid taskId format'),
    );
    expect(services.taskMutationService.deleteTask).not.toHaveBeenCalled();
  });

  it('should reject invalid taskId format (JSON mode)', async () => {
    const services = createMockServices();
    await deleteCommand(services, 'bad-id', {
      json: true,
      permanent: false,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    const parsed = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid taskId format');
    expect(services.taskMutationService.deleteTask).not.toHaveBeenCalled();
  });
});
