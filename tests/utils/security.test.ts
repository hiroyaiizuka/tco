import {
  safeFromEntries,
  pickAllowedKeys,
  isSafeKey,
  isValidTaskId,
  isValidMonthKey,
  isValidDayKey,
  isSafeString,
  DANGEROUS_KEYS,
} from '../../src/utils/security';

describe('security utilities', () => {
  describe('safeFromEntries', () => {
    it('should create object from normal entries', () => {
      const result = safeFromEntries([['a', 1], ['b', 2]]);
      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
    });

    it('should filter __proto__ key', () => {
      const result = safeFromEntries([['safe', 1], ['__proto__', 2]]);
      expect(result.safe).toBe(1);
      expect('__proto__' in result).toBe(false);
    });

    it('should filter constructor key', () => {
      const result = safeFromEntries([['safe', 1], ['constructor', 2]]);
      expect(result.safe).toBe(1);
      expect('constructor' in result).toBe(false);
    });

    it('should filter prototype key', () => {
      const result = safeFromEntries([['safe', 1], ['prototype', 2]]);
      expect(result.safe).toBe(1);
      expect('prototype' in result).toBe(false);
    });

    it('should return prototype-free object', () => {
      const result = safeFromEntries([['key', 'value']]);
      expect(Object.getPrototypeOf(result)).toBeNull();
    });
  });

  describe('pickAllowedKeys', () => {
    it('should extract only allowed keys', () => {
      const source = { a: 1, b: 2, c: 3 };
      const allowed = new Set(['a', 'c']);
      const result = pickAllowedKeys(source, allowed);
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should exclude unknown keys', () => {
      const source = { a: 1, __proto__: 'bad', evil: true };
      const allowed = new Set(['a']);
      const result = pickAllowedKeys(source, allowed);
      expect(result).toEqual({ a: 1 });
      expect('evil' in result).toBe(false);
    });

    it('should return empty object for no matching keys', () => {
      const source = { x: 1 };
      const allowed = new Set(['a', 'b']);
      const result = pickAllowedKeys(source, allowed);
      expect(result).toEqual({});
    });
  });

  describe('isSafeKey', () => {
    it('should reject __proto__', () => {
      expect(isSafeKey('__proto__')).toBe(false);
    });

    it('should reject constructor', () => {
      expect(isSafeKey('constructor')).toBe(false);
    });

    it('should reject prototype', () => {
      expect(isSafeKey('prototype')).toBe(false);
    });

    it('should accept normal keys', () => {
      expect(isSafeKey('taskId')).toBe(true);
      expect(isSafeKey('slot-1')).toBe(true);
    });
  });

  describe('isValidTaskId', () => {
    it('should accept valid UUID taskId', () => {
      expect(isValidTaskId('tc-task-00000000-0000-0000-0000-000000000001')).toBe(true);
      expect(isValidTaskId('tc-task-a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    });

    it('should accept legacy format taskId', () => {
      expect(isValidTaskId('tc-task-001')).toBe(true);
      expect(isValidTaskId('tc-task-daily-001')).toBe(true);
    });

    it('should reject __proto__', () => {
      expect(isValidTaskId('__proto__')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidTaskId('')).toBe(false);
    });

    it('should reject missing prefix', () => {
      expect(isValidTaskId('00000000-0000-0000-0000-000000000001')).toBe(false);
    });

    it('should reject uppercase letters', () => {
      expect(isValidTaskId('tc-task-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(false);
    });

    it('should reject missing suffix after prefix', () => {
      expect(isValidTaskId('tc-task-')).toBe(false);
    });
  });

  describe('isValidMonthKey', () => {
    it('should accept valid month keys', () => {
      expect(isValidMonthKey('2026-01')).toBe(true);
      expect(isValidMonthKey('2026-02')).toBe(true);
      expect(isValidMonthKey('2026-12')).toBe(true);
    });

    it('should reject month 00', () => {
      expect(isValidMonthKey('2026-00')).toBe(false);
    });

    it('should reject month 13', () => {
      expect(isValidMonthKey('2026-13')).toBe(false);
    });

    it('should reject month 99', () => {
      expect(isValidMonthKey('2026-99')).toBe(false);
    });

    it('should reject __proto__', () => {
      expect(isValidMonthKey('__proto__')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(isValidMonthKey('2026-2')).toBe(false);
      expect(isValidMonthKey('202602')).toBe(false);
    });
  });

  describe('isValidDayKey', () => {
    it('should accept valid dates', () => {
      expect(isValidDayKey('2026-02-28')).toBe(true);
      expect(isValidDayKey('2026-01-01')).toBe(true);
      expect(isValidDayKey('2024-02-29')).toBe(true); // leap year
    });

    it('should reject non-existent dates', () => {
      expect(isValidDayKey('2026-02-30')).toBe(false);
      expect(isValidDayKey('2026-02-29')).toBe(false); // not a leap year
      expect(isValidDayKey('2026-04-31')).toBe(false);
    });

    it('should reject __proto__', () => {
      expect(isValidDayKey('__proto__')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(isValidDayKey('2026-2-28')).toBe(false);
      expect(isValidDayKey('20260228')).toBe(false);
    });
  });

  describe('isSafeString', () => {
    it('should accept normal strings', () => {
      expect(isSafeString('Hello World')).toBe(true);
      expect(isSafeString('日本語タスク')).toBe(true);
    });

    it('should reject null byte', () => {
      expect(isSafeString('hello\x00world')).toBe(false);
    });

    it('should reject control characters', () => {
      expect(isSafeString('hello\x01world')).toBe(false);
      expect(isSafeString('hello\x1fworld')).toBe(false);
      expect(isSafeString('hello\x7fworld')).toBe(false);
    });

    it('should reject tab and newline', () => {
      expect(isSafeString('hello\tworld')).toBe(false);
      expect(isSafeString('hello\nworld')).toBe(false);
    });
  });

  describe('DANGEROUS_KEYS', () => {
    it('should contain exactly __proto__, constructor, prototype', () => {
      expect(DANGEROUS_KEYS.size).toBe(3);
      expect(DANGEROUS_KEYS.has('__proto__')).toBe(true);
      expect(DANGEROUS_KEYS.has('constructor')).toBe(true);
      expect(DANGEROUS_KEYS.has('prototype')).toBe(true);
    });
  });
});
