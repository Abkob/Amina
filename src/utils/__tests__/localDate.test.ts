import { describe, it, expect } from 'vitest';
import { requireISODate } from '../../../server/utils/localDate.js';

describe('requireISODate', () => {
  it('returns null for null input', () => {
    expect(requireISODate(null, 'due_date')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(requireISODate(undefined, 'due_date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(requireISODate('', 'due_date')).toBeNull();
  });

  it('returns trimmed ISO date for valid date', () => {
    expect(requireISODate('2026-07-15', 'due_date')).toBe('2026-07-15');
  });

  it('trims surrounding whitespace', () => {
    expect(requireISODate('  2026-01-01  ', 'due_date')).toBe('2026-01-01');
  });

  it('throws for locale strings', () => {
    expect(() => requireISODate('Oct 15', 'due_date')).toThrow('due_date must be a YYYY-MM-DD');
  });

  it('throws for quarter strings', () => {
    expect(() => requireISODate('Q3 2024', 'due_date')).toThrow('due_date must be a YYYY-MM-DD');
  });

  it('throws for "next week" relative terms', () => {
    expect(() => requireISODate('next week', 'due_date')).toThrow('due_date must be a YYYY-MM-DD');
  });

  it('throws for timestamps (includes time part)', () => {
    expect(() => requireISODate('2026-07-15T12:00:00Z', 'due_date')).toThrow('due_date must be a YYYY-MM-DD');
  });

  it('throws for partial dates like YYYY-MM', () => {
    expect(() => requireISODate('2026-07', 'due_date')).toThrow('due_date must be a YYYY-MM-DD');
  });

  it('includes the field name in the error message', () => {
    expect(() => requireISODate('bad', 'deadline')).toThrow('deadline must be a YYYY-MM-DD');
  });

  it('throws with status 400 attached to the error', () => {
    try {
      requireISODate('bad', 'due_date');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { status: number }).status).toBe(400);
    }
  });

  it('accepts leap day on a real leap year', () => {
    expect(requireISODate('2024-02-29', 'due_date')).toBe('2024-02-29');
  });
});
