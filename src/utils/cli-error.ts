import { formatOutput } from './output.js';

export function isJsonModeFromArgv(argv: readonly string[]): boolean {
  return argv.includes('--json');
}

export function formatCliFatalError(error: unknown, json: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    return formatOutput({ success: false, error: message }, true);
  }
  return `Error: ${message}`;
}
