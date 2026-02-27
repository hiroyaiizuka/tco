import type { RoutineRule, RoutineWeek, RoutineMonthday } from '../types/index.js';

/**
 * RoutineService - Ported from TaskChute Plus plugin.
 * Pure logic for routine parsing and due-date evaluation.
 */
export class RoutineService {
  /** Parse frontmatter into a normalized RoutineRule */
  static parseFrontmatter(fm: Record<string, unknown> | undefined): RoutineRule | null {
    if (!fm || typeof fm !== 'object') return null;
    const isRoutine = fm.isRoutine === true;
    if (!isRoutine) return null;

    const typeRaw = fm.routine_type || fm.routineType || 'daily';
    const type = (typeRaw === 'daily' || typeRaw === 'weekly' || typeRaw === 'monthly' || typeRaw === 'monthly_date')
      ? typeRaw
      : 'weekly';

    const enabled = fm.routine_enabled === false ? false : true;
    const interval = this.toPositiveInt(fm.routine_interval, 1) ?? 1;

    const rule: RoutineRule = { type, interval, start: this.toDateStrOrUndef(fm.routine_start), end: this.toDateStrOrUndef(fm.routine_end), enabled };

    if (type === 'weekly') {
      const weekday = this.toWeekday(fm.routine_weekday ?? fm.weekday);
      const rawWeekdays = fm.routine_weekdays ?? fm.weekdays;
      const weekdays: number[] | undefined = Array.isArray(rawWeekdays)
        ? rawWeekdays.map(c => this.toWeekday(c)).filter((v): v is number => v !== undefined)
        : undefined;
      const legacyType = fm.routine_type;
      const legacySet = legacyType === 'weekdays' ? [1, 2, 3, 4, 5]
        : legacyType === 'weekends' ? [0, 6]
        : undefined;

      if (weekday !== undefined) rule.weekday = weekday;
      if (weekdays && weekdays.length > 0) rule.weekdaySet = weekdays;
      if (legacySet) rule.weekdaySet = legacySet;
    }

    if (type === 'monthly') {
      let week: number | 'last' | undefined;
      if (fm.routine_week !== undefined) {
        week = fm.routine_week === 'last' ? 'last' : this.toPositiveInt(fm.routine_week, undefined);
      } else if (fm.monthly_week !== undefined) {
        if (fm.monthly_week === 'last') {
          week = 'last';
        } else if (fm.monthly_week !== '') {
          const raw = Number(fm.monthly_week);
          if (Number.isFinite(raw)) {
            const zeroBased = Math.floor(raw);
            if (zeroBased >= 0 && zeroBased <= 4) {
              week = (zeroBased + 1) as RoutineWeek;
            }
          }
        }
      }
      const weekday = this.toWeekday(fm.routine_weekday ?? fm.monthly_weekday);
      if (week !== undefined) rule.week = week;
      if (weekday !== undefined) rule.monthWeekday = weekday;

      const weekSet = this.toWeekSet((fm as Record<string, unknown>).routine_weeks ?? (fm as Record<string, unknown>).monthly_weeks);
      if (weekSet.length > 0) rule.weekSet = weekSet;
      const weekdaySet = this.toWeekdaySet((fm as Record<string, unknown>).routine_weekdays ?? (fm as Record<string, unknown>).monthly_weekdays);
      if (weekdaySet.length > 0) rule.monthWeekdaySet = weekdaySet;
    }

    if (type === 'monthly_date') {
      const monthDay = this.toMonthday(fm.routine_monthday);
      const monthDaySet = this.toMonthdaySet((fm as Record<string, unknown>).routine_monthdays);
      if (monthDay !== undefined) rule.monthDay = monthDay;
      if (monthDaySet.length > 0) rule.monthDaySet = monthDaySet;
    }

    return rule;
  }

  /** Determine if a routine is due on the given date (YYYY-MM-DD) */
  static isDue(dateStr: string, rule: RoutineRule | null, movedTargetDate?: string): boolean {
    if (!rule) return false;
    if (!rule.enabled) return false;

    const date = this.parseDate(dateStr);
    if (!date) return false;

    if (movedTargetDate) {
      const moved = this.parseDate(movedTargetDate);
      if (!moved) return false;
      const diff = this.compareDate(date, moved);
      if (diff < 0) return false;
      if (diff === 0) return true;
    }

    if (rule.start) {
      const s = this.parseDate(rule.start);
      if (s && this.compareDate(date, s) < 0) return false;
    }
    if (rule.end) {
      const e = this.parseDate(rule.end);
      if (e && this.compareDate(date, e) > 0) return false;
    }

    switch (rule.type) {
      case 'daily': return this.isDailyDue(date, rule);
      case 'weekly': return this.isWeeklyDue(date, rule);
      case 'monthly': return this.isMonthlyDue(date, rule);
      case 'monthly_date': return this.isMonthlyDateDue(date, rule);
      default: return false;
    }
  }

  // --- Internal calculators ---

  private static isDailyDue(date: Date, rule: RoutineRule): boolean {
    const interval = Math.max(1, rule.interval || 1);
    if (!rule.start) return interval === 1;
    const s = this.parseDate(rule.start)!;
    const diff = this.daysDiff(s, date);
    return diff >= 0 && diff % interval === 0;
  }

