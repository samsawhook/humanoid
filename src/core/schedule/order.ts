/**
 * Ordering the day's queue.
 *
 * The digest is an ordered queue, not a timetable, because free time is exogenous —
 * its size is unknown until the day happens. So the deliverable is "what to reach for
 * next", and the ordering has to be defensible without knowing how much time exists.
 *
 * Pure. No clock, no database.
 */

import type { GoalNode, Item, LocalDate } from '../types'
import { compareLocalDates, localDaysBetween } from '../time/localDay'
import { ancestorsOf, indexNodes } from '../tree'

export interface RankedItem {
  item: Item
  score: number
  /** Written for a human. Shown in the digest so the ordering is never mysterious. */
  reason: string
  pinned: boolean
}

/**
 * Rank the queue for a given day.
 *
 * Autopilot-critical items pin to the top unconditionally — they are the things that
 * must still happen when the system is being ignored, and no scoring function should
 * be able to bury them. Everything else is ranked by closure risk of the node it
 * serves, then by its own due date.
 */
export function orderQueue(
  items: Item[],
  nodes: GoalNode[],
  today: LocalDate,
): RankedItem[] {
  const byId = indexNodes(nodes)

  const open = items.filter((i) => i.status !== 'done' && i.status !== 'dropped')

  const ranked = open.map((item): RankedItem => {
    if (item.autopilotCritical) {
      return {
        item,
        score: Number.POSITIVE_INFINITY,
        reason: 'Autopilot-critical — happens regardless.',
        pinned: true,
      }
    }

    const node = item.nodeId ? byId.get(item.nodeId) : undefined
    const scope = node ? [node, ...ancestorsOf(byId, node.id)] : []

    // Nearest window close anywhere up the chain.
    let daysToClose: number | null = null
    let closingTitle = ''
    for (const n of scope) {
      if (!n.windowClose) continue
      const d = localDaysBetween(today, n.windowClose)
      if (d < 0) continue
      if (daysToClose === null || d < daysToClose) {
        daysToClose = d
        closingTitle = n.title
      }
    }

    let score = 0
    const reasons: string[] = []

    if (daysToClose !== null) {
      score += 3650 / (daysToClose + 10)
      reasons.push(`"${closingTitle}" shuts in ${daysToClose}d`)
    }

    if (item.dueAt) {
      const due = item.dueAt.toISOString().slice(0, 10)
      const d = localDaysBetween(today, due)
      score += d <= 0 ? 400 : 300 / (d + 3)
      reasons.push(d < 0 ? `overdue ${-d}d` : d === 0 ? 'due today' : `due in ${d}d`)
    }

    if (node && !node.reversible) {
      score *= 1.6
      reasons.push('irreversible')
    }

    if (item.priorityHint) {
      score += item.priorityHint
      reasons.push('hand-prioritised')
    }

    // A short item that unblocks nothing still beats an idle slot; break ties toward
    // finishing things rather than starting them.
    score += Math.max(0, 60 - item.effortMinutes) / 100

    return {
      item,
      score,
      reason: reasons.join(' · ') || 'No window or due date — background work.',
      pinned: false,
    }
  })

  return ranked.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return a.item.title.localeCompare(b.item.title)
  })
}

/** Items whose earliest start has not arrived, or that are blocked. Excluded from the queue. */
export function notYetActionable(items: Item[], today: LocalDate): Item[] {
  return items.filter((i) => {
    if (i.status === 'blocked') return true
    if (!i.earliestStartAt) return false
    return compareLocalDates(i.earliestStartAt.toISOString().slice(0, 10), today) > 0
  })
}
