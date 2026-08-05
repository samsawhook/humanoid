/**
 * Which timezone was in effect when.
 *
 * The reason this exists rather than a single `settings.timezone`: a deployment moves
 * you seven to nine hours. If the system stored only a current zone, then on the day
 * that value changed, every past record would silently re-render in the new zone —
 * work done at 9pm in Texas would become the following morning. Demonstrated
 * throughput, which everything downstream calibrates against, would shift underneath
 * you at exactly the moment you most need it to hold still.
 *
 * So: an instant is absolute truth, and the local day it belongs to is resolved using
 * the zone that was in effect at that instant. A Tuesday in Texas stays a Tuesday in
 * Texas after you land in Kuwait.
 */

import type { IanaZone, LocalDate, TimezonePeriod } from '../types.js'
import { localDayFor } from './localDay.js'

/** Sorted oldest-first. Callers may hand us periods in any order. */
export function sortPeriods(periods: TimezonePeriod[]): TimezonePeriod[] {
  return [...periods].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
}

/**
 * The zone in effect at `instant`: the period with the greatest `effectiveFrom` at or
 * before it.
 *
 * An instant earlier than every period resolves to the earliest one. That case is
 * backfilled history — data imported from before the first period was recorded — and
 * treating it as "the oldest zone we know about" is the only answer that doesn't throw
 * away the record.
 */
export function resolveZoneAt(periods: TimezonePeriod[], instant: Date): IanaZone {
  const sorted = sortPeriods(periods)
  const first = sorted[0]
  if (!first) {
    throw new Error(
      'No timezone periods configured. Seed at least one before planning; ' +
        'the validator reports this as EMPTY_STATE.',
    )
  }

  let current = first
  for (const period of sorted) {
    if (period.effectiveFrom.getTime() <= instant.getTime()) current = period
    else break
  }
  return current.ianaZone
}

/** The local day an instant fell on, resolved through the zone in effect then. */
export function localDayAt(periods: TimezonePeriod[], instant: Date): LocalDate {
  return localDayFor(resolveZoneAt(periods, instant), instant)
}

/**
 * True when the zone changed at some point inside the half-open interval.
 * Used to flag periods whose capacity history spans a move, since throughput either
 * side of one is not straightforwardly comparable.
 */
export function zoneChangedBetween(
  periods: TimezonePeriod[],
  from: Date,
  to: Date,
): boolean {
  return sortPeriods(periods).some(
    (p) => p.effectiveFrom.getTime() > from.getTime() && p.effectiveFrom.getTime() <= to.getTime(),
  )
}
