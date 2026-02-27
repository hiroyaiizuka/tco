import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import type { TcoConfig } from '../types/index.js';

const CONFIG_FILENAME = '.tcorc';

export class ConfigService {
  private configPath: string;

  constructor() {
    this.configPath = join(homedir(), CONFIG_FILENAME);
  }

  /** Load config from ~/.tcorc */
  async loadConfig(): Promise<TcoConfig | null> {
    if (!existsSync(this.configPath)) return null;
    try {
      const content = await readFile(this.configPath, 'utf-8');
      const raw: unknown = JSON.parse(content);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const record = raw as Record<string, unknown>;
      const vaultPath = Object.hasOwn(record, 'vaultPath')
        && typeof record.vaultPath === 'string'
        && record.vaultPath.trim().length > 0
        ? record.vaultPath.trim()
        : null;
      return vaultPath ? { vaultPath } : null;
    } catch {
      return null;
    }
  }

  /** Save config to ~/.tcorc */
  async saveConfig(config: TcoConfig): Promise<void> {
    const dir = dirname(this.configPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Resolve vault path by priority:
   * 1. CLI --vault option
   * 2. TCO_VAULT_PATH environment variable
   * 3. ~/.tcorc config file
   */
  async resolveVaultPath(cliOption?: string): Promise<string> {
    if (cliOption) return cliOption;

    const envPath = process.env.TCO_VAULT_PATH;
    if (envPath) return envPath;

    const config = await this.loadConfig();
    if (config?.vaultPath) return config.vaultPath;

    throw new Error(
      'Vault path not configured. Run `tco init` or set --vault / TCO_VAULT_PATH.',
    );
  }

  /** Validate that path is an existing Obsidian vault and return absolute path */
  validateObsidianVaultPath(vaultPath: string): string {
    const resolved = resolve(vaultPath);
    if (!existsSync(resolved)) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }
    if (!statSync(resolved).isDirectory()) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }

    const obsidianPath = resolve(resolved, '.obsidian');
    if (!existsSync(obsidianPath)) {
      throw new Error(`Not an Obsidian vault (no .obsidian directory): ${resolved}`);
    }
    if (!statSync(obsidianPath).isDirectory()) {
      throw new Error(`Not an Obsidian vault (no .obsidian directory): ${resolved}`);
    }
    return resolved;
  }
}
