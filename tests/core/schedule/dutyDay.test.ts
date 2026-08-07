import { describe, expect, it } from 'vitest'
import {
  M4_RANGE_DAY,
  RFI_ECS_DAY,
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
    expect(dutyCommitments(ZONE)).toHaveLength(2)
  })

  it('finds a day by date and returns null otherwise', () => {
    expect(dutyDayFor('2026-08-06')?.label).toMatch(/RFI/)
    expect(dutyDayFor('2026-08-07')?.label).toMatch(/range/i)
    expect(dutyDayFor('2026-08-08')).toBe(null)
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

  it('costs a third of the week, and the same block every single day', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    expect(week.plannedHours).toBeCloseTo(20.8, 1)
    expect(week.actualHours).toBeCloseTo(13.3, 1)
    // Not "sometimes the morning goes" — it goes every duty day, so it is not capacity.
    expect(week.alwaysLost).toEqual(['Morning deep work — LSAT'])
  })

  it('leaves the weekends carrying most of what is left', () => {
    const week = representativeWeek(ZONE, '2026-08-03')
    const weekend = week.days.filter((d) => !d.isDutyDay)
    const weekendMinutes = weekend.reduce((t, d) => t + d.survivingMinutes, 0)
    const total = week.days.reduce((t, d) => t + d.survivingMinutes, 0)
    // Two days out of seven carrying more than a third of the study time is fragile:
    // one lost weekend costs more than a lost week of evenings.
    expect(weekendMinutes / total).toBeGreaterThan(0.35)
  })
})
