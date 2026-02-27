import { SectionConfigService } from '../../src/services/SectionConfigService';

describe('SectionConfigService', () => {
  describe('default boundaries', () => {
    const svc = new SectionConfigService();

    it('should have 4 default slot keys', () => {
      const keys = svc.getSlotKeys();
      expect(keys).toHaveLength(4);
      expect(keys[0]).toBe('0:00-8:00');
      expect(keys[1]).toBe('8:00-12:00');
      expect(keys[2]).toBe('12:00-16:00');
      expect(keys[3]).toBe('16:00-0:00');
    });

    it('should calculate slot key from time', () => {
      expect(svc.calculateSlotKeyFromTime('07:30')).toBe('0:00-8:00');
      expect(svc.calculateSlotKeyFromTime('09:00')).toBe('8:00-12:00');
      expect(svc.calculateSlotKeyFromTime('14:00')).toBe('12:00-16:00');
      expect(svc.calculateSlotKeyFromTime('18:00')).toBe('16:00-0:00');
    });

    it('should calculate slot key from ISO datetime time strings', () => {
      expect(svc.calculateSlotKeyFromTime('2026-03-04T09:30:00+09:00')).toBe('8:00-12:00');
      expect(svc.calculateSlotKeyFromTime('2026-03-04T18:45:00Z')).toBe('16:00-0:00');
    });

    it('should return undefined for invalid time', () => {
      expect(svc.calculateSlotKeyFromTime(undefined)).toBeUndefined();
      expect(svc.calculateSlotKeyFromTime('')).toBeUndefined();
      expect(svc.calculateSlotKeyFromTime('invalid')).toBeUndefined();
    });
  });

  describe('custom boundaries', () => {
    it('should use custom sections', () => {
      const svc = new SectionConfigService([
        { hour: 0, minute: 0 },
        { hour: 6, minute: 0 },
        { hour: 12, minute: 0 },
        { hour: 18, minute: 0 },
      ]);

      const keys = svc.getSlotKeys();
      expect(keys).toHaveLength(4);
      expect(keys[0]).toBe('0:00-6:00');
      expect(keys[1]).toBe('6:00-12:00');
    });
  });

  describe('sanitizeBoundaries', () => {
    it('should reject invalid input', () => {
      expect(SectionConfigService.sanitizeBoundaries(null)).toBeUndefined();
      expect(SectionConfigService.sanitizeBoundaries([])).toBeUndefined();
      expect(SectionConfigService.sanitizeBoundaries([{ hour: 0, minute: 0 }])).toBeUndefined(); // Less than 2
    });

    it('should reject if first is not 0:00', () => {
      expect(SectionConfigService.sanitizeBoundaries([
        { hour: 1, minute: 0 },
        { hour: 12, minute: 0 },
      ])).toBeUndefined();
    });

    it('should reject non-ascending order', () => {
      expect(SectionConfigService.sanitizeBoundaries([
        { hour: 0, minute: 0 },
        { hour: 12, minute: 0 },
        { hour: 8, minute: 0 },
      ])).toBeUndefined();
    });
  });

  describe('isValidSlotKey', () => {
    const svc = new SectionConfigService();

    it('should validate "none"', () => {
      expect(svc.isValidSlotKey('none')).toBe(true);
    });

    it('should validate default slot keys', () => {
      expect(svc.isValidSlotKey('8:00-12:00')).toBe(true);
      expect(svc.isValidSlotKey('invalid')).toBe(false);
    });
  });
});
