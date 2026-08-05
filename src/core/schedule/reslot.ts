/**
 * Deterministic day re-slotting. No model call, ever.
 *
 * "Army ran three hours long" must reshuffle the day without asking a language model
 * anything — it is arithmetic over intervals, models lose totals across many items,
 * and it has to work on a bad connection at 0500. This file is the whole of it.
 *
 * Pure. No clock, no database.
 */

import type { Commitment, Firmness, IanaZone, Item, LocalDate } from '../types'
import { endOfLocalDay, startOfLocalDay } from '../time/localDay'

export interface FreeInterval {
  start: Date
  end: Date
  minutes: number
}

export interface SlottedBlock {
  itemId: string | null
  commitmentId: string | null
  title: string
  start: Date
  end: Date
  firmness: Firmness
}

export interface DaySlotting {
  localDate: LocalDate
  blocks: SlottedBlock[]
  /** Ordered items that did not fit. Never silently dropped. */
  unplaced: { itemId: string; title: string; effortMinutes: number }[]
  freeMinutes: number
  usedMinutes: number
}

export interface WakingHours {
  /** Minutes after local midnight the day becomes usable. 06:00 → 360. */
  startMinute: number
  /** Minutes after local midnight it stops. 22:00 → 1320. */
  endMinute: number
}

export const DEFAULT_WAKING: WakingHours = { startMinute: 6 * 60, endMinute: 22 * 60 }

/**
 * What is left of a day after commitments take their cut.
 *
 * Commitments consume capacity before anything else is allocated, which is what makes
 * an overrun propagate correctly instead of just producing an overfull day.
 */
export function freeIntervals(
  zone: IanaZone,
  date: LocalDate,
  commitments: Commitment[],
  waking: WakingHours = DEFAULT_WAKING,
): FreeInterval[] {
  const dayStart = startOfLocalDay(zone, date).getTime()
  const dayEnd = endOfLocalDay(zone, date).getTime()

  const windowStart = dayStart + waking.startMinute * 60_000
  const windowEnd = Math.min(dayStart + waking.endMinute * 60_000, dayEnd)
  if (windowEnd <= windowStart) return []

  const busy = commitments
    .map((c) => ({
      start: Math.max(c.startsAt.getTime(), windowStart),
      end: Math.min(c.endsAt.getTime(), windowEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  // Merge overlapping commitments so a double-booking does not double-subtract.
  const merged: { start: number; end: number }[] = []
  for (const b of busy) {
    const last = merged[merged.length - 1]
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
    else merged.push({ ...b })
  }

  const free: FreeInterval[] = []
  let cursor = windowStart
  for (const b of merged) {
    if (b.start > cursor) {
      free.push({
        start: new Date(cursor),
        end: new Date(b.start),
        minutes: Math.round((b.start - cursor) / 60_000),
      })
    }
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < windowEnd) {
    free.push({
      start: new Date(cursor),
      end: new Date(windowEnd),
      minutes: Math.round((windowEnd - cursor) / 60_000),
    })
  }

  return free
}

/**
 * Place an ordered queue into whatever time the day actually has.
 *
 * First-fit in queue order, never reordering to improve packing — the queue order is a
 * judgement about what matters, and silently resequencing it to fit one more task is
 * exactly the optimisation this system is supposed to refuse. Items that do not fit
 * are returned as `unplaced` rather than dropped.
 *
 * `minChunkMinutes` stops the day being shredded into useless fragments.
 */
export function reslotDay(
  zone: IanaZone,
  date: LocalDate,
  orderedItems: Item[],
  commitments: Commitment[],
  waking: WakingHours = DEFAULT_WAKING,
  minChunkMinutes = 20,
): DaySlotting {
  const free = freeIntervals(zone, date, commitments, waking)
  const blocks: SlottedBlock[] = commitments
    .filter((c) => c.endsAt > startOfLocalDay(zone, date) && c.startsAt < endOfLocalDay(zone, date))
    .map((c) => ({
      itemId: null,
      commitmentId: c.id,
      title: c.title,
      start: c.startsAt,
      end: c.endsAt,
      firmness: 'firm' as const,
    }))

  const remaining = free.map((f) => ({ start: f.start.getTime(), end: f.end.getTime() }))
  const unplaced: DaySlotting['unplaced'] = []
  let usedMinutes = 0

  for (const item of orderedItems) {
    let placed = false
    for (const slot of remaining) {
      const available = Math.round((slot.end - slot.start) / 60_000)
      if (available < Math.min(item.effortMinutes, minChunkMinutes)) continue

      const take = Math.min(item.effortMinutes, available)
      if (take < minChunkMinutes && take < item.effortMinutes) continue

      const start = new Date(slot.start)
      const end = new Date(slot.start + take * 60_000)
      blocks.push({
        itemId: item.id,
        commitmentId: null,
        title: item.title,
        start,
        end,
        firmness: item.autopilotCritical || item.dateFlexibility === 'fixed' ? 'firm' : 'soft',
      })
      slot.start = end.getTime()
      usedMinutes += take
      placed = true

      // Partial placement still counts as placed; the remainder rolls to another day
      // rather than being silently split across a commitment.
      break
    }
    if (!placed) {
      unplaced.push({ itemId: item.id, title: item.title, effortMinutes: item.effortMinutes })
    }
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime())

  return {
    localDate: date,
    blocks,
    unplaced,
    freeMinutes: free.reduce((s, f) => s + f.minutes, 0),
    usedMinutes,
  }
}
