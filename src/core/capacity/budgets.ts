/**
 * Capacity ceilings, and which one applies when.
 *
 * A budget is a CEILING, never a target. Per LIFE_DASH.md D4, the system will never
 * tell you to hit an hours number — the budget exists for exactly one job: letting the
 * validator say "this is impossible" instead of quietly producing a week with ninety
 * hours of work in it. A plan that comes in under budget is not a failure and is never
 * reported as one.
 *
 * Budgets are effective-dated because a deployment changes every one of them at once.
 */

import type { CapacityBudget, Commitment, LocalDate, World } from '../types'
import { compareLocalDates, endOfLocalDay, startOfLocalDay } from '../time/localDay'
import { resolveZoneAt } from '../time/timezonePeriods'

/** The budget in force for a domain on a given local date, if any. */
export function budgetFor(
  budgets: CapacityBudget[],
  nodeId: string,
  on: LocalDate,
): CapacityBudget | null {
  const applicable = budgets.filter(
    (b) =>
      b.nodeId === nodeId &&
      compareLocalDates(b.effectiveFrom, on) <= 0 &&
      (b.effectiveTo === null || compareLocalDates(on, b.effectiveTo) <= 0),
  )
  if (applicable.length === 0) return null

  // Most recently effective wins, so an overlapping correction supersedes cleanly.
  applicable.sort((a, b) => compareLocalDates(b.effectiveFrom, a.effectiveFrom))
  return applicable[0] ?? null
}

/**
 * Minutes an external commitment consumes inside a local day.
 *
 * Commitments are subtracted before anything else is allocated, which is what makes
 * "Army ran three hours long" propagate correctly rather than just producing an
 * over-full day.
 */
export function commitmentMinutesOnDay(
  world: World,
  commitments: Commitment[],
  day: LocalDate,
): number {
  const zone = resolveZoneAt(world.timezonePeriods, startOfLocalDay('UTC', day))
  const dayStart = startOfLocalDay(zone, day).getTime()
  const dayEnd = endOfLocalDay(zone, day).getTime()

  let minutes = 0
  for (const c of commitments) {
    const overlap =
      Math.min(c.endsAt.getTime(), dayEnd) - Math.max(c.startsAt.getTime(), dayStart)
    if (overlap > 0) minutes += overlap / 60_000
  }
  return Math.round(minutes)
}
