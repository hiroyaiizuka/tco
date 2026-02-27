import { parseDate, formatDate } from './date.js';

export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function safeFromEntries<T>(entries: Iterable<[string, T]>): Record<string, T> {
  const result: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    if (!DANGEROUS_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

export function pickAllowedKeys<T extends Record<string, unknown>>(
  source: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (Object.hasOwn(source, key)) {
      result[key] = source[key];
    }
  }
  return result as Partial<T>;
}

export function isSafeKey(key: string): boolean {
  return !DANGEROUS_KEYS.has(key);
}

const TASK_ID_RE = /^tc-task-[a-z0-9][a-z0-9_-]*$/;
export function isValidTaskId(taskId: string): boolean {
  return taskId.length > 0
    && taskId.length <= MAX_TASK_NAME_LENGTH
    && !DANGEROUS_KEYS.has(taskId)
    && isSafeString(taskId)
    && TASK_ID_RE.test(taskId);
}

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isValidMonthKey(monthKey: string): boolean {
  return MONTH_KEY_RE.test(monthKey);
}

export function isValidDayKey(dayKey: string): boolean {
  const parsed = parseDate(dayKey);
  return parsed !== null && formatDate(parsed) === dayKey;
}

export function isSafeString(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x1f\x7f]/.test(value);
}

export const MAX_TASK_NAME_LENGTH = 255;
export const MAX_ESTIMATE_MINUTES = 1440;
export const MAX_REMIND_MINUTES = 1440;
