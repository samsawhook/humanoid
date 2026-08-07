/**
 * The default day: named blocks of time, reserved by domain, that the queue fills.
 *
 * This is the difference between a to-do list and a plan. A queue tells you what
 * matters; a template tells you *when you actually sit down*. Without it every day
 * starts with the same negotiation about where the work goes, and on a bad day the
 * negotiation is what gets skipped.
 *
 * Blocks are reserved for a domain rather than for a specific task, so the template
 * survives the queue changing underneath it — the 05:30 block is "LSAT", and whatever
 * is top of the LSAT queue that morning is what goes in it.
 *
 * Pure. No clock, no database.
 */

import type { Commitment, IanaZone, Item, LocalDate } from '../types'
import { parseLocalDate, startOfLocalDay } from '../time/localDay'
import type { CognitiveDemand } from './dayLog'

export interface TemplateBlock {
  key: string
  label: string
  /** 0 = Sunday. A block on no weekdays is inactive rather than deleted. */
  weekdays: number[]
  startMinute: number
  endMinute: number
  /**
   * The domain (or any node) this block is reserved for. Null means "anything from
   * the top of the queue" — useful for a genuine catch-all slot, dangerous as a
   * default, because a template of all-null blocks is just a queue with times on it.
   */
  nodeId: string | null
  /**
   * How much thinking this block costs.
   *
   * Time and attention are different resources, and the first day of real data showed
   * why it matters: 75 minutes survived the schedule and none became LSAT work, because
   * after an 0400 start the reported cognitive state was "meh". A block graded `high`
   * is not available on that day at any length; a `low` one is fine. Without this the
   * template keeps offering the wrong work and calling the result a discipline problem.
   */
  demand: CognitiveDemand
  /**
   * The block's value comes from its LENGTH, so shortening it destroys it rather than
   * reducing it.
   *
   * A full timed LSAT is about four hours and cannot be assembled out of four separate
   * hours — the whole point is sustained performance under fatigue. Losing an atomic
   * block is losing a capability, not losing time, and the two should never be summed
   * into one "hours lost" figure. Half of a practice test is not half a practice test.
   */
  atomic?: boolean
  purpose: string
}

const hm = (h: number, m = 0) => h * 60 + m

/**
 * A deployable default. Deliberately modest — a template you miss every day teaches
 * you to ignore the system, and the first thing this has to earn is trust.
 *
 * It used to claim that weekday mornings and evenings "survive both pre-mob and
 * theatre". The first real published schedule disproved half of that: a 0440 formation
 * means an 0345 start, and the 05:30 morning block does not shrink, it disappears. It
 * is kept here anyway rather than deleted, for two reasons — it is real on any day
 * without a formation, and it should be visible as LOST on the days it dies rather than
 * quietly absent from a template that never promised it. See dutyDay.ts.
 */
export const DEFAULT_DAY_TEMPLATE: TemplateBlock[] = [
  {
    key: 'am_deep',
    label: 'Morning deep work — LSAT',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: hm(5, 30),
    endMinute: hm(7, 0),
    nodeId: 'lsat',
    demand: 'high',
    purpose:
      'Hardest cognitive work before the day can take it from you — on any day the ' +
      'Army has not already taken it. Erased entirely by a pre-dawn formation.',
  },
  {
    key: 'pm_drill',
    label: 'Evening drill — LSAT',
    weekdays: [1, 2, 3, 4, 5],
    startMinute: hm(19, 30),
    endMinute: hm(20, 45),
    nodeId: 'lsat',
    demand: 'high',
    purpose:
      'Second pass: drilling and the error log, when fresh thinking is gone. On a duty ' +
      'day this is not the second block, it is the ONLY one — 75 minutes after a ' +
      '13-hour day, which is the real weekday capacity rather than the planned one.',
  },
  {
    key: 'admin',
    label: 'Admin and money',
    weekdays: [1, 3, 5],
    startMinute: hm(20, 45),
    endMinute: hm(21, 15),
    nodeId: 'money',
    /**
     * Medium, not low. Money admin is not hard thinking but it is unforgiving of
     * mistakes, and you specifically named admin alongside LSAT as what a tired day
     * cannot face.
     */
    demand: 'medium',
    purpose: 'Paperwork, allocations, the things that rot silently.',
  },
  {
    key: 'sat_long',
    label: 'Saturday long block',
    weekdays: [6],
    startMinute: hm(8, 0),
    endMinute: hm(12, 0),
    nodeId: 'lsat',
    demand: 'high',
    /** The only block in the week long enough to hold one, and it does not divide. */
    atomic: true,
    purpose: 'Full timed practice tests. The only slot long enough for one.',
  },
  {
    key: 'sun_long',
    label: 'Sunday long block',
    weekdays: [0],
    startMinute: hm(9, 0),
    endMinute: hm(13, 0),
    nodeId: 'lsat',
    demand: 'high',
    /**
     * A SECOND home for the full timed practice test, and the reason it exists is the
     * range Saturday: with one atomic block in the week, a single weekend duty day cost
     * the capability outright. Two makes the week survive losing one.
     *
     * Redundancy rather than more work — the two are not both used in a normal week.
     * Sunday is the fallback, and on a week where Saturday holds, Sunday is drilling.
     */
    atomic: true,
    purpose: 'Fallback slot for a full timed test when Saturday goes to duty. Otherwise drilling.',
  },
  {
    key: 'sun_review',
    label: 'Sunday review and reset',
    weekdays: [0],
    /**
     * AFTER the long block, not before. The error log is worth most immediately after a
     * timed test, while the wrong answers are still yours rather than a stranger's.
     */
    startMinute: hm(15, 0),
    endMinute: hm(16, 30),
    nodeId: null,
    /** Reviewing is lighter than doing, which is why it survives a bad Sunday. */
    demand: 'low',
    purpose: 'Error log while the test is fresh, week ahead, anything the week dropped.',
  },
]

