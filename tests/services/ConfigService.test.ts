import { ConfigService } from '../../src/services/ConfigService';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('ConfigService', () => {
  describe('resolveVaultPath', () => {
    it('should prioritize CLI option', async () => {
      const service = new ConfigService();
      const path = await service.resolveVaultPath('/cli/path');
      expect(path).toBe('/cli/path');
    });

    it('should fall back to environment variable', async () => {
      const original = process.env.TCO_VAULT_PATH;
      process.env.TCO_VAULT_PATH = '/env/path';
      try {
        const service = new ConfigService();
        const path = await service.resolveVaultPath();
        expect(path).toBe('/env/path');
      } finally {
        if (original !== undefined) {
          process.env.TCO_VAULT_PATH = original;
        } else {
          delete process.env.TCO_VAULT_PATH;
        }
      }
    });

    it('should throw if no path is configured', async () => {
      const original = process.env.TCO_VAULT_PATH;
      delete process.env.TCO_VAULT_PATH;
      try {
        const service = new ConfigService();
        const loadConfigSpy = jest.spyOn(service, 'loadConfig').mockResolvedValue(null);
        await expect(service.resolveVaultPath()).rejects.toThrow('Vault path not configured');
        expect(loadConfigSpy).toHaveBeenCalledTimes(1);
      } finally {
        if (original !== undefined) {
          process.env.TCO_VAULT_PATH = original;
        }
      }
    });
  });

  describe('validateObsidianVaultPath', () => {
    let tempRoot: string;

    beforeEach(async () => {
      tempRoot = await mkdtemp(join(tmpdir(), 'tco-config-test-'));
    });

    afterEach(async () => {
      if (tempRoot) {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should throw when directory does not exist', () => {
      const service = new ConfigService();
      const missing = join(tempRoot, 'missing-vault');
      expect(() => service.validateObsidianVaultPath(missing)).toThrow('Directory does not exist');
    });

    it('should throw when .obsidian directory is missing', async () => {
      const service = new ConfigService();
      const vaultDir = join(tempRoot, 'vault-without-obsidian');
      await mkdir(vaultDir, { recursive: true });
      expect(() => service.validateObsidianVaultPath(vaultDir)).toThrow('Not an Obsidian vault');
    });

    it('should throw when .obsidian exists but is not a directory', async () => {
      const service = new ConfigService();
      const vaultDir = join(tempRoot, 'vault-with-file-obsidian');
      await mkdir(vaultDir, { recursive: true });
      await writeFile(join(vaultDir, '.obsidian'), 'not-a-directory', 'utf-8');
      expect(() => service.validateObsidianVaultPath(vaultDir)).toThrow('Not an Obsidian vault');
    });

    it('should return absolute path for valid Obsidian vault', async () => {
      const service = new ConfigService();
      const vaultDir = join(tempRoot, 'vault');
      await mkdir(join(vaultDir, '.obsidian'), { recursive: true });
      expect(service.validateObsidianVaultPath(vaultDir)).toBe(resolve(vaultDir));
    });
  });
});
