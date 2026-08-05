import type { World, Proposal } from '../../types.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Enough of the world must exist before a plan means anything.
 *
 * This runs first and is the reason no other rule needs defensive null checks against
 * a blank database. A brand-new install returns violations, not a crash and not a
 * confidently empty "feasible" verdict — which would be the worst possible answer.
 */
export function emptyState(world: World, _proposal: Proposal): Violation[] {
  const out: Violation[] = []

  if (world.timezonePeriods.length === 0) {
    out.push({
      code: VIOLATION_CODES.EMPTY_STATE,
      severity: 'hard',
      message:
        'No timezone periods configured. Every local day in the system is resolved ' +
        'through these, so nothing can be scheduled until at least one exists.',
      subjectType: 'world',
      subjectId: null,
    })
  }

  if (world.nodes.length === 0) {
    out.push({
      code: VIOLATION_CODES.EMPTY_STATE,
      severity: 'hard',
      message: 'No goal nodes exist. There is nothing to plan toward.',
      subjectType: 'world',
      subjectId: null,
    })
  } else if (!world.nodes.some((n) => n.level === 'life')) {
    out.push({
      code: VIOLATION_CODES.EMPTY_STATE,
      severity: 'hard',
      message:
        'No life-level nodes exist. Life nodes are the domains that carry capacity ' +
        'budgets, so without one nothing can be checked against a ceiling.',
      subjectType: 'world',
      subjectId: null,
    })
  }

  if (world.capacityBudgets.length === 0) {
    out.push({
      code: VIOLATION_CODES.EMPTY_STATE,
      severity: 'soft',
      message:
        'No capacity budgets configured. Feasibility cannot be checked against a ' +
        'ceiling, so this plan is unvalidated rather than approved.',
      subjectType: 'world',
      subjectId: null,
    })
  }

  return out
}
