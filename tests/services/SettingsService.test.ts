import { SettingsService } from '../../src/services/SettingsService';

function createMockVault(fileContent: string | null) {
  return {
    fileExists: jest.fn().mockReturnValue(fileContent !== null),
    readFile: jest.fn().mockResolvedValue(fileContent ?? ''),
  };
}

describe('SettingsService', () => {
  it('should load valid settings merged with defaults', async () => {
    const vault = createMockVault(JSON.stringify({
      useOrderBasedSort: false,
      slotKeys: { 'slot-1': '08:00-12:00' },
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.useOrderBasedSort).toBe(false);
    expect(settings.slotKeys).toEqual({ 'slot-1': '08:00-12:00' });
  });

  it('should fallback to defaults on corrupted JSON', async () => {
    const vault = createMockVault('{invalid json');
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.useOrderBasedSort).toBe(true);
    expect(settings.slotKeys).toEqual({});
  });

  it('should ignore fields with incorrect types (specifiedFolder as number)', async () => {
    const vault = createMockVault(JSON.stringify({
      specifiedFolder: 12345,
      useOrderBasedSort: 'not-a-boolean',
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.specifiedFolder).toBeUndefined();
    expect(settings.useOrderBasedSort).toBe(true); // default
  });

  it('should ignore invalid locationMode value', async () => {
    const vault = createMockVault(JSON.stringify({
      locationMode: 'invalidMode',
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.locationMode).toBeUndefined();
  });

  it('should accept valid locationMode values', async () => {
    for (const mode of ['vaultRoot', 'specifiedFolder']) {
      const vault = createMockVault(JSON.stringify({ locationMode: mode }));
      const service = new SettingsService(vault as never);
      const settings = await service.loadSettings();
      expect(settings.locationMode).toBe(mode);
    }
  });

  it('should prevent __proto__ pollution in settings', async () => {
    const malicious = '{"__proto__": {"polluted": true}, "useOrderBasedSort": false}';
    const vault = createMockVault(malicious);
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    const obj = {} as Record<string, unknown>;
    expect(obj['polluted']).toBeUndefined();
    expect(settings.useOrderBasedSort).toBe(false);
  });

  it('should filter dangerous keys from slotKeys', async () => {
    const vault = createMockVault(JSON.stringify({
      slotKeys: {
        'safe-slot': '08:00-12:00',
        '__proto__': 'evil',
        'constructor': 'evil',
      },
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.slotKeys['safe-slot']).toBe('08:00-12:00');
    expect(Object.keys(settings.slotKeys)).toEqual(['safe-slot']);
  });

  it('should validate defaultReminderMinutes range', async () => {
    const vault = createMockVault(JSON.stringify({
      defaultReminderMinutes: 9999,
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.defaultReminderMinutes).toBeUndefined();
  });

  it('should accept valid defaultReminderMinutes', async () => {
    const vault = createMockVault(JSON.stringify({
      defaultReminderMinutes: 15,
    }));
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.defaultReminderMinutes).toBe(15);
  });

  it('should return defaults when file does not exist', async () => {
    const vault = createMockVault(null);
    const service = new SettingsService(vault as never);
    const settings = await service.loadSettings();

    expect(settings.useOrderBasedSort).toBe(true);
    expect(settings.slotKeys).toEqual({});
  });
});
