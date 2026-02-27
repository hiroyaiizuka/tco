import { runCli } from '../src/cli';

describe('cli --json error output', () => {
  let mockExit: jest.SpyInstance;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockStdoutWrite: jest.SpyInstance;
  let mockStderrWrite: jest.SpyInstance;

  beforeEach(() => {
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockStdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockStdoutWrite.mockRestore();
    mockStderrWrite.mockRestore();
  });

  it('should return JSON for commander parse errors in --json mode', async () => {
    await runCli(['node', 'tco', '--json', 'unknown-command']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleLog).toHaveBeenCalled();

    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('unknown command');
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should return JSON for subcommand missing required argument in --json mode', async () => {
    await runCli(['node', 'tco', '--json', 'move']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleLog).toHaveBeenCalled();

    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('missing required argument');
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should return JSON for subcommand option value missing in --json mode', async () => {
    await runCli(['node', 'tco', '--json', 'list', '--slot']);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleLog).toHaveBeenCalled();

    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('option');
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should not output help text to stdout in --json mode', async () => {
    await runCli(['node', 'tco', '--json', 'move']);

    const stdout = mockStdoutWrite.mock.calls
      .map(args => String(args[0]))
      .join('');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(stdout).not.toContain('Usage:');
    expect(stdout).not.toContain('Options:');
    expect(stdout).not.toContain('Arguments:');
  });

  it('should not output help text to stderr when root command is missing in --json mode', async () => {
    await runCli(['node', 'tco', '--json']);

    const stderr = mockStderrWrite.mock.calls
      .map(args => String(args[0]))
      .join('');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(stderr).not.toContain('Usage:');
    expect(stderr).not.toContain('Options:');
    expect(stderr).not.toContain('Commands:');
    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
  });
});
