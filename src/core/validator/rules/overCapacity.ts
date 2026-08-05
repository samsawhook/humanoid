import type { Proposal, World } from '../../types.js'
import { domainOf, indexNodes } from '../../tree.js'
import { budgetFor } from '../../capacity/budgets.js'
import { localDayAt } from '../../time/timezonePeriods.js'
import { startOfIsoWeek } from '../../time/localDay.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Does the proposed week actually fit in the week.
 *
 * Proposed work is bucketed by ISO week and by domain — the life-level ancestor of
 * whatever the block's item hangs off — and compared against that domain's ceiling.
 * Blocks whose item has no domain are reported separately rather than being quietly
 * excluded, because unattributable work escaping every ceiling is precisely the bug
 * this rule exists to catch.
 *
 * Note this rule never complains about being *under* budget. See budgets.ts.
 */
export function overCapacity(world: World, proposal: Proposal): Violation[] {
  const out: Violation[] = []
  const byId = indexNodes(world.nodes)
  const itemsById = new Map(world.items.map((i) => [i.id, i]))

  /** week start → domain node id → minutes */
  const buckets = new Map<string, Map<string, number>>()
  const unattributed = new Map<string, number>()

  for (const block of proposal.blocks) {
    if (!block.itemId) continue // commitments consume capacity but aren't budgeted against it
    const minutes = (block.endsAt.getTime() - block.startsAt.getTime()) / 60_000
    if (minutes <= 0) continue

    const item = itemsById.get(block.itemId)
    if (!item) {
      out.push({
        code: VIOLATION_CODES.UNKNOWN_REFERENCE,
        severity: 'hard',
        message: `Proposed block references item ${block.itemId}, which does not exist.`,
        subjectType: 'block',
        subjectId: block.itemId,
      })
      continue
    }

    const day = localDayAt(world.timezonePeriods, block.startsAt)
    const week = startOfIsoWeek(day)
    const domain = item.nodeId ? domainOf(byId, item.nodeId) : null

    if (!domain) {
      unattributed.set(week, (unattributed.get(week) ?? 0) + minutes)
      continue
    }

    const byDomain = buckets.get(week) ?? new Map<string, number>()
    byDomain.set(domain.id, (byDomain.get(domain.id) ?? 0) + minutes)
    buckets.set(week, byDomain)
  }

  for (const [week, byDomain] of buckets) {
    for (const [domainId, minutes] of byDomain) {
      const budget = budgetFor(world.capacityBudgets, domainId, week)
      if (!budget) continue // no ceiling declared; emptyState already flagged the absence

      const proposedHours = minutes / 60
      if (proposedHours > budget.hoursPerWeek) {
        const domain = byId.get(domainId)
        out.push({
          code: VIOLATION_CODES.OVER_CAPACITY,
          severity: 'hard',
          message:
            `Week of ${week}: ${proposedHours.toFixed(1)}h proposed against ` +
            `"${domain?.title ?? domainId}", ceiling is ${budget.hoursPerWeek}h. ` +
            `Over by ${(proposedHours - budget.hoursPerWeek).toFixed(1)}h.`,
          subjectType: 'budget',
          subjectId: domainId,
          details: {
            week,
            proposedHours: round1(proposedHours),
            ceilingHours: budget.hoursPerWeek,
            overByHours: round1(proposedHours - budget.hoursPerWeek),
          },
        })
      }
    }
  }

  for (const [week, minutes] of unattributed) {
    out.push({
      code: VIOLATION_CODES.OVER_CAPACITY,
      severity: 'soft',
      message:
        `Week of ${week}: ${round1(minutes / 60)}h of proposed work belongs to no ` +
        'domain, so it is not checked against any ceiling. Attach those items to a node.',
      subjectType: 'budget',
      subjectId: null,
      details: { week, unattributedHours: round1(minutes / 60) },
    })
  }

  return out
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
