import { describe, expect, it } from 'vitest'
import {
  M4_RANGE_DAY,
  RFI_ECS_DAY,
  SATURDAY_RANGE_DAY,
  atomicSlotsBetween,
  dutyWindow,
  dutyCommitments,
  dutyDayFor,
  dayCapacity,
  representativeWeek,
} from '@/core/schedule/dutyDay'
import { DEFAULT_DAY_TEMPLATE, templateIntervalsFor } from '@/core/schedule/dayTemplate'

const ZONE = 'America/Chicago'

describe('a published duty day', () => {
  it('starts before the formation, because being at a 0440 formation starts earlier', () => {
    const w = dutyWindow(M4_RANGE_DAY)
    expect(w.firstEvent.at).toBe('04:40')
    // 04:40 formation less 55 minutes of PPE, kit and movement.
    expect(w.startMinute).toBe(3 * 60 + 45)
    expect(w.hours).toBeGreaterThan(13)
  })

  /**
   * The schedule stops at "SP to range" and says nothing about release. That absence is
   * information, so it is recorded rather than papered over with a plausible number.
   */
  it('admits it does not know when the day ends', () => {
    expect(M4_RANGE_DAY.endConfidence).toBe('unknown')
    expect(M4_RANGE_DAY.note).toMatch(/inference/i)
  })

  it('keeps the lines that are yours specifically', () => {
    const mine = M4_RANGE_DAY.events.filter((e) => e.yours)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.label).toMatch(/Draw trucks/i)
    // Drawing a truck at 0645 also means turning one in after everyone else goes home.
    expect(mine[0]!.note).toMatch(/turned back in/i)
  })

  /**
   * One commitment, not seven. Seven with gaps between them would let the scheduler
   * offer the twenty-five minutes between chow and the parking lot as study time.
   */
  it('occupies each day as a single span rather than as separate events', () => {
    const c = dutyCommitments(ZONE, [M4_RANGE_DAY])
    expect(c).toHaveLength(1)
    expect(c[0]!.title).toMatch(/end unknown/)
    // Two days recorded now, and only the range day has an unpublished end.
    expect(dutyCommitments(ZONE)).toHaveLength(3)
  })

  it('finds a day by date and returns null otherwise', () => {
    expect(dutyDayFor('2026-08-06')?.label).toMatch(/RFI/)
    expect(dutyDayFor('2026-08-07')?.label).toMatch(/range/i)
    expect(dutyDayFor('2026-08-08')?.label).toMatch(/Saturday/)
    expect(dutyDayFor('2026-08-10')).toBe(null)
  })

  /**
   * A fielding day finishes and a range day does not. Generalising the range day to
   * every weekday, as the first pass did, took the pessimistic end of a real spread.
   */
  it('records that not every duty day has the same shape', () => {
    expect(dutyWindow(RFI_ECS_DAY).hours).toBeLessThan(dutyWindow(M4_RANGE_DAY).hours)
    expect(RFI_ECS_DAY.endConfidence).toBe('estimated')
    expect(M4_RANGE_DAY.endConfidence).toBe('unknown')
  })
})

describe('what the duty day costs', () => {
  /**
   * The finding. A 0440 formation does not SHORTEN the 05:30 study block — it erases
   * it, and that block was the half of the weekday plan specifically designed to be
   * safe from the Army by happening before the Army.
   */
  it('deletes the morning block outright rather than shortening it', () => {
    const planned = templateIntervalsFor(ZONE, RFI_ECS_DAY.date, DEFAULT_DAY_TEMPLATE)
    expect(planned.map((i) => i.block.key)).toContain('am_deep')

    // Both shapes, short day and long day alike, lose the same block.
    for (const day of [RFI_ECS_DAY, M4_RANGE_DAY]) {
      const cap = dayCapacity(ZONE, day.date)
      expect(cap.isDutyDay).toBe(true)
      expect(cap.lost).toContain('Morning deep work — LSAT')
      expect(cap.survivingMinutes).toBeLessThan(cap.plannedMinutes)
    }
    expect(dayCapacity(ZONE, RFI_ECS_DAY.date).survivingMinutes).toBe(75)
  })

  it('leaves a non-duty day untouched', () => {
    const cap = dayCapacity(ZONE, '2026-08-10')
    expect(cap.isDutyDay).toBe(false)
    expect(cap.lost).toEqual([])
    expect(cap.survivingMinutes).toBe(cap.plannedMinutes)
  })

  it('still costs the whole morning, every day, even with Sunday opened up', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    expect(week.plannedHours).toBeCloseTo(24.8, 1)
    // Sunday's extra block puts the week back to 13.3 despite losing all of Saturday.
    expect(week.actualHours).toBeCloseTo(13.3, 1)
    // Not "sometimes the morning goes" — it goes every duty day, so it is not capacity.
    expect(week.alwaysLost).toContain('Morning deep work — LSAT')
  })

  /**
   * The weekend now carries MORE of the week, not less — which is the point of opening
   * Sunday up. It is also the remaining fragility: two days out of seven holding this
   * much means the next weekend duty day costs more than any weekday can.
   */
  it('leaves the weekend carrying most of the week', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    const weekend = week.days
      .filter((d) => d.date >= '2026-08-08')
      .reduce((t, d) => t + d.survivingMinutes, 0)
    const total = week.days.reduce((t, d) => t + d.survivingMinutes, 0)
    expect(weekend / total).toBeGreaterThan(0.4)
  })
})

