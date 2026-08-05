import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  endOfLocalDay,
  localDayFor,
  localDaysBetween,
  startOfIsoWeek,
  startOfLocalDay,
  zoneOffsetMs,
} from '@/core/time/localDay.js'
import { localDayAt, resolveZoneAt, zoneChangedBetween } from '@/core/time/timezonePeriods.js'
import { CHICAGO, KUWAIT } from '../../fixtures/world.js'

describe('local day arithmetic', () => {
  it('resolves an instant to the local day in the given zone', () => {
    // 02:00 UTC on the 6th is still the evening of the 5th in Chicago.
    expect(localDayFor(CHICAGO, new Date('2026-08-06T02:00:00Z'))).toBe('2026-08-05')
    expect(localDayFor(KUWAIT, new Date('2026-08-06T02:00:00Z'))).toBe('2026-08-06')
  })

  it('finds the instant a local day starts', () => {
    // Chicago is UTC-5 in August (CDT).
    expect(startOfLocalDay(CHICAGO, '2026-08-05').toISOString()).toBe('2026-08-05T05:00:00.000Z')
    // Kuwait is UTC+3 year round.
    expect(startOfLocalDay(KUWAIT, '2026-08-05').toISOString()).toBe('2026-08-04T21:00:00.000Z')
  })

  it('survives a DST transition', () => {
    // US DST began 2026-03-08. The day before is CST (-6), the day after CDT (-5).
    expect(startOfLocalDay(CHICAGO, '2026-03-07').toISOString()).toBe('2026-03-07T06:00:00.000Z')
    expect(startOfLocalDay(CHICAGO, '2026-03-09').toISOString()).toBe('2026-03-09T05:00:00.000Z')

    // The spring-forward day itself is 23 hours long, and the code must not assume 24.
    const springForward =
      endOfLocalDay(CHICAGO, '2026-03-08').getTime() - startOfLocalDay(CHICAGO, '2026-03-08').getTime()
    expect(springForward / 3_600_000).toBe(23)
  })

  it('reports offsets as of an instant, not as a constant', () => {
    expect(zoneOffsetMs(CHICAGO, new Date('2026-01-15T12:00:00Z')) / 3_600_000).toBe(-6)
    expect(zoneOffsetMs(CHICAGO, new Date('2026-07-15T12:00:00Z')) / 3_600_000).toBe(-5)
  })

  it('does date maths without drifting across month and year ends', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(localDaysBetween('2026-08-05', '2026-08-12')).toBe(7)
    expect(localDaysBetween('2026-08-12', '2026-08-05')).toBe(-7)
  })

  it('starts weeks on Monday, matching how capacity is budgeted', () => {
    expect(startOfIsoWeek('2026-08-05')).toBe('2026-08-03') // Wednesday → Monday
    expect(startOfIsoWeek('2026-08-03')).toBe('2026-08-03') // Monday → itself
    expect(startOfIsoWeek('2026-08-09')).toBe('2026-08-03') // Sunday → the Monday before
  })

  it('rejects a malformed date loudly rather than mis-sorting a plan', () => {
    expect(() => startOfLocalDay(CHICAGO, '2026-8-5')).toThrow()
    expect(() => startOfLocalDay('Mars/Olympus', '2026-08-05')).toThrow(/Unknown IANA timezone/)
  })
})

describe('timezone periods', () => {
  /** Chicago until the deployment, Kuwait after. The case this design exists for. */
  const periods = [
    { ianaZone: CHICAGO, effectiveFrom: new Date('2020-01-01T00:00:00Z') },
    { ianaZone: KUWAIT, effectiveFrom: new Date('2026-11-01T00:00:00Z') },
  ]

  it('resolves the zone in effect at an instant', () => {
    expect(resolveZoneAt(periods, new Date('2026-08-05T12:00:00Z'))).toBe(CHICAGO)
    expect(resolveZoneAt(periods, new Date('2026-12-05T12:00:00Z'))).toBe(KUWAIT)
  })

  it('is order-independent', () => {
    expect(resolveZoneAt([...periods].reverse(), new Date('2026-08-05T12:00:00Z'))).toBe(CHICAGO)
  })

  it('resolves backfilled history to the oldest known zone rather than discarding it', () => {
    expect(resolveZoneAt(periods, new Date('2015-01-01T00:00:00Z'))).toBe(CHICAGO)
  })

  it('keeps a Tuesday in Texas a Tuesday in Texas after the move — the whole point', () => {
    // Work done at 9pm Chicago on Tuesday 2026-08-04.
    const lateEveningInTexas = new Date('2026-08-05T02:00:00Z')

    // Read today, before deploying.
    expect(localDayAt(periods, lateEveningInTexas)).toBe('2026-08-04')

    // Read again in December, from Kuwait. Same answer — because the day is resolved
    // through the zone in effect when it happened, not the zone you happen to be in
    // now. Under a single current-timezone setting this would read 2026-08-05, and
    // every throughput number built on it would quietly shift.
    expect(localDayAt(periods, lateEveningInTexas)).toBe('2026-08-04')
    expect(localDayFor(KUWAIT, lateEveningInTexas)).toBe('2026-08-05') // the wrong answer, for contrast
  })

  it('flags an interval that spans a move, since throughput across one is not comparable', () => {
    expect(
      zoneChangedBetween(periods, new Date('2026-10-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z')),
    ).toBe(true)
    expect(
      zoneChangedBetween(periods, new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z')),
    ).toBe(false)
  })

  it('throws a legible error when no periods exist at all', () => {
    expect(() => resolveZoneAt([], new Date())).toThrow(/EMPTY_STATE/)
  })
})
