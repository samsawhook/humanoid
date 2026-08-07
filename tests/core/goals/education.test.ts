import { describe, expect, it } from 'vitest'
import {
  LSAT_DATES,
  administrationsUsableBy,
  applicationCycleBands,
  buildStudyPlan,
  assessSitting,
  hoursBetween,
  STUDY_CAPACITY,
  LSAT_HOURS_FLOOR,
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

describe('capacity segments and the blitz', () => {
  it('models capacity as segmented, not flat — the whole point of the blitz', () => {
    const premob = STUDY_CAPACITY.find((s) => s.key === 'premob')!
    const rsoi = STUDY_CAPACITY.find((s) => s.key === 'rsoi')!
    expect(premob.hoursPerWeek).toBeGreaterThan(rsoi.hoursPerWeek)
  })

  it('marks every capacity figure as a guess, because they all are', () => {
    expect(STUDY_CAPACITY.every((s) => s.confidence !== 'confirmed')).toBe(true)
  })

  it('sums hours across segment boundaries rather than using one flat rate', () => {
    // Pre-mob alone, 30 days at the DERIVED 13.3h/wk.
    expect(hoursBetween('2026-08-05', '2026-09-03')).toBe(57)
    // Crossing into RSOI must be less than the same span at the pre-mob rate.
    const crossing = hoursBetween('2026-08-05', '2026-10-07')
    expect(crossing).toBeGreaterThan(57)
    expect(crossing).toBeLessThan(Math.round((64 / 7) * 13.3))
  })

  /**
   * The whole plan slipped one sitting when the pre-mob guess (25h/wk) was replaced by
   * a figure derived from a real published schedule (13.3h/wk). A 0440 formation does
   * not shorten the 05:30 study block, it deletes it — and that block was half the
   * weekday plan. October is now out entirely and November is the diagnostic.
   */
  it('rules October out and makes November the diagnostic, not the attempt', () => {
    const oct = assessSitting(LSAT_DATES.find((a) => a.key === 'oct_2026')!, TODAY)
    const nov = assessSitting(LSAT_DATES.find((a) => a.key === 'nov_2026')!, TODAY)
    const jan = assessSitting(LSAT_DATES.find((a) => a.key === 'jan_2027')!, TODAY)

    expect(oct.verdict).toBe('not viable')
    expect(nov.hoursAvailable).toBeLessThan(LSAT_HOURS_FLOOR)
    expect(nov.verdict).toBe('thin — treat as diagnostic')
    // January is the first sitting with the hours behind it to be worth a real score.
    expect(jan.hoursAvailable).toBeGreaterThanOrEqual(LSAT_HOURS_FLOOR)
    expect(jan.verdict).toBe('real attempt')
  })

  it('drops November under the floor too if pre-mob is really 10h/wk', () => {
    const pessimistic = STUDY_CAPACITY.map((s) =>
      s.key === 'premob' ? { ...s, hoursPerWeek: 10 } : s,
    )
    const nov = assessSitting(
      LSAT_DATES.find((a) => a.key === 'nov_2026')!,
      TODAY,
      pessimistic,
    )
    expect(nov.hoursAvailable).toBeLessThan(LSAT_HOURS_FLOOR)
  })

  it('always warns that the hours are only as good as the capacity guesses', () => {
    for (const a of LSAT_DATES) {
      expect(assessSitting(a, TODAY).warnings.join(' ')).toMatch(/capacity figure here is a guess/i)
    }
  })
})
