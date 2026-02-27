import { RoutineService } from '../../src/services/RoutineService';
import type { RoutineRule } from '../../src/types';

describe('RoutineService', () => {
  describe('parseFrontmatter', () => {
    it('should return null for non-routine tasks', () => {
      expect(RoutineService.parseFrontmatter({})).toBeNull();
      expect(RoutineService.parseFrontmatter({ isRoutine: false })).toBeNull();
      expect(RoutineService.parseFrontmatter(undefined)).toBeNull();
    });

    it('should parse daily routine', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'daily',
        routine_interval: 1,
        routine_start: '2026-01-01',
      });
      expect(rule).not.toBeNull();
      expect(rule!.type).toBe('daily');
      expect(rule!.interval).toBe(1);
      expect(rule!.start).toBe('2026-01-01');
      expect(rule!.enabled).toBe(true);
    });

    it('should parse weekly routine with weekday', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'weekly',
        routine_weekday: 1,
      });
      expect(rule!.type).toBe('weekly');
      expect(rule!.weekday).toBe(1);
    });

    it('should parse weekly routine from legacy weekdays array', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'weekly',
        weekdays: [1, 3],
      });
      expect(rule!.type).toBe('weekly');
      expect(rule!.weekdaySet).toEqual([1, 3]);
    });

    it('should parse monthly routine with week and weekday', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'monthly',
        routine_week: 2,
        routine_weekday: 4,
      });
      expect(rule!.type).toBe('monthly');
      expect(rule!.week).toBe(2);
      expect(rule!.monthWeekday).toBe(4);
    });

    it('should parse monthly_date routine', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'monthly_date',
        routine_monthday: 15,
      });
      expect(rule!.type).toBe('monthly_date');
      expect(rule!.monthDay).toBe(15);
    });

    it('should handle disabled routines', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'daily',
        routine_enabled: false,
      });
      expect(rule!.enabled).toBe(false);
    });

    it('should ignore non-existent routine_start and routine_end dates', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'daily',
        routine_start: '2026-02-30',
        routine_end: '2026-13-01',
      });

      expect(rule!.start).toBeUndefined();
      expect(rule!.end).toBeUndefined();
    });

    it('should parse YAML Date values for routine_start and routine_end', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'daily',
        routine_start: new Date(Date.UTC(2026, 2, 1)),
        routine_end: new Date(Date.UTC(2026, 2, 31)),
      });

      expect(rule).not.toBeNull();
      expect(rule!.start).toBe('2026-03-01');
      expect(rule!.end).toBe('2026-03-31');
    });
  });

  describe('isDue', () => {
    describe('daily', () => {
      it('should be due every day with interval 1', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: true, start: '2026-01-01',
        };
        expect(RoutineService.isDue('2026-01-01', rule)).toBe(true);
        expect(RoutineService.isDue('2026-01-02', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-26', rule)).toBe(true);
      });

      it('should respect interval', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 3, enabled: true, start: '2026-01-01',
        };
        expect(RoutineService.isDue('2026-01-01', rule)).toBe(true);
        expect(RoutineService.isDue('2026-01-02', rule)).toBe(false);
        expect(RoutineService.isDue('2026-01-03', rule)).toBe(false);
        expect(RoutineService.isDue('2026-01-04', rule)).toBe(true);
      });

      it('should not be due before start date', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: true, start: '2026-02-01',
        };
        expect(RoutineService.isDue('2026-01-31', rule)).toBe(false);
        expect(RoutineService.isDue('2026-02-01', rule)).toBe(true);
      });

      it('should not be due after end date', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: true, start: '2026-01-01', end: '2026-01-31',
        };
        expect(RoutineService.isDue('2026-01-31', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-01', rule)).toBe(false);
      });
    });

    describe('weekly', () => {
      it('should be due on the correct weekday', () => {
        // 2026-02-26 is a Thursday (day 4)
        const rule: RoutineRule = {
          type: 'weekly', interval: 1, enabled: true, weekday: 4,
        };
        expect(RoutineService.isDue('2026-02-26', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-25', rule)).toBe(false); // Wednesday
      });

      it('should handle weekdaySet', () => {
        const rule: RoutineRule = {
          type: 'weekly', interval: 1, enabled: true, weekdaySet: [1, 3, 5],
        };
        // 2026-02-23 is Monday (1), 2026-02-25 is Wednesday (3), 2026-02-27 is Friday (5)
        expect(RoutineService.isDue('2026-02-23', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-24', rule)).toBe(false); // Tuesday
        expect(RoutineService.isDue('2026-02-25', rule)).toBe(true);
      });
    });

    describe('monthly', () => {
      it('should be due on the correct week and weekday', () => {
        // 2026-02-12 is Thursday, 2nd week
        const rule: RoutineRule = {
          type: 'monthly', interval: 1, enabled: true, week: 2, monthWeekday: 4,
        };
        expect(RoutineService.isDue('2026-02-12', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-05', rule)).toBe(false); // 1st Thursday
      });
    });

    describe('monthly_date', () => {
      it('should be due on the correct day of month', () => {
        const rule: RoutineRule = {
          type: 'monthly_date', interval: 1, enabled: true, monthDay: 15,
        };
        expect(RoutineService.isDue('2026-02-15', rule)).toBe(true);
        expect(RoutineService.isDue('2026-02-14', rule)).toBe(false);
      });

      it('should handle "last" day of month', () => {
        const rule: RoutineRule = {
          type: 'monthly_date', interval: 1, enabled: true, monthDay: 'last',
        };
        expect(RoutineService.isDue('2026-02-28', rule)).toBe(true); // Feb has 28 days in 2026
        expect(RoutineService.isDue('2026-02-27', rule)).toBe(false);
      });
    });

    describe('disabled', () => {
      it('should never be due when disabled', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: false, start: '2026-01-01',
        };
        expect(RoutineService.isDue('2026-01-01', rule)).toBe(false);
      });
    });

    describe('moved target date', () => {
      it('should force visibility on moved date', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: true, start: '2026-01-01',
        };
        // Even though daily is always due, movedTargetDate forces visibility
        expect(RoutineService.isDue('2026-03-01', rule, '2026-03-01')).toBe(true);
      });

      it('should suppress before moved date', () => {
        const rule: RoutineRule = {
          type: 'weekly', interval: 1, enabled: true, weekday: 1, // Monday
        };
        // 2026-02-23 is Monday, should be due normally
        expect(RoutineService.isDue('2026-02-23', rule)).toBe(true);
        // But if moved to 2026-03-01, suppress 2026-02-23
        expect(RoutineService.isDue('2026-02-23', rule, '2026-03-01')).toBe(false);
      });

      it('should reject non-existent moved target date values', () => {
        const rule: RoutineRule = {
          type: 'daily', interval: 1, enabled: true, start: '2026-01-01',
        };
        expect(RoutineService.isDue('2026-03-02', rule, '2026-02-30')).toBe(false);
        expect(RoutineService.isDue('2026-12-01', rule, '2026-13-01')).toBe(false);
      });
    });

    it('should reject non-existent date values', () => {
      const rule: RoutineRule = {
        type: 'daily', interval: 1, enabled: true, start: '2026-01-01',
      };
      expect(RoutineService.isDue('2026-02-30', rule)).toBe(false);
      expect(RoutineService.isDue('2026-13-01', rule)).toBe(false);
    });

    it('should respect start/end bounds provided as YAML Date values', () => {
      const rule = RoutineService.parseFrontmatter({
        isRoutine: true,
        routine_type: 'daily',
        routine_interval: 1,
        routine_start: new Date(Date.UTC(2026, 2, 10)),
        routine_end: new Date(Date.UTC(2026, 2, 12)),
      });
      expect(rule).not.toBeNull();

      expect(RoutineService.isDue('2026-03-09', rule)).toBe(false);
      expect(RoutineService.isDue('2026-03-10', rule)).toBe(true);
      expect(RoutineService.isDue('2026-03-12', rule)).toBe(true);
      expect(RoutineService.isDue('2026-03-13', rule)).toBe(false);
    });
  });
});
