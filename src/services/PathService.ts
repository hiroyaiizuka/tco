import type { TaskChuteSettings } from '../types/index.js';

const GROUP = 'TaskChute';
const SUBDIR_TASK = 'Task';
const SUBDIR_LOG = 'Log';

/**
 * PathService - Resolves paths based on plugin settings.
 * Uses forward-slash separated vault-relative paths.
 */
export class PathService {
  constructor(private readonly settings: TaskChuteSettings) {}

  private resolveBase(): string {
    const mode = this.settings.locationMode ?? 'vaultRoot';
    if (mode === 'specifiedFolder') {
      const specified = (this.settings.specifiedFolder || '').trim();
      if (specified) return this.normalizePath(specified);
    }
    return '';
  }

  private join(...parts: string[]): string {
    const filtered = parts.filter(p => p && p.trim().length > 0);
    return this.normalizePath(filtered.join('/'));
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  }

  /** Get TaskChute/Task folder path */
  getTaskFolderPath(): string {
    const base = this.resolveBase();
    return this.join(base, GROUP, SUBDIR_TASK);
  }

  /** Get TaskChute/Log folder path */
  getLogDataPath(): string {
    const base = this.resolveBase();
    return this.join(base, GROUP, SUBDIR_LOG);
  }
}