export interface TemplateInterval {
  block: TemplateBlock
  start: Date
  end: Date
  minutes: number
}

function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** The template's blocks for one local date, as real instants. */
export function templateIntervalsFor(
  zone: IanaZone,
  date: LocalDate,
  template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE,
): TemplateInterval[] {
  const dow = weekdayOf(date)
  const dayStart = startOfLocalDay(zone, date).getTime()

  return template
    .filter((b) => b.weekdays.includes(dow))
    .map((b) => ({
      block: b,
      start: new Date(dayStart + b.startMinute * 60_000),
      end: new Date(dayStart + b.endMinute * 60_000),
      minutes: b.endMinute - b.startMinute,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * Template blocks with commitment time carved out.
 *
 * A template block is an intention, not a reservation — drill outranks it. Returning
 * the survivors rather than the originals is what makes "Army ran three hours long"
 * shrink the study block instead of double-booking it.
 */
export function survivingIntervals(
  intervals: TemplateInterval[],
  commitments: Commitment[],
  minMinutes = 20,
): TemplateInterval[] {
  const busy = commitments
    .map((c) => ({ start: c.startsAt.getTime(), end: c.endsAt.getTime() }))
    .sort((a, b) => a.start - b.start)

  const out: TemplateInterval[] = []

  for (const interval of intervals) {
    let segments = [{ start: interval.start.getTime(), end: interval.end.getTime() }]

    for (const b of busy) {
      const next: typeof segments = []
      for (const seg of segments) {
        if (b.end <= seg.start || b.start >= seg.end) {
          next.push(seg)
          continue
        }
        if (b.start > seg.start) next.push({ start: seg.start, end: Math.min(b.start, seg.end) })
        if (b.end < seg.end) next.push({ start: Math.max(b.end, seg.start), end: seg.end })
      }
      segments = next
    }

    for (const seg of segments) {
      const minutes = Math.round((seg.end - seg.start) / 60_000)
      if (minutes < minMinutes) continue
      out.push({
        block: interval.block,
        start: new Date(seg.start),
        end: new Date(seg.end),
        minutes,
      })
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export interface TemplateFill {
  interval: TemplateInterval
  items: { item: Item; minutes: number }[]
  unusedMinutes: number
}

/**
 * Fill each surviving block from the queue, respecting the block's domain.
 *
 * Order within a block follows the queue, never a packing heuristic. A block whose
 * domain has nothing queued is left empty and reported as such rather than
 * back-filled with unrelated work — an empty 05:30 LSAT block is a real signal that
 * the LSAT queue is dry, and hiding it behind busywork destroys that signal.
 */
export function fillTemplate(
  intervals: TemplateInterval[],
  orderedItems: Item[],
  isInDomain: (item: Item, nodeId: string) => boolean,
  minChunkMinutes = 20,
): { fills: TemplateFill[]; placedItemIds: Set<string> } {
  const placedItemIds = new Set<string>()
  const fills: TemplateFill[] = []

  for (const interval of intervals) {
    let remaining = interval.minutes
    const items: TemplateFill['items'] = []

    for (const item of orderedItems) {
      if (placedItemIds.has(item.id)) continue
      if (remaining < minChunkMinutes) break
      if (interval.block.nodeId && !isInDomain(item, interval.block.nodeId)) continue

      const minutes = Math.min(item.effortMinutes, remaining)
      if (minutes < minChunkMinutes && minutes < item.effortMinutes) continue

      items.push({ item, minutes })
      placedItemIds.add(item.id)
      remaining -= minutes
    }

    fills.push({ interval, items, unusedMinutes: remaining })
  }

  return { fills, placedItemIds }
}

/** Total minutes a template offers in a week, before commitments take their cut. */
export function weeklyTemplateMinutes(template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE): number {
  return template.reduce((sum, b) => sum + (b.endMinute - b.startMinute) * b.weekdays.length, 0)
}
