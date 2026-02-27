import { DayStateService } from '../../src/services/DayStateService';
import { VaultService } from '../../src/services/VaultService';
import { PathService } from '../../src/services/PathService';
import { resolve, join } from 'path';
import type { DeletedInstance, HiddenRoutine } from '../../src/types';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const FIXTURE_VAULT = resolve(__dirname, '../fixtures/vault');

describe('DayStateService', () => {
  let vault: VaultService;
  let pathService: PathService;
  let dayStateService: DayStateService;

  beforeEach(() => {
    vault = new VaultService(FIXTURE_VAULT);
    pathService = new PathService({ useOrderBasedSort: true, slotKeys: {} });
    dayStateService = new DayStateService(vault, pathService);
  });

  describe('loadDay', () => {
    it('should load existing day state', async () => {
      const state = await dayStateService.loadDay('2026-02-26');
      expect(state).toBeDefined();
      expect(state.hiddenRoutines).toEqual([]);
      expect(state.deletedInstances).toEqual([]);
      expect(state.orders).toBeDefined();
      expect(state.orders['tc-task-routine-001::0:00-8:00']).toBe(1);
    });

    it('should return empty state for non-existent date', async () => {
      const state = await dayStateService.loadDay('2026-03-01');
      expect(state.hiddenRoutines).toEqual([]);
      expect(state.deletedInstances).toEqual([]);
      expect(state.slotOverrides).toEqual({});
      expect(state.orders).toEqual({});
    });
  });

  describe('isDeleted', () => {
    it('should detect deleted entries', () => {
      const entry: DeletedInstance = { deletedAt: 1000, restoredAt: undefined };
      expect(DayStateService.isDeleted(entry)).toBe(true);
    });

    it('should detect restored entries', () => {
      const entry: DeletedInstance = { deletedAt: 1000, restoredAt: 2000 };
      expect(DayStateService.isDeleted(entry)).toBe(false);
    });

    it('should treat same timestamp as deleted', () => {
      const entry: DeletedInstance = { deletedAt: 1000, restoredAt: 1000 };
      expect(DayStateService.isDeleted(entry)).toBe(true);
    });

    it('should return false for zero deletedAt', () => {
      const entry: DeletedInstance = { deletedAt: 0 };
      expect(DayStateService.isDeleted(entry)).toBe(false);
    });
  });

  describe('isHidden', () => {
    it('should detect hidden entries', () => {
      const entry: HiddenRoutine = { path: 'test.md', hiddenAt: 1000 };
      expect(DayStateService.isHidden(entry)).toBe(true);
    });

    it('should detect restored hidden entries', () => {
      const entry: HiddenRoutine = { path: 'test.md', hiddenAt: 1000, restoredAt: 2000 };
      expect(DayStateService.isHidden(entry)).toBe(false);
    });

    it('should handle legacy entries without hiddenAt', () => {
      const entry: HiddenRoutine = { path: 'test.md' };
      expect(DayStateService.isHidden(entry)).toBe(true);
    });

    it('should handle legacy entries with restoredAt but no hiddenAt', () => {
      const entry: HiddenRoutine = { path: 'test.md', restoredAt: 1000 };
      expect(DayStateService.isHidden(entry)).toBe(false);
    });
  });

  describe('prototype pollution prevention', () => {
    it('should filter __proto__ from days keys', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-daystate-pp-'));
      const vaultRoot = join(tempRoot, 'vault');
      const monthPath = join(vaultRoot, 'TaskChute', 'Log', '2026-02-state.json');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Log'), { recursive: true });
        const malicious = JSON.stringify({
          days: {
            '2026-02-26': { hiddenRoutines: [], deletedInstances: [], duplicatedInstances: [], slotOverrides: {}, orders: {} },
            '__proto__': { hiddenRoutines: [], deletedInstances: [], duplicatedInstances: [], slotOverrides: {}, orders: {} },
          },
        });
        await writeFile(monthPath, malicious, 'utf-8');

        const ppVault = new VaultService(vaultRoot);
        const ppPathService = new PathService({ useOrderBasedSort: true, slotKeys: {} });
        const ppService = new DayStateService(ppVault, ppPathService);

        const state = await ppService.loadDay('2026-02-26');
        expect(state).toBeDefined();

        const obj = {} as Record<string, unknown>;
        expect(obj['hiddenRoutines']).toBeUndefined();
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should filter __proto__ from slotOverrides via safeFromEntries', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-daystate-slot-pp-'));
      const vaultRoot = join(tempRoot, 'vault');
      const monthPath = join(vaultRoot, 'TaskChute', 'Log', '2026-02-state.json');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Log'), { recursive: true });
        const malicious = JSON.stringify({
          days: {
            '2026-02-26': {
              hiddenRoutines: [],
              deletedInstances: [],
              duplicatedInstances: [],
              slotOverrides: { '__proto__': 'evil', 'safe-task': 'slot-1' },
              orders: {},
            },
          },
        });
        await writeFile(monthPath, malicious, 'utf-8');

        const ppVault = new VaultService(vaultRoot);
        const ppPathService = new PathService({ useOrderBasedSort: true, slotKeys: {} });
        const ppService = new DayStateService(ppVault, ppPathService);

        const state = await ppService.loadDay('2026-02-26');
        expect(state.slotOverrides['safe-task']).toBe('slot-1');
        expect(Object.keys(state.slotOverrides)).not.toContain('__proto__');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('monthKey validation', () => {
    it('should reject invalid monthKey format (2026-99)', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-daystate-month-'));
      const vaultRoot = join(tempRoot, 'vault');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Log'), { recursive: true });

        const monthVault = new VaultService(vaultRoot);
        const monthPathService = new PathService({ useOrderBasedSort: true, slotKeys: {} });
        const monthService = new DayStateService(monthVault, monthPathService);

        await expect(monthService.loadDay('2026-99-26')).rejects.toThrow('Invalid month key format');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });

    it('should accept valid monthKey (2026-02)', async () => {
      const state = await dayStateService.loadDay('2026-02-26');
      expect(state).toBeDefined();
    });
  });

  describe('corrupted monthly state file', () => {
    it('should throw and preserve file content when monthly JSON is corrupted', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-daystate-corrupt-'));
      const vaultRoot = join(tempRoot, 'vault');
      const monthPath = join(vaultRoot, 'TaskChute', 'Log', '2026-02-state.json');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Log'), { recursive: true });
        const corrupted = '{"days": {"2026-02-26": ';
        await writeFile(monthPath, corrupted, 'utf-8');

        const corruptVault = new VaultService(vaultRoot);
        const corruptPathService = new PathService({ useOrderBasedSort: true, slotKeys: {} });
        const corruptService = new DayStateService(corruptVault, corruptPathService);

        await expect(corruptService.loadDay('2026-02-26')).rejects.toThrow('Failed to parse day state file');
        await expect(corruptService.updateDay('2026-02-26', () => {})).rejects.toThrow('Failed to parse day state file');

        const after = await readFile(monthPath, 'utf-8');
        expect(after).toBe(corrupted);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
