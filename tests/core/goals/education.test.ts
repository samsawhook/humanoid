import { describe, expect, it } from 'vitest'
import {
  LSAT_DATES,
  administrationsUsableBy,
  applicationCycleBands,
  buildStudyPlan,
} from '@/core/goals/education'

const TODAY = '2026-08-05'

describe('LSAT administrations', () => {
  it('flags every date I could not confirm, rather than presenting it as fact', () => {
    const unconfirmed = LSAT_DATES.filter((a) => a.source !== 'confirmed')
    // November and June were not obtainable — LSAC returned 403.
    expect(unconfirmed.map((a) => a.key).sort()).toEqual(['jun_2027', 'nov_2026'])
    expect(unconfirmed.every((a) => a.note?.includes('VERIFY'))).toBe(true)
  })

  it('excludes the January sitting from a mid-January application', () => {
    const usable = administrationsUsableBy('2027-01-15').map((a) => a.key)
    expect(usable).toContain('oct_2026')
    expect(usable).toContain('nov_2026')
    // Score releases 2027-02-03 — after the application would need to be in.
    expect(usable).not.toContain('jan_2027')
  })

  it('assumes a missing score-release date is 21 days out rather than assuming it is fine', () => {
    // November has no published release; +21 days from 11 Nov clears a 15 Jan target.
    expect(administrationsUsableBy('2027-01-15').map((a) => a.key)).toContain('nov_2026')
    // …but not a 25 Nov one.
    expect(administrationsUsableBy('2026-11-25').map((a) => a.key)).not.toContain('nov_2026')
  })
})

describe('study plan', () => {
  it('phases are defined by output, never by hours logged', () => {
    const plan = buildStudyPlan(LSAT_DATES[0]!, TODAY, 10)
    for (const phase of plan.phases) {
      expect(phase.output.length).toBeGreaterThan(0)
      expect(phase.output.toLowerCase()).not.toMatch(/\b\d+\s*(hours?|hrs?)\b/)
    }
  })

  it('warns when the runway is too short to be a real attempt', () => {
    const oct = LSAT_DATES.find((a) => a.key === 'oct_2026')!
    const plan = buildStudyPlan(oct, TODAY, 10)
    expect(plan.weeksAvailable).toBe(9)
    expect(plan.warnings.join(' ')).toMatch(/registration closes/i)
  })

  it('warns rather than silently planning around an unconfirmed date', () => {
    const nov = LSAT_DATES.find((a) => a.key === 'nov_2026')!
    expect(buildStudyPlan(nov, TODAY, 10).warnings.join(' ')).toMatch(/derived, not confirmed/i)
  })

  it('compresses every phase on a short runway instead of dropping the final review', () => {
    const oct = LSAT_DATES.find((a) => a.key === 'oct_2026')!
    const short = buildStudyPlan(oct, TODAY, 10)
    const long = buildStudyPlan(oct, '2026-01-01', 10)

    expect(short.phases).toHaveLength(long.phases.length)
    // The taper is the phase people actually cut, and the one that moves the score.
    expect(short.phases.at(-1)!.key).toBe('taper')
    expect(long.phases.at(-1)!.key).toBe('taper')
  })

  it('says registration has closed rather than planning a sitting you cannot enter', () => {
    const oct = LSAT_DATES.find((a) => a.key === 'oct_2026')!
    expect(buildStudyPlan(oct, '2026-09-15', 10).warnings.join(' ')).toMatch(/already closed/i)
  })
})

describe('application cycle', () => {
  it('models rolling admissions as a decaying ramp, not a deadline', () => {
    const bands = applicationCycleBands(2027)
    const strengths = bands.map((b) => b.strength)
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a))
    expect(bands[0]!.strength).toBe(1)
    expect(bands.at(-1)!.strength).toBeLessThan(0.5)
  })

  it('carries the cycle across the year boundary', () => {
    const late = applicationCycleBands(2027).find((b) => b.label === 'Late but workable')!
    expect(late.from).toBe('2027-12-01')
    expect(late.to).toBe('2028-01-31')
  })
})
