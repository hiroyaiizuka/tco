import type { TaskChuteSettings } from '../types/index.js';
import type { VaultService } from './VaultService.js';

const SETTINGS_PATH = '.obsidian/plugins/taskchute-plus/data.json';

const DEFAULT_SETTINGS: TaskChuteSettings = {
  useOrderBasedSort: true,
  slotKeys: {},
};

export class SettingsService {
  private settings: TaskChuteSettings | null = null;

  constructor(private readonly vault: VaultService) {}

  /** Load settings from data.json */
  async loadSettings(): Promise<TaskChuteSettings> {
    if (this.settings) return this.settings;

    if (!this.vault.fileExists(SETTINGS_PATH)) {
      this.settings = { ...DEFAULT_SETTINGS };
      return this.settings;
    }

    try {
      const raw = await this.vault.readFile(SETTINGS_PATH);
      const parsed = JSON.parse(raw) as Partial<TaskChuteSettings>;
      this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      return this.settings;
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
      return this.settings;
    }
  }

  /** Get cached settings (must call loadSettings first) */
  getSettings(): TaskChuteSettings {
    if (!this.settings) {
      throw new Error('Settings not loaded. Call loadSettings() first.');
    }
    return this.settings;
  }
}
