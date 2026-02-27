import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { initCommand } from '../../src/commands/init';
import { ConfigService } from '../../src/services/ConfigService';

jest.mock('node:readline', () => ({
  createInterface: jest.fn(),
}));

const mockCreateInterface = createInterface as jest.MockedFunction<typeof createInterface>;

describe('initCommand', () => {
  let mockExit: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCreateInterface.mockReset();
    jest.spyOn(ConfigService.prototype, 'saveConfig').mockResolvedValue(undefined);
    jest.spyOn(ConfigService.prototype, 'validateObsidianVaultPath').mockReturnValue('/tmp/vault');
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
    jest.restoreAllMocks();
  });

  it('should fail in JSON mode without prompting when vault path is missing', async () => {
    mockCreateInterface.mockImplementation(() => {
      throw new Error('prompt should not be called in --json mode');
    });

    await initCommand(undefined, { json: true });

    expect(mockCreateInterface).not.toHaveBeenCalled();
    expect(ConfigService.prototype.validateObsidianVaultPath).not.toHaveBeenCalled();
    expect(ConfigService.prototype.saveConfig).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);

    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('vaultPath');
  });

  it('should fail when prompt gets EOF without answer', async () => {
    const rl = new EventEmitter() as EventEmitter & {
      question: (query: string, cb: (answer: string) => void) => void;
      close: () => void;
    };
    rl.question = jest.fn((_query: string, _cb: (answer: string) => void) => {
      setTimeout(() => rl.emit('close'), 0);
    });
    rl.close = jest.fn();

    mockCreateInterface.mockReturnValue(
      rl as unknown as ReturnType<typeof createInterface>,
    );

    const result = await Promise.race([
      initCommand(undefined, { json: false }).then(() => 'completed'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ]);

    expect(result).toBe('completed');
    expect(ConfigService.prototype.saveConfig).not.toHaveBeenCalled();
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Vault path is required'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
