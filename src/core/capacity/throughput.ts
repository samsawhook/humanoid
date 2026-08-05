/**
 * Demonstrated capacity — what you actually did, as opposed to what you said you could.
 *
 * Per LIFE_DASH.md D1, declared budgets are a starting guess and get superseded by
 * measurement once enough of it exists. The verdict always states which source it used,
 * so a plan is never silently built on a number nobody has checked.
 *
 * This is the ONLY sanctioned use of completion data. It is not a score, it is never
 * ranked on, and it never appears as a headline metric — it exists so that plans are
 * built on what you demonstrably do rather than on optimism.
 */

import type { CapacitySource, World } from '../types'
import { startOfIsoWeek } from '../time/localDay'

export interface ThroughputEstimate {
  hoursPerWeek: number
  source: CapacitySource
  /** Weeks of outcome data the estimate is built from. */
  weeksObserved: number
}

/**
 * Median weekly hours actually delivered against a domain.
 *
 * Median rather than mean: one drill weekend or one flu should not redefine what a
 * normal week looks like in either direction.
 */
export function demonstratedHoursPerWeek(
  world: World,
  itemIdsInDomain: Set<string>,
  declaredHoursPerWeek: number | null,
): ThroughputEstimate {
  const byWeek = new Map<string, number>()

  for (const outcome of world.outcomes) {
    if (!outcome.itemId || !itemIdsInDomain.has(outcome.itemId)) continue
    if (outcome.actualMinutes === null || outcome.actualMinutes <= 0) continue
    const week = startOfIsoWeek(outcome.localDate)
    byWeek.set(week, (byWeek.get(week) ?? 0) + outcome.actualMinutes / 60)
  }

  const weeksObserved = byWeek.size
  if (weeksObserved < world.planningParams.minPeriodsForThroughput) {
    return {
      hoursPerWeek: declaredHoursPerWeek ?? 0,
      source: 'declared',
      weeksObserved,
    }
  }

  const weekly = [...byWeek.values()].sort((a, b) => a - b)
  return { hoursPerWeek: median(weekly), source: 'demonstrated', weeksObserved }
}

/**
 * How wrong effort estimates run, as a multiplier.
 *
 * 1.4 means work takes forty percent longer than estimated, and future estimates for
 * that domain should be scaled up accordingly. Returns 1 until there is enough paired
 * data to say anything, because a made-up correction is worse than none.
 */
export function estimationCalibration(
  world: World,
  itemIdsInDomain: Set<string>,
  minPairs = 5,
): number {
  const ratios: number[] = []
  const itemsById = new Map(world.items.map((i) => [i.id, i]))

  for (const outcome of world.outcomes) {
    if (outcome.status !== 'completed') continue
    if (!outcome.itemId || !itemIdsInDomain.has(outcome.itemId)) continue
    if (outcome.actualMinutes === null || outcome.actualMinutes <= 0) continue
    const item = itemsById.get(outcome.itemId)
    if (!item || item.effortMinutes <= 0) continue
    ratios.push(outcome.actualMinutes / item.effortMinutes)
  }

  if (ratios.length < minPairs) return 1
  return median(ratios.sort((a, b) => a - b))
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}