  private static isWeeklyDue(date: Date, rule: RoutineRule): boolean {
    const interval = Math.max(1, rule.interval || 1);
    const start = rule.start ? this.parseDate(rule.start)! : undefined;
    const anchor = start ? this.weekStart(start) : this.weekStart(new Date(1970, 0, 4));
    const currentWeekStart = this.weekStart(date);
    const wdiff = Math.floor((currentWeekStart.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (wdiff < 0 || wdiff % interval !== 0) return false;

    const { weekdaySet } = rule;
    if (weekdaySet && Array.isArray(weekdaySet) && weekdaySet.length > 0) {
      return weekdaySet.includes(date.getDay());
    }
    const { weekday } = rule;
    if (weekday === undefined) return false;
    return date.getDay() === weekday;
  }

  private static isMonthlyDue(date: Date, rule: RoutineRule): boolean {
    const weekCandidates = (rule.weekSet && rule.weekSet.length > 0)
      ? rule.weekSet
      : rule.week !== undefined ? [rule.week] : [];
    const weekdayCandidates = (rule.monthWeekdaySet && rule.monthWeekdaySet.length > 0)
      ? rule.monthWeekdaySet
      : rule.monthWeekday !== undefined ? [rule.monthWeekday] : [];
    if (weekCandidates.length === 0 || weekdayCandidates.length === 0) return false;
    const interval = Math.max(1, rule.interval || 1);

    if (rule.start) {
      const s = this.parseDate(rule.start)!;
      const mdiff = (date.getFullYear() - s.getFullYear()) * 12 + (date.getMonth() - s.getMonth());
      if (mdiff < 0 || mdiff % interval !== 0) return false;
    }

    const nextWeek = new Date(date);
    nextWeek.setDate(date.getDate() + 7);
    const isLast = nextWeek.getMonth() !== date.getMonth();
    const occurrence = Math.floor((date.getDate() - 1) / 7) + 1;

    const matchesWeek = weekCandidates.some(c => c === 'last' ? isLast : occurrence === c);
    const matchesWeekday = weekdayCandidates.includes(date.getDay());
    return matchesWeek && matchesWeekday;
  }

  private static isMonthlyDateDue(date: Date, rule: RoutineRule): boolean {
    const monthDayCandidates = (rule.monthDaySet && rule.monthDaySet.length > 0)
      ? rule.monthDaySet
      : rule.monthDay !== undefined ? [rule.monthDay] : [];
    if (monthDayCandidates.length === 0) return false;
    const interval = Math.max(1, rule.interval || 1);

    if (rule.start) {
      const s = this.parseDate(rule.start)!;
      const mdiff = (date.getFullYear() - s.getFullYear()) * 12 + (date.getMonth() - s.getMonth());
      if (mdiff < 0 || mdiff % interval !== 0) return false;
    }

    const day = date.getDate();
    const lastDay = this.getLastDayOfMonth(date);
    return monthDayCandidates.some(c => c === 'last' ? day === lastDay : day === c);
  }

  // --- Helpers ---

  private static toPositiveInt(value: unknown, fallback?: number): number | undefined {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    return fallback;
  }

  private static toWeekday(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n : undefined;
  }

  private static toWeekdaySet(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<number>();
    return value
      .map(c => this.toWeekday(c))
      .filter((w): w is number => typeof w === 'number')
      .filter(w => { if (seen.has(w)) return false; seen.add(w); return true; })
      .sort((a, b) => a - b);
  }

  private static toWeekSet(value: unknown): Array<number | 'last'> {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: Array<number | 'last'> = [];
    for (const candidate of value) {
      if (candidate === 'last') {
        if (!seen.has('last')) { seen.add('last'); result.push('last'); }
        continue;
      }
      const parsed = this.toPositiveInt(candidate, undefined);
      if (parsed && parsed >= 1 && parsed <= 5) {
        const key = String(parsed);
        if (!seen.has(key)) { seen.add(key); result.push(parsed as RoutineWeek); }
      }
    }
    return result;
  }

  private static toMonthday(value: unknown): RoutineMonthday | undefined {
    if (value === 'last') return 'last';
    const parsed = this.toPositiveInt(value, undefined);
    if (!parsed || parsed < 1 || parsed > 31) return undefined;
    return parsed as RoutineMonthday;
  }

  private static toMonthdaySet(value: unknown): RoutineMonthday[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: RoutineMonthday[] = [];
    for (const candidate of value) {
      const normalized = this.toMonthday(candidate);
      if (normalized === undefined) continue;
      const key = String(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
    return result.sort((a, b) => {
      if (a === 'last') return 1;
      if (b === 'last') return -1;
      return (a as number) - (b as number);
    });
  }

  private static toDateStrOrUndef(v: unknown): string | undefined {
    if (typeof v === 'string') {
      return this.parseDate(v) ? v : undefined;
    }
    if (v instanceof Date && Number.isFinite(v.getTime())) {
      const y = v.getUTCFullYear();
      const m = String(v.getUTCMonth() + 1).padStart(2, '0');
      const d = String(v.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return undefined;
  }

  private static parseDate(dateStr: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year
      || parsed.getMonth() + 1 !== month
      || parsed.getDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  private static compareDate(a: Date, b: Date): number {
    const aKey = a.getFullYear() * 10000 + (a.getMonth() + 1) * 100 + a.getDate();
    const bKey = b.getFullYear() * 10000 + (b.getMonth() + 1) * 100 + b.getDate();
    return aKey === bKey ? 0 : (aKey < bKey ? -1 : 1);
  }

  private static daysDiff(a: Date, b: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((utcB - utcA) / msPerDay);
  }

  private static weekStart(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private static getLastDayOfMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
}
