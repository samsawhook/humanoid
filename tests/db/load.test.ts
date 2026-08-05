import { describe, expect, it } from 'vitest'
import { localDate } from '@/db/load'
import { parseLocalDate } from '@/core/time/localDay'

/**
 * This is the bug that took the first deployment down.
 *
 * Postgres `date` columns arrive as JS Date objects, not 'YYYY-MM-DD' strings. The
 * core is strict about that on purpose — a malformed date silently mis-sorting a plan
 * is worse than a loud throw — so the mapping layer has to do the coercion, and it
 * has to be tested, because the seed fallback hides the problem in local development.
 */
describe('date coercion at the database boundary', () => {
  it('turns a Date into the local-date string the core expects', () => {
    expect(localDate(new Date(2026, 7, 5))).toBe('2026-08-05')
    expect(localDate(new Date(2027, 0, 1))).toBe('2027-01-01')
    expect(localDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('pads single-digit months and days', () => {
    expect(localDate(new Date(2027, 0, 9))).toBe('2027-01-09')
  })

  it('passes strings through, trimming a timestamp to its date part', () => {
    expect(localDate('2026-08-05')).toBe('2026-08-05')
    expect(localDate('2026-08-05T00:00:00.000Z')).toBe('2026-08-05')
  })

  it('maps null and undefined to null rather than to a bogus date', () => {
    expect(localDate(null)).toBeNull()
    expect(localDate(undefined)).toBeNull()
  })

  it('produces something the core will actually accept', () => {
    // The regression: this is what used to be handed straight to parseLocalDate.
    expect(() => parseLocalDate(String(new Date(2026, 7, 5)))).toThrow()
    expect(() => parseLocalDate(localDate(new Date(2026, 7, 5))!)).not.toThrow()
  })

  it('does not shift the day for a date parsed as local midnight', () => {
    // pg builds a DATE as local midnight; toISOString() would move it west of UTC.
    expect(localDate(new Date(2026, 7, 5, 0, 0, 0))).toBe('2026-08-05')
  })
})
