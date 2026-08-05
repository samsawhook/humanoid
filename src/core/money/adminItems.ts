/**
 * Turn each payday's manual transfers into schedulable work.
 *
 * The money view can tell you a transfer is due on the 1st, but a number on a
 * financial page is not a task — it does not appear in the queue, it does not consume
 * a block, and it does not survive a bad week. These become real items so the day
 * template's admin block has something concrete to fill with, and so a missed transfer
 * shows up in the same place as everything else you missed.
 *
 * Generated rather than stored: they are derived from the allocation, so they stay
 * correct when an obligation changes instead of drifting into a stale checklist.
 *
 * Pure. No clock, no database.
 */

import type { Item, LocalDate } from '../types'
import { paydayActions, type Allocation } from './allocation'

/** The node these hang off. Money is a life-level domain in the seed tree. */
export const ADMIN_NODE_SLUG = 'money'

/** Roughly how long moving one payment actually takes, including finding the app. */
const MINUTES_PER_ACTION = 6
const MINUTES_MINIMUM = 15

export interface AdminItemsResult {
  items: Item[]
  /** Paydays that need nothing done by hand. Useful to state, not to schedule. */
  clearPaydays: LocalDate[]
}

/**
 * One item per payday, not one per transfer.
 *
 * Six separate to-dos on the 1st is a list you learn to ignore; one item that says
 * "move five payments, $2,930" is a thing you do in a single sitting. The detail
 * lives in the notes, where it is available without cluttering the queue.
 */
export function adminItemsFor(
  allocations: Allocation[],
  nodeId: string = ADMIN_NODE_SLUG,
): AdminItemsResult {
  const items: Item[] = []
  const clearPaydays: LocalDate[] = []

  for (const allocation of allocations) {
    const actions = paydayActions(allocation)
    if (actions.length === 0) {
      clearPaydays.push(allocation.paycheck.payDate)
      continue
    }

    const total = round2(actions.reduce((s, a) => s + a.amount, 0))
    const partial = actions.filter((a) => a.partial)

    const notes = [
      ...actions.map(
        (a) =>
          `${a.label}: ${usd(a.amount)}${a.partial ? ` (SHORT ${usd(a.shortfall)})` : ''}` +
          (a.howTo ? ` — ${a.howTo}` : ''),
      ),
      ...(partial.length > 0
        ? [
            '',
            `${partial.length} of these is deliberately underpaid. That is a decision, not an oversight — if it is the wrong one, change the priorities in obligations.ts rather than quietly finding the money.`,
          ]
        : []),
    ].join('\n')

    items.push({
      id: `admin-${allocation.paycheck.scheduledDate}`,
      nodeId,
      milestoneId: null,
      title: `Move ${actions.length} payment${actions.length === 1 ? '' : 's'} — ${usd(total)}`,
      effortMinutes: Math.max(MINUTES_MINIMUM, actions.length * MINUTES_PER_ACTION),
      effortConfidence: 'high',
      // Due end of the day the money lands. Not before — the money is not there yet.
      dueAt: new Date(`${allocation.paycheck.payDate}T23:59:00Z`),
      earliestStartAt: new Date(`${allocation.paycheck.payDate}T00:00:00Z`),
      dateFlexibility: 'fixed',
      status: 'todo',
      /**
       * Pinned. A missed transfer on a mortgage in arrears is not a task that can roll
       * to tomorrow, and this is precisely the kind of thing that gets skipped in a bad
       * week — which is the definition of autopilot-critical.
       */
      autopilotCritical: true,
      priorityHint: 80,
      notes,
    })
  }

  return { items, clearPaydays }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
