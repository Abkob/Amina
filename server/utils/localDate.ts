/**
 * Returns the current wall-clock date as YYYY-MM-DD in the given IANA timezone.
 * Falls back to the server's local date (not UTC) when no timezone is provided,
 * so the returned string always matches the user's calendar day.
 */
export function localDateStr(timezone?: string): string {
  if (timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  }
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Validates that a value is a YYYY-MM-DD calendar date string.
 * Returns the trimmed value if valid, or throws with a descriptive message.
 * Rejects locale strings ("Oct 15"), quarters ("Q3 2024"), relative terms ("next week"), etc.
 * Pass null/undefined to skip validation (returns null).
 */
export function requireISODate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw Object.assign(
      new Error(`${fieldName} must be a YYYY-MM-DD date string (got: "${s}")`),
      { status: 400 },
    );
  }
  // Validate that the date is actually valid (e.g., not 2024-02-31)
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) {
    throw Object.assign(
      new Error(`${fieldName} is not a valid date (got: "${s}")`),
      { status: 400 },
    );
  }
  return s;
}

/**
 * Returns YYYY-MM-DD for `daysFromNow` days in the future, in the given timezone.
 */
export function localDateOffset(daysFromNow: number, timezone?: string): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  if (timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  }
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
