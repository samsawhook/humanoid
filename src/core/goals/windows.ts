/**
 * Ranking by closure risk, not by due date.
 *
 * The spec is explicit that this ranking "will look nothing like a normal to-do
 * list; that is the point." A deadline slips. A window shuts. So the ordering is
 * driven by how soon a window closes, how irreversible the thing is, and how much
 * of the remaining time is already consumed — not by what is due next.
 */

import type { GoalNode, LocalDate } from '../types'
import { compareLocalDates, localDaysBetween } from '../time/localDay'

export interface ClosureRisk {
  node: GoalNode
  daysUntilClose: number | null
  /** Fraction of the window already elapsed, 0–1. Null when it has not opened. */
  elapsed: number | null
  score: number
  reason: string
}

/**
 * Higher is more urgent. Deliberately simple and legible — a scoring function you
 * cannot read is a scoring function you will not trust in a year.
 */
export function closureRisk(nodes: GoalNode[], today: LocalDate): ClosureRisk[] {
  const out: ClosureRisk[] = []

  for (const node of nodes) {
    if (node.status !== 'active') continue
    if (!node.windowClose) continue

    const daysUntilClose = localDaysBetween(today, node.windowClose)
    if (daysUntilClose < 0) continue

    const open = node.windowOpen
    const total = open ? localDaysBetween(open, node.windowClose) : null
    const gone = open ? localDaysBetween(open, today) : null
    const elapsed =
      total && total > 0 && gone !== null ? Math.min(1, Math.max(0, gone / total)) : null

    // Urgency decays with time remaining; a year out is barely urgent, a month is.
    const proximity = 365 / (daysUntilClose + 30)
    // Irreversible windows deserve disproportionate planning effort.
    const irreversibility = node.reversible ? 1 : 1.8
    // A window already mostly gone is worse than one that just opened.
    const burn = elapsed === null ? 1 : 1 + elapsed

    const notOpen = open ? compareLocalDates(today, open) < 0 : false

    out.push({
      node,
      daysUntilClose,
      elapsed,
      score: proximity * irreversibility * burn,
      reason: notOpen
        ? `Opens ${open}, shuts ${node.windowClose}.`
        : elapsed !== null
          ? `${Math.round(elapsed * 100)}% of the window is already gone.`
          : `Shuts ${node.windowClose}.`,
    })
  }

  return out.sort((a, b) => b.score - a.score)
}
