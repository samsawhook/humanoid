/**
 * Local-calendar arithmetic, done with `Intl` and nothing else.
 *
 * Two rules hold everywhere in this file:
 *   1. Never read the clock. Every function takes the instant it operates on.
 *   2. Never store or pass a fixed offset. Offsets change twice a year; zones don't.
 */

import type { IanaZone, LocalDate } from '../types'

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_RE.exec(date)
  if (!m) throw new Error(`Not a local date (expected YYYY-MM-DD): ${JSON.stringify(date)}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(year, 4)}-${p(month)}-${p(day)}`
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds.
 *
 * Derived by asking `Intl` what wall-clock time the zone was showing at that instant
 * and diffing against UTC. This is the only correct way to do it without shipping a
 * timezone database of our own.
 */
export function zoneOffsetMs(zone: IanaZone, instant: Date): number {
  const parts = formatter(zone).formatToParts(instant)
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    if (!found) throw new Error(`Intl did not return ${type} for zone ${zone}`)
    return Number(found.value)
  }
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Some implementations render midnight as hour 24 under hour12:false.
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** Which local calendar day an instant fell on, in the given zone. */
export function localDayFor(zone: IanaZone, instant: Date): LocalDate {
  const parts = formatter(zone).formatToParts(instant)
  const get = (type: string): string => {
    const found = parts.find((p) => p.type === type)
    if (!found) throw new Error(`Intl did not return ${type} for zone ${zone}`)
    return found.value
  }
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * The instant at which a local day begins in a zone.
 *
 * Solved by iteration rather than algebra: guess that local midnight is UTC midnight,
 * measure the zone's actual offset near that guess, correct, then measure once more.
 * The second pass is what handles a DST transition landing between the guess and the
 * answer. On a spring-forward day where local midnight does not exist, this lands on
 * the transition instant, which is the sanest available answer.
 */
export function startOfLocalDay(zone: IanaZone, date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date)
  const midnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0)

  let instant = midnightAsUtc - zoneOffsetMs(zone, new Date(midnightAsUtc))
  instant = midnightAsUtc - zoneOffsetMs(zone, new Date(instant))
  return new Date(instant)
}

/** Exclusive end of a local day — i.e. the start of the next one. */
export function endOfLocalDay(zone: IanaZone, date: LocalDate): Date {
  return startOfLocalDay(zone, addLocalDays(date, 1))
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return formatLocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Whole days from `a` to `b`. Negative when `b` precedes `a`. */
export function localDaysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parseLocalDate(a)
  const pb = parseLocalDate(b)
  const ms =
    Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)
  return Math.round(ms / 86_400_000)
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  // Zero-padded ISO dates sort correctly as strings. Validate anyway so a malformed
  // date fails loudly here rather than silently mis-sorting a plan.
  parseLocalDate(a)
  parseLocalDate(b)
  return a < b ? -1 : a > b ? 1 : 0
}

/** Monday-based week start, matching how weekly capacity is budgeted. */
export function startOfIsoWeek(date: LocalDate): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1
  return addLocalDays(date, -backToMonday)
}

export function eachLocalDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = localDaysBetween(from, to)
  if (span < 0) return []
  const out: LocalDate[] = []
  for (let i = 0; i <= span; i++) out.push(addLocalDays(from, i))
  return out
}

const formatterCache = new Map<IanaZone, Intl.DateTimeFormat>()

function formatter(zone: IanaZone): Intl.DateTimeFormat {
  const cached = formatterCache.get(zone)
  if (cached) return cached
  let made: Intl.DateTimeFormat
  try {
    made = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    throw new Error(`Unknown IANA timezone: ${JSON.stringify(zone)}`)
  }
  formatterCache.set(zone, made)
  return made
}
