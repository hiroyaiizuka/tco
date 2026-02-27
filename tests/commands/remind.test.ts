import { remindCommand } from '../../src/commands/remind';
import type { ServiceContainer } from '../../src/cli';

function createMockServices(): ServiceContainer {
  return {
    taskMutationService: {
      findTaskByTaskId: jest.fn().mockResolvedValue({
        filePath: 'TaskChute/Task/test.md',
        taskId: 'tc-task-001',
      }),
    },
    frontmatterService: {
      updateFrontmatter: jest.fn(),
    },
  } as unknown as ServiceContainer;
}

describe('remindCommand', () => {
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

  it('should stop without updating frontmatter when --time is invalid', async () => {
    const services = createMockServices();

    await remindCommand(services, 'tc-task-001', {
      json: false,
      clear: false,
      time: '25:99',
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid time format'),
    );
    expect(services.frontmatterService.updateFrontmatter).not.toHaveBeenCalled();
    expect(mockConsoleLog).not.toHaveBeenCalledWith(
      expect.stringContaining('Set reminder'),
    );
  });
});
