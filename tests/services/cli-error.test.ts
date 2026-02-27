import { formatCliFatalError } from '../../src/utils/cli-error';

describe('formatCliFatalError', () => {
  it('should return JSON when json mode is enabled', () => {
    const output = formatCliFatalError(new Error('boom'), true);
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('boom');
  });

  it('should return plain text when json mode is disabled', () => {
    const output = formatCliFatalError(new Error('boom'), false);
    expect(output).toBe('Error: boom');
  });
});
