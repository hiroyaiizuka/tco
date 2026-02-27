import { addCommand } from '../../src/commands/add';
import type { ServiceContainer } from '../../src/cli';

// Minimal mock of ServiceContainer for add command tests
function createMockServices(): ServiceContainer {
  return {
    pathService: {
      getTaskFolderPath: () => 'TaskChute/Task',
    },
    vault: {
      fileExists: () => false,
    },
    frontmatterService: {
      createFile: jest.fn(),
    },
  } as unknown as ServiceContainer;
}

describe('addCommand', () => {
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

  it('should reject negative --remind values', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: false,
      time: '09:00',
      remind: -5,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('remind'),
    );
    expect(services.frontmatterService.createFile).not.toHaveBeenCalled();
  });

  it('should reject negative --remind values in JSON mode', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: true,
      time: '09:00',
      remind: -5,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('remind');
  });

  it('should reject NaN --estimate values', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: false,
      estimate: NaN,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('estimate'),
    );
    expect(services.frontmatterService.createFile).not.toHaveBeenCalled();
  });

  it('should reject negative --estimate values', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: false,
      estimate: -10,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('estimate'),
    );
  });

  it('should reject NaN --estimate in JSON mode', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: true,
      estimate: NaN,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('estimate');
  });

  it('should reject task names containing path separators', async () => {
    const services = createMockServices();
    await addCommand(services, 'foo/bar', { json: false });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('task name'),
    );
    expect(services.frontmatterService.createFile).not.toHaveBeenCalled();
  });

  it('should reject task names containing path traversal segments', async () => {
    const services = createMockServices();
    await addCommand(services, '../note', { json: true });

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('task name');
    expect(services.frontmatterService.createFile).not.toHaveBeenCalled();
  });

  it('should stop without creating file when --time format is invalid', async () => {
    const services = createMockServices();
    await addCommand(services, 'test-task', {
      json: false,
      time: '99:99',
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid time format'),
    );
    expect(services.frontmatterService.createFile).not.toHaveBeenCalled();
  });
});