describe('the weekend, which was assumed free and was not', () => {
  /**
   * Written down as a risk one day before it happened: "the weekends carry more than a
   * third of your study time across two days out of seven, and one lost weekend costs
   * more than a lost week of evenings." Then Saturday became a range day.
   */
  it('costs four hours in one day, more than any weekday', () => {
    const cap = dayCapacity(ZONE, SATURDAY_RANGE_DAY.date)
    expect(cap.isDutyDay).toBe(true)
    expect(cap.plannedMinutes).toBe(240)
    expect(cap.survivingMinutes).toBe(0)
  })

  /**
   * It would have cost 4 of 13.3 hours and the practice test with it. Opening Sunday up
   * is what absorbs it: the week is back to 13.3 and the test simply moves a day.
   */
  it('is absorbed by the Sunday block rather than costing the week', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    expect(week.actualHours).toBeCloseTo(13.3, 1)
  })

  /**
   * The distinction the `atomic` flag exists for. A four-hour block does not divide:
   * half a timed LSAT is not half a practice test, it is no practice test. Rolling this
   * into "hours lost" would make it look like something an extra evening could replace.
   */
  /**
   * The alarm has to stop crying wolf. Before Sunday had a long block, losing Saturday
   * lost the capability outright. Now the test happens a day later, so the block is
   * reported as COVERED — a fact worth knowing, not a fact worth alarm.
   */
  it('reports the block as covered, not lost, now that Sunday can hold the test', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    expect(week.capabilitiesCovered).toEqual(['Saturday long block'])
    expect(week.capabilitiesLost).toEqual([])

    // And with no fallback, it would be a genuine loss.
    const satOnly = DEFAULT_DAY_TEMPLATE.filter((b) => b.key !== 'sun_long')
    const fragile = representativeWeek(ZONE, '2026-08-03', undefined, satOnly)
    expect(fragile.capabilitiesLost).toEqual(['Saturday long block'])
  })
})

describe('practice-test slots', () => {
  /**
   * A better readiness measure than hours. You do not accumulate a timed full-length
   * out of evenings — it needs one uninterrupted four-hour window, and there is exactly
   * one a week. That makes it a small countable integer where hours are a large number
   * that hides the constraint.
   */
  it('counts WEEKENDS rather than dates, since you sit one test a weekend', () => {
    const slots = atomicSlotsBetween(ZONE, '2026-08-06', '2026-11-11')
    // The range Saturday does not cost the weekend — Sunday still holds a full test.
    expect(slots.lost).toEqual([])
    expect(slots.available).toContain(SATURDAY_RANGE_DAY.date)

    // Two four-hour windows on consecutive days is one opportunity with a spare.
    const weeks = 14
    expect(slots.available.length).toBe(weeks)
  })

  /**
   * The honest caveat, and it is doing real work here: every remaining slot counts as
   * available only because no schedule exists for it yet. Of the Saturdays actually
   * known, one out of one was a duty day — so "assumed free" is currently contradicted
   * by 100% of the evidence.
   */
  it('separates the weekend it actually knows about from the ones it assumes', () => {
    const slots = atomicSlotsBetween(ZONE, '2026-08-06', '2026-11-11')
    // One weekend has a real schedule; every other is free only because nothing says so.
    expect(slots.assumedFree).toBe(slots.available.length - 1)
  })
})
