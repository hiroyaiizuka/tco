import type { SectionBoundary } from '../types/index.js';

/**
 * SectionConfigService - Ported from TaskChute Plus plugin.
 * Calculates slot keys from time boundaries.
 */
export class SectionConfigService {
  static readonly DEFAULT_BOUNDARIES: SectionBoundary[] = [
    { hour: 0, minute: 0 },
    { hour: 8, minute: 0 },
    { hour: 12, minute: 0 },
    { hour: 16, minute: 0 },
  ];

  private boundaries: SectionBoundary[];
  private slotKeysCache: string[];
  private boundaryMinutesCache: number[];

  constructor(customSections?: SectionBoundary[]) {
    const sanitized = SectionConfigService.sanitizeBoundaries(customSections);
    this.boundaries = sanitized ?? SectionConfigService.DEFAULT_BOUNDARIES;
    this.boundaryMinutesCache = this.boundaries.map(b => b.hour * 60 + b.minute);
    this.slotKeysCache = this.buildSlotKeys();
  }

  static sanitizeBoundaries(input: unknown): SectionBoundary[] | undefined {
    if (!Array.isArray(input)) return undefined;
    if (input.length < 2) return undefined;

    const boundaries: SectionBoundary[] = [];
    for (const item of input) {
      if (item == null || typeof item !== 'object') return undefined;
      const h = (item as Record<string, unknown>).hour;
      const m = (item as Record<string, unknown>).minute;
      if (typeof h !== 'number' || typeof m !== 'number') return undefined;
      if (!Number.isInteger(h) || !Number.isInteger(m)) return undefined;
      if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
      boundaries.push({ hour: h, minute: m });
    }

    if (boundaries[0].hour !== 0 || boundaries[0].minute !== 0) return undefined;

    for (let i = 1; i < boundaries.length; i++) {
      const prev = boundaries[i - 1].hour * 60 + boundaries[i - 1].minute;
      const curr = boundaries[i].hour * 60 + boundaries[i].minute;
      if (curr <= prev) return undefined;
    }

    return boundaries;
  }

  private buildSlotKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.boundaries.length; i++) {
      const start = this.boundaries[i];
      const end = i + 1 < this.boundaries.length
        ? this.boundaries[i + 1]
        : this.boundaries[0];
      const startStr = `${start.hour}:${String(start.minute).padStart(2, '0')}`;
      const endStr = `${end.hour}:${String(end.minute).padStart(2, '0')}`;
      keys.push(`${startStr}-${endStr}`);
    }
    return keys;
  }

  getSlotKeys(): string[] {
    return this.slotKeysCache;
  }

  calculateSlotKeyFromTime(timeStr: string | undefined): string | undefined {
    if (!timeStr) return undefined;
    const minutes = this.parseTimeToMinutes(timeStr);
    if (minutes == null) return undefined;
    return this.slotKeysCache[this.getSlotIndex(minutes)];
  }

  isValidSlotKey(slotKey: string): boolean {
    if (slotKey === 'none') return true;
    return this.slotKeysCache.includes(slotKey);
  }

  private getSlotIndex(totalMinutes: number): number {
    for (let i = this.boundaryMinutesCache.length - 1; i >= 0; i--) {
      if (totalMinutes >= this.boundaryMinutesCache[i]) return i;
    }
    return this.boundaryMinutesCache.length - 1;
  }

  private parseTimeToMinutes(timeStr: string): number | undefined {
    if (!timeStr || typeof timeStr !== 'string') return undefined;
    const timePart = timeStr.trim();
    if (!timePart) return undefined;

    const hhmmMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const isoMatch = timePart.match(
      /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    );
    const match = hhmmMatch ?? isoMatch;
    if (!match) return undefined;

    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
    return h * 60 + m;
  }
}
