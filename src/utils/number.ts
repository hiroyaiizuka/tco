/**
 * Parse a decimal integer string strictly.
 * Returns NaN for malformed input (e.g. "2abc", "1.5").
 */
export function parseStrictInteger(value: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}
