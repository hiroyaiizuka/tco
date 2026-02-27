import matter from 'gray-matter';
import type { VaultService } from './VaultService.js';

/**
 * FrontmatterService - Parse and serialize YAML frontmatter.
 * Handles the gray-matter sexagesimal issue where HH:mm values
 * (e.g., "09:55") are parsed as numbers (595).
 */
export class FrontmatterService {
  constructor(private readonly vault: VaultService) {}

  /** Parse frontmatter from a vault-relative markdown file */
  async parseFrontmatter(vaultRelativePath: string): Promise<{
    data: Record<string, unknown>;
    content: string;
  }> {
    const raw = await this.vault.readFile(vaultRelativePath);
    return this.parseString(raw);
  }

  /** Parse frontmatter from a raw string */
  parseString(raw: string): {
    data: Record<string, unknown>;
    content: string;
  } {
    const result = matter(raw);
    const data = normalizeSexagesimal(result.data as Record<string, unknown>);
    return { data, content: result.content };
  }

  /** Update frontmatter fields and write back to file */
  async updateFrontmatter(
    vaultRelativePath: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const raw = await this.vault.readFile(vaultRelativePath);
    const result = matter(raw);
    const data = normalizeSexagesimal(result.data as Record<string, unknown>);

    // Apply updates
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        delete data[key];
      } else {
        data[key] = value;
      }
    }

    const output = matter.stringify(result.content, data);
    await this.vault.writeFile(vaultRelativePath, output);
  }

  /** Create a new markdown file with frontmatter */
  async createFile(
    vaultRelativePath: string,
    frontmatter: Record<string, unknown>,
    bodyContent: string,
  ): Promise<void> {
    const output = matter.stringify(bodyContent, frontmatter);
    await this.vault.writeFile(vaultRelativePath, output);
  }
}

/**
 * Normalize sexagesimal values in frontmatter.
 * YAML spec interprets "09:55" as base-60 number = 9*60+55 = 595.
 * gray-matter uses js-yaml which does this conversion.
 *
 * We detect known time fields and convert numbers back to HH:mm strings.
 */
const TIME_FIELDS = new Set([
  'scheduled_time',
  'reminder_time',
  '開始時刻',
]);

function normalizeSexagesimal(data: Record<string, unknown>): Record<string, unknown> {
  for (const key of TIME_FIELDS) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value < 1440) {
      const hh = String(Math.floor(value / 60)).padStart(2, '0');
      const mm = String(value % 60).padStart(2, '0');
      data[key] = `${hh}:${mm}`;
    }
  }
  return data;
}

/**
 * Normalize a reminder_time value to HH:mm string.
 * Handles both string and number (YAML sexagesimal) values.
 */
export function normalizeReminderTime(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return undefined;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value < 1440) {
    const hh = String(Math.floor(value / 60)).padStart(2, '0');
    const mm = String(value % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return undefined;
}
