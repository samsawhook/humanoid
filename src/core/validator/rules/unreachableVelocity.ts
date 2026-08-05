import type { GoalNode, Proposal, VelocityPeriod, World } from '../../types.js'
import { ancestorsOf, indexNodes, itemsUnder } from '../../tree.js'
import { demonstratedHoursPerWeek, estimationCalibration } from '../../capacity/throughput.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/** Weeks in a velocity period. Averaged; nothing here needs calendar precision. */
const WEEKS_PER_PERIOD: Record<VelocityPeriod, number> = {
  week: 1,
  month: 4.345,
  quarter: 13.043,
  year: 52.179,
}

/**
 * Can the required output rate actually be delivered.
 *
 * The required velocity is a rate of OUTPUT — applications submitted, courses passed,
 * practice-test points. Converting that to hours is a separate, explicitly-labelled
 * estimation step, done here and nowhere else, using the effort estimates on the items
 * that hang off the node and corrected by how wrong past estimates ran.
 *
 * This is the only place in the system where output rate meets hours, and the number
 * it produces is always flagged with the source it came from. The model never does
 * this arithmetic; it reads the result.
 */
export function unreachableVelocity(world: World, _proposal: Proposal): Violation[] {
  const out: Violation[] = []
  const byId = indexNodes(world.nodes)

  for (const node of world.nodes) {
    if (node.status !== 'active') continue
    const velocity = node.requiredVelocity
    if (!velocity || velocity.amount <= 0) continue

    const domain = [node, ...ancestorsOf(byId, node.id)].find((n) => n.level === 'life')
    if (!domain) continue // ORPHAN_NODE already covers this

    const openItems = itemsUnder(world.nodes, world.items, node.id).filter(
      (i) => i.status !== 'done' && i.status !== 'dropped',
    )
    if (openItems.length === 0) continue // nothing decomposed yet; not yet checkable

    const remainingUnits = remainingUnits_(world, node, velocity.amount)
    if (remainingUnits <= 0) continue

    const domainItemIds = new Set(
      itemsUnder(world.nodes, world.items, domain.id).map((i) => i.id),
    )
    const calibration = estimationCalibration(world, domainItemIds)
    const estimatedHours =
      (openItems.reduce((sum, i) => sum + i.effortMinutes, 0) / 60) * calibration

    const hoursPerUnit = estimatedHours / remainingUnits
    const requiredHoursPerWeek =
      (velocity.amount / WEEKS_PER_PERIOD[velocity.period]) * hoursPerUnit

    const declared = world.capacityBudgets.find((b) => b.nodeId === domain.id) ?? null
    const capacity = demonstratedHoursPerWeek(
      world,
      domainItemIds,
      declared?.hoursPerWeek ?? null,
    )
    if (capacity.hoursPerWeek <= 0) continue // no ceiling and no history; emptyState covers it

    if (requiredHoursPerWeek > capacity.hoursPerWeek) {
        out.push({
        code: VIOLATION_CODES.UNREACHABLE_VELOCITY,
        severity: 'hard',
        message:
          `"${node.title}" requires ${velocity.amount} ${velocity.unitLabel} per ` +
          `${velocity.period}, which works out to about ` +
          `${requiredHoursPerWeek.toFixed(1)}h/wk. Capacity for "${domain.title}" is ` +
          `${capacity.hoursPerWeek.toFixed(1)}h/wk ` +
          `(${capacity.source}${
            capacity.source === 'demonstrated'
              ? `, ${capacity.weeksObserved} weeks observed`
              : ', no measured history yet'
          }). Short by ${(requiredHoursPerWeek - capacity.hoursPerWeek).toFixed(1)}h/wk.`,
        subjectType: 'node',
        subjectId: node.id,
        details: {
          requiredHoursPerWeek: round1(requiredHoursPerWeek),
          capacityHoursPerWeek: round1(capacity.hoursPerWeek),
          capacitySource: capacity.source,
          weeksObserved: capacity.weeksObserved,
          hoursPerUnit: round1(hoursPerUnit),
          calibration: round1(calibration),
        },
      })
      continue
    }

    // Fits the declared ceiling but not what you have actually been delivering.
    // Soft: information about whether the plan survives contact, not a veto.
    if (capacity.source === 'declared') {
      const measured = demonstratedHoursPerWeek(
        { ...world, planningParams: { ...world.planningParams, minPeriodsForThroughput: 1 } },
        domainItemIds,
        null,
      )
      if (
        measured.weeksObserved > 0 &&
        measured.hoursPerWeek > 0 &&
        requiredHoursPerWeek > measured.hoursPerWeek
      ) {
        out.push({
          code: VIOLATION_CODES.OPTIMISTIC_VS_DEMONSTRATED,
          severity: 'soft',
          message:
            `"${node.title}" fits the declared ceiling but not your measured pace: ` +
            `needs ${requiredHoursPerWeek.toFixed(1)}h/wk, you have been averaging ` +
            `${measured.hoursPerWeek.toFixed(1)}h/wk over ${measured.weeksObserved} week(s). ` +
            'Not enough history to bind yet, but this is the number to watch.',
          subjectType: 'node',
          subjectId: node.id,
          details: {
            requiredHoursPerWeek: round1(requiredHoursPerWeek),
            measuredHoursPerWeek: round1(measured.hoursPerWeek),
            weeksObserved: measured.weeksObserved,
          },
        })
      }
    }
  }

  return out
}

/**
 * Output still owed. Milestones are the countable unit when they exist, since they are
 * the stated stages of the node; otherwise fall back to the raw velocity amount.
 */
function remainingUnits_(world: World, node: GoalNode, fallback: number): number {
  const milestones = world.milestones.filter((m) => m.nodeId === node.id)
  if (milestones.length === 0) return fallback
  return milestones.filter((m) => m.achievedAt === null).length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
