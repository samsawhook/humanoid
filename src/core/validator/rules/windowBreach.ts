import type { GoalNode, Proposal, World } from '../../types.js'
import { ancestorsOf, indexNodes } from '../../tree.js'
import { compareLocalDates, localDaysBetween } from '../../time/localDay.js'
import { localDayAt } from '../../time/timezonePeriods.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Windows, not deadlines.
 *
 * A deadline can be missed and rescheduled. A window can only be missed. LSAT
 * administrations, an application cycle where September and February are not the same
 * application, CZTE eligibility that exists only inside a deployment — none of these
 * are due dates, and ranking them like due dates gets them wrong.
 *
 * Two checks here:
 *   WINDOW_BREACH       — work scheduled outside the window it belongs to.
 *   WINDOW_CLOSURE_RISK — the window closes before the node can plausibly get there.
 *
 * The second one is the important one, and per LIFE_DASH.md R1 it deliberately
 * bypasses the propagation threshold. Waiting three consecutive periods to escalate is
 * right for noise and wrong for a closing window: three quarters is nine months, and
 * an application cycle can close inside it. Noise suppression must never suppress an
 * irreversible miss.
 */
export function windowBreach(world: World, proposal: Proposal): Violation[] {
  const out: Violation[] = []
  const byId = indexNodes(world.nodes)
  const itemsById = new Map(world.items.map((i) => [i.id, i]))
  const today = localDayAt(world.timezonePeriods, world.now)

  for (const block of proposal.blocks) {
    if (!block.itemId) continue
    const item = itemsById.get(block.itemId)
    if (!item?.nodeId) continue

    const day = localDayAt(world.timezonePeriods, block.startsAt)
    const node = byId.get(item.nodeId)
    if (!node) continue

    // A node inherits its ancestors' windows: work on a sub-goal of a campaign that
    // has closed is just as breached as work on the campaign itself.
    for (const scope of [node, ...ancestorsOf(byId, node.id)]) {
      const breach = breaches(scope, day)
      if (!breach) continue
      out.push({
        code: VIOLATION_CODES.WINDOW_BREACH,
        severity: 'hard',
        message:
          `"${item.title}" is scheduled on ${day}, ${breach} the window for ` +
          `"${scope.title}" (${scope.windowOpen ?? '—'} → ${scope.windowClose ?? '—'}).`,
        subjectType: 'item',
        subjectId: item.id,
        details: {
          scheduledOn: day,
          nodeId: scope.id,
          windowOpen: scope.windowOpen,
          windowClose: scope.windowClose,
        },
      })
      break // report the nearest breached scope only
    }
  }

  for (const node of world.nodes) {
    if (node.status !== 'active') continue
    if (!node.windowClose) continue
    if (compareLocalDates(node.windowClose, today) < 0) continue

    const daysLeft = localDaysBetween(today, node.windowClose)
    const remaining = remainingWork(world, node)
    if (remaining.items === 0) continue

    // Hours available before the window shuts, at the ceiling for this domain. This is
    // an upper bound on what is physically possible, not a forecast.
    const weeksLeft = Math.max(daysLeft / 7, 0)
    const ceiling = ceilingHoursPerWeek(world, node)
    if (ceiling === null) continue

    const possibleHours = weeksLeft * ceiling
    if (remaining.hours > possibleHours) {
      out.push({
        code: VIOLATION_CODES.WINDOW_CLOSURE_RISK,
        severity: 'hard',
        message:
          `"${node.title}" has ${remaining.hours.toFixed(1)}h of work left and its ` +
          `window closes in ${daysLeft} days. At the ceiling for this domain ` +
          `(${ceiling}h/wk) only ${possibleHours.toFixed(1)}h are physically available. ` +
          (node.reversible
            ? 'This window will close unmet.'
            : 'This is an irreversible node — it deserves disproportionate planning effort now.'),
        subjectType: 'node',
        subjectId: node.id,
        details: {
          daysLeft,
          remainingHours: round1(remaining.hours),
          possibleHours: round1(possibleHours),
          ceilingHoursPerWeek: ceiling,
          reversible: node.reversible,
        },
      })
    }
  }

  return out
}

function breaches(node: GoalNode, day: string): string | null {
  if (node.windowOpen && compareLocalDates(day, node.windowOpen) < 0) return 'before'
  if (node.windowClose && compareLocalDates(day, node.windowClose) > 0) return 'after'
  return null
}

function remainingWork(world: World, node: GoalNode): { hours: number; items: number } {
  const descendants = new Set<string>([node.id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of world.nodes) {
      if (n.parentId && descendants.has(n.parentId) && !descendants.has(n.id)) {
        descendants.add(n.id)
        grew = true
      }
    }
  }

  const open = world.items.filter(
    (i) => i.nodeId && descendants.has(i.nodeId) && i.status !== 'done' && i.status !== 'dropped',
  )
  return {
    hours: open.reduce((sum, i) => sum + i.effortMinutes, 0) / 60,
    items: open.length,
  }
}

function ceilingHoursPerWeek(world: World, node: GoalNode): number | null {
  const byId = indexNodes(world.nodes)
  const chain = [node, ...ancestorsOf(byId, node.id)]
  const domain = chain.find((n) => n.level === 'life')
  if (!domain) return null
  const budget = world.capacityBudgets.find((b) => b.nodeId === domain.id)
  return budget?.hoursPerWeek ?? null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
