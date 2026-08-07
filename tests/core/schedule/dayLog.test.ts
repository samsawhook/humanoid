import { describe, expect, it } from 'vitest'
import {
  DAY_LOGS,
  logFor,
  watchedFlags,
  usableCapacity,
  demandCeiling,
  canSupport,
} from '@/core/schedule/dayLog'
import { dayCapacity } from '@/core/schedule/dutyDay'
import { DEFAULT_DAY_TEMPLATE } from '@/core/schedule/dayTemplate'

const ZONE = 'America/Chicago'

describe('cognitive ceiling', () => {
  it('gates the KIND of work, not the amount of it', () => {
    expect(demandCeiling('good')).toBe('high')
    expect(demandCeiling('meh')).toBe('medium')
    expect(demandCeiling('poor')).toBe('low')

    // A "meh" day can still do admin and can still review. It cannot do LSAT.
    expect(canSupport('meh', 'low')).toBe(true)
    expect(canSupport('meh', 'medium')).toBe(true)
    expect(canSupport('meh', 'high')).toBe(false)
  })
})

describe('the first day with an outcome recorded', () => {
  const log = logFor('2026-08-06')!

  /**
   * The whole reason this file exists. The capacity model said 75 minutes survived the
   * schedule. Every one of them was reserved for high-demand LSAT work, and the day's
   * ceiling was medium — so the honest count of usable study time is zero, and no
   * amount of better arithmetic on the 75 would have found that.
   */
  it('shows time available and time usable are different quantities', () => {
    const cap = dayCapacity(ZONE, '2026-08-06')
    const usable = usableCapacity('2026-08-06', cap.survivingMinutes)!

    expect(usable.availableMinutes).toBe(75)
    expect(usable.ceiling).toBe('medium')
    expect(usable.supportsHighDemand).toBe(false)

    // And the blocks that survived were all high-demand, so none were reachable.
    const surviving = DEFAULT_DAY_TEMPLATE.filter((b) => b.key === 'pm_drill')
    expect(surviving.every((b) => b.demand === 'high')).toBe(true)
  })

  it('names what took the time, and records that all of it was worth taking', () => {
    // Sleep after an 0400 start, BJJ, a run. Displacement is not automatically failure,
    // and a system that treated it as failure would be wrong about this day.
    const usable = usableCapacity('2026-08-06', 75)!
    expect(usable.displacementWasChosen).toBe(true)
    expect(usable.displacedBy.map((d) => d.label).join(' ')).toMatch(/BJJ/)
  })

  /**
   * BJJ is at 20:00; the evening LSAT block is 19:30–20:45. They are the same time, and
   * BJJ is not the thing to move — it is one of the few load-bearing life-feel items in
   * a 13-hour duty day.
   */
  it('records the BJJ collision with the only surviving study block', () => {
    const bjj = log.displacedBy.find((d) => d.label === 'BJJ')!
    expect(bjj.at).toBe('20:00')
    expect(bjj.wanted).toBe(true)

    const block = DEFAULT_DAY_TEMPLATE.find((b) => b.key === 'pm_drill')!
    const bjjMinutes = 20 * 60
    expect(bjjMinutes).toBeGreaterThanOrEqual(block.startMinute)
    expect(bjjMinutes).toBeLessThan(block.endMinute)
  })

  it('keeps the notes verbatim rather than parsing the texture out of them', () => {
    expect(log.notes).toMatch(/chili mac/i)
    expect(log.notes).toMatch(/low motivation/i)
  })
})

describe('health flags', () => {
  it('puts the urgent one first and gives every flag an action', () => {
    const flags = watchedFlags()
    expect(flags[0]!.flag.key).toBe('foot_pain')
    expect(flags[0]!.flag.urgent).toBe(true)
    for (const f of flags) expect(f.flag.action.length).toBeGreaterThan(20)
  })

  /**
   * The most actionable line in the log, and it is time-boxed: you are at DRC with the
   * medical folder open this week. Undiagnosed foot pain plus twelve months in boots is
   * not something to discover in theatre.
   */
  it('ties the foot pain to the DRC window rather than leaving it as a note', () => {
    const foot = watchedFlags().find((f) => f.flag.key === 'foot_pain')!
    expect(foot.flag.duration).toBe('longstanding')
    expect(foot.flag.trajectory).toBe('unknown')
    expect(foot.flag.action).toMatch(/DRC/)
  })

  it('counts repeats so a passing remark becomes a pattern', () => {
    for (const f of watchedFlags()) {
      expect(f.timesReported).toBe(DAY_LOGS.filter((l) => l.flags.some((x) => x.key === f.flag.key)).length)
      expect(f.firstSeen <= f.lastSeen).toBe(true)
    }
  })
})

describe('the non-objective', () => {
  /**
   * The spec forbids optimising for, ranking by, or displaying completion rate. This
   * module is the one most likely to drift into it, so the absence is asserted rather
   * than trusted: `usableCapacity` returns a ceiling and a cause, never a score.
   */
  it('produces no completion rate, percentage or score', () => {
    const usable = usableCapacity('2026-08-06', 75)!
    const keys = Object.keys(usable)
    expect(keys).not.toContain('completionRate')
    expect(keys).not.toContain('percentComplete')
    expect(keys).not.toContain('score')
    expect(JSON.stringify(usable)).not.toMatch(/rate|percent|score/i)
  })
})
