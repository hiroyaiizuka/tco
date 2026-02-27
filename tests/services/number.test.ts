import { parseStrictInteger } from '../../src/utils/number';

describe('parseStrictInteger', () => {
  it('should parse plain integers', () => {
    expect(parseStrictInteger('0')).toBe(0);
    expect(parseStrictInteger('42')).toBe(42);
    expect(parseStrictInteger('-3')).toBe(-3);
  });

  it('should reject malformed numeric strings', () => {
    expect(Number.isNaN(parseStrictInteger('2abc'))).toBe(true);
    expect(Number.isNaN(parseStrictInteger('1.5'))).toBe(true);
    expect(Number.isNaN(parseStrictInteger('abc'))).toBe(true);
  });
});
