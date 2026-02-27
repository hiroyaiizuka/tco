import type { TaskChuteSettings } from '../types/index.js';
import type { VaultService } from './VaultService.js';
import { pickAllowedKeys, isSafeKey, MAX_REMIND_MINUTES } from '../utils/security.js';

const SETTINGS_PATH = '.obsidian/plugins/taskchute-plus/data.json';

const DEFAULT_SETTINGS: TaskChuteSettings = {
  useOrderBasedSort: true,
  slotKeys: {},
};

const ALLOWED_SETTINGS_KEYS = new Set([
  'locationMode', 'specifiedFolder',
  'useOrderBasedSort', 'slotKeys', 'customSections', 'defaultReminderMinutes',
]);

function normalizeSettings(raw: Partial<Record<string, unknown>>): Partial<TaskChuteSettings> {
  const result: Partial<TaskChuteSettings> = {};

  if (raw.locationMode === 'vaultRoot' || raw.locationMode === 'specifiedFolder') {
    result.locationMode = raw.locationMode;
  }

  if (typeof raw.specifiedFolder === 'string' && raw.specifiedFolder.length > 0) {
    result.specifiedFolder = raw.specifiedFolder;
  }

  if (typeof raw.useOrderBasedSort === 'boolean') {
    result.useOrderBasedSort = raw.useOrderBasedSort;
  }

  if (raw.slotKeys && typeof raw.slotKeys === 'object' && !Array.isArray(raw.slotKeys)) {
    const safeSlotKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.slotKeys as Record<string, unknown>)) {
      if (isSafeKey(k) && typeof v === 'string') {
        safeSlotKeys[k] = v;
      }
    }
    result.slotKeys = safeSlotKeys;
  }

  if (Array.isArray(raw.customSections)) {
    result.customSections = raw.customSections;
  }

  if (typeof raw.defaultReminderMinutes === 'number'
      && raw.defaultReminderMinutes >= 0 && raw.defaultReminderMinutes <= MAX_REMIND_MINUTES) {
    result.defaultReminderMinutes = raw.defaultReminderMinutes;
  }

  return result;
}

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
      const rawParsed = JSON.parse(raw) as Record<string, unknown>;
      const safeFields = pickAllowedKeys<Record<string, unknown>>(rawParsed, ALLOWED_SETTINGS_KEYS);
      this.settings = { ...DEFAULT_SETTINGS, ...normalizeSettings(safeFields) };
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
