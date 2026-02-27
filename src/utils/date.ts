/**
 * Date utility functions
 */

/** Format a Date to YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD to Date (local time, midnight) */
export function parseDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, ys, ms, ds] = match;
  return new Date(parseInt(ys, 10), parseInt(ms, 10) - 1, parseInt(ds, 10));
}

/** Get YYYY-MM month key from a date string */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Get today's date as YYYY-MM-DD */
export function today(): string {
  return formatDate(new Date());
}

/**
 * Resolve user-friendly date input to YYYY-MM-DD.
 * Accepts: "today", "tomorrow", "yesterday", or YYYY-MM-DD
 */
export function resolveDate(input?: string): string {
  if (!input || input === 'today') return today();

  if (input === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  if (input === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  }

  // Validate real YYYY-MM-DD date
  const parsed = parseDate(input);
  if (parsed && formatDate(parsed) === input) {
    return input;
  }

  throw new Error(`Invalid date format: "${input}". Use YYYY-MM-DD, "today", "tomorrow", or "yesterday".`);
}

/** Get YYYY-MM key from Date */
export function getMonthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Get YYYY-MM-DD key from Date */
export function getDateKey(date: Date): string {
  return formatDate(date);
}

/** Validate HH:mm time string (hours 0-23, minutes 0-59) */
export function isValidTime(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
