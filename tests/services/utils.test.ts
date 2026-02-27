import { formatDate, parseDate, resolveDate, getMonthKey, today, isValidTime } from '../../src/utils/date';
import { generateTaskId, generateInstanceId } from '../../src/utils/id';

describe('date utils', () => {
  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const d = new Date(2026, 1, 26); // Feb 26, 2026
      expect(formatDate(d)).toBe('2026-02-26');
    });

    it('should pad single-digit months and days', () => {
      const d = new Date(2026, 0, 5); // Jan 5, 2026
      expect(formatDate(d)).toBe('2026-01-05');
    });
  });

  describe('parseDate', () => {
    it('should parse YYYY-MM-DD', () => {
      const d = parseDate('2026-02-26');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(1); // 0-indexed
      expect(d!.getDate()).toBe(26);
    });

    it('should return null for invalid format', () => {
      expect(parseDate('invalid')).toBeNull();
      expect(parseDate('2026/02/26')).toBeNull();
    });
  });

  describe('resolveDate', () => {
    it('should return today for undefined', () => {
      expect(resolveDate()).toBe(today());
    });

    it('should return today for "today"', () => {
      expect(resolveDate('today')).toBe(today());
    });

    it('should handle "tomorrow"', () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      expect(resolveDate('tomorrow')).toBe(formatDate(d));
    });

    it('should handle "yesterday"', () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      expect(resolveDate('yesterday')).toBe(formatDate(d));
    });

    it('should pass through YYYY-MM-DD', () => {
      expect(resolveDate('2026-02-26')).toBe('2026-02-26');
    });

    it('should throw for invalid format', () => {
      expect(() => resolveDate('invalid')).toThrow('Invalid date format');
    });

    it('should throw for non-existent calendar date', () => {
      expect(() => resolveDate('2026-02-30')).toThrow('Invalid date format');
      expect(() => resolveDate('2026-13-01')).toThrow('Invalid date format');
    });
  });

  describe('getMonthKey', () => {
    it('should extract YYYY-MM', () => {
      expect(getMonthKey('2026-02-26')).toBe('2026-02');
    });
  });

  describe('isValidTime', () => {
    it('should accept valid times', () => {
      expect(isValidTime('0:00')).toBe(true);
      expect(isValidTime('9:00')).toBe(true);
      expect(isValidTime('09:00')).toBe(true);
      expect(isValidTime('23:59')).toBe(true);
      expect(isValidTime('12:30')).toBe(true);
    });

    it('should reject hours out of range', () => {
      expect(isValidTime('24:00')).toBe(false);
      expect(isValidTime('25:00')).toBe(false);
      expect(isValidTime('99:00')).toBe(false);
    });

    it('should reject minutes out of range', () => {
      expect(isValidTime('12:60')).toBe(false);
      expect(isValidTime('12:99')).toBe(false);
    });

    it('should reject invalid formats', () => {
      expect(isValidTime('abc')).toBe(false);
      expect(isValidTime('')).toBe(false);
      expect(isValidTime('1234')).toBe(false);
    });
  });
});

describe('id utils', () => {
  describe('generateTaskId', () => {
    it('should generate tc-task-<uuid> format', () => {
      const id = generateTaskId();
      expect(id).toMatch(/^tc-task-[0-9a-f-]{36}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateTaskId();
      const id2 = generateTaskId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateInstanceId', () => {
    it('should combine taskId and dateKey', () => {
      const id = generateInstanceId('tc-task-123', '2026-02-26');
      expect(id).toBe('tc-task-123::2026-02-26');
    });
  });
});
