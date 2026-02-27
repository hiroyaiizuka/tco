import { FrontmatterService, normalizeReminderTime } from '../../src/services/FrontmatterService';
import { VaultService } from '../../src/services/VaultService';
import { resolve } from 'path';

const FIXTURE_VAULT = resolve(__dirname, '../fixtures/vault');

describe('FrontmatterService', () => {
  let vault: VaultService;
  let fms: FrontmatterService;

  beforeEach(() => {
    vault = new VaultService(FIXTURE_VAULT);
    fms = new FrontmatterService(vault);
  });

  describe('parseFrontmatter', () => {
    it('should parse a markdown file with frontmatter', async () => {
      const result = await fms.parseFrontmatter('TaskChute/Task/daily-task.md');
      expect(result.data.target_date).toBe('2026-02-26');
      expect(result.data.taskId).toBe('tc-task-daily-001');
      expect(result.data.scheduled_time).toBe('09:00');
    });

    it('should parse routine task frontmatter', async () => {
      const result = await fms.parseFrontmatter('TaskChute/Task/routine-task.md');
      expect(result.data.isRoutine).toBe(true);
      expect(result.data.routine_type).toBe('daily');
      expect(result.data.routine_interval).toBe(1);
    });
  });

  describe('parseString', () => {
    it('should normalize sexagesimal values', () => {
      // 09:55 in YAML is parsed as 595 (9*60+55) by js-yaml
      const raw = `---
scheduled_time: 595
reminder_time: 535
---
# Test`;

      const result = fms.parseString(raw);
      expect(result.data.scheduled_time).toBe('09:55');
      expect(result.data.reminder_time).toBe('08:55');
    });

    it('should keep valid time strings as-is', () => {
      const raw = `---
scheduled_time: "14:30"
---
# Test`;

      const result = fms.parseString(raw);
      expect(result.data.scheduled_time).toBe('14:30');
    });
  });

  describe('normalizeReminderTime', () => {
    it('should normalize HH:mm string', () => {
      expect(normalizeReminderTime('09:55')).toBe('09:55');
      expect(normalizeReminderTime('9:55')).toBe('09:55');
      expect(normalizeReminderTime('14:30')).toBe('14:30');
    });

    it('should convert number (sexagesimal) to HH:mm', () => {
      expect(normalizeReminderTime(595)).toBe('09:55');
      expect(normalizeReminderTime(0)).toBe('00:00');
      expect(normalizeReminderTime(870)).toBe('14:30');
    });

    it('should return undefined for invalid values', () => {
      expect(normalizeReminderTime('invalid')).toBeUndefined();
      expect(normalizeReminderTime(1440)).toBeUndefined();
      expect(normalizeReminderTime(-1)).toBeUndefined();
      expect(normalizeReminderTime(null)).toBeUndefined();
      expect(normalizeReminderTime('25:00')).toBeUndefined();
    });
  });
});
