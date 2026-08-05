/**
 * Every violation the validator can emit, in one place.
 *
 * The validator never returns a boolean. "Infeasible" is useless to the model and
 * useless to you a year from now; a named violation with a subject is actionable by
 * both. Codes are stable strings — they get persisted to `plan_violations` and read
 * back later, so renaming one is a migration, not a refactor.
 */

export const VIOLATION_CODES = {
  /** Proposed work exceeds a domain's weekly capacity ceiling. */
  OVER_CAPACITY: 'OVER_CAPACITY',
  /** Two blocks overlap and at least one of them is firm. */
  FIXED_CONFLICT: 'FIXED_CONFLICT',
  /** Work scheduled outside the window it belongs to. */
  WINDOW_BREACH: 'WINDOW_BREACH',
  /**
   * A window will close before its node can reach its target at the current rate.
   * This one bypasses the propagation threshold — see LIFE_DASH.md R1. A deadline
   * can be missed and rescheduled; a window can only be missed.
   */
  WINDOW_CLOSURE_RISK: 'WINDOW_CLOSURE_RISK',
  /** A non-life node with no parent, or a parent id that resolves to nothing. */
  ORPHAN_NODE: 'ORPHAN_NODE',
  /** Required output rate cannot be delivered in the hours that remain. */
  UNREACHABLE_VELOCITY: 'UNREACHABLE_VELOCITY',
  /** Dependency edges form a cycle. */
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  /** A dependency's predecessor has not been achieved but its successor is scheduled. */
  DEPENDENCY_VIOLATION: 'DEPENDENCY_VIOLATION',
  /**
   * An achievement node without a stated output, or one whose "output" is time spent.
   * Goals are defined by output, never by hours. See LIFE_DASH.md D2.
   */
  MISSING_OUTCOME_DEFINITION: 'MISSING_OUTCOME_DEFINITION',
  /** Not enough of the world exists yet to plan against. */
  EMPTY_STATE: 'EMPTY_STATE',
  /** A child node sits at a coarser level than its parent. */
  LEVEL_INVERSION: 'LEVEL_INVERSION',
  /** The plan fits the declared budget but not demonstrated throughput. */
  OPTIMISTIC_VS_DEMONSTRATED: 'OPTIMISTIC_VS_DEMONSTRATED',
  /** A proposed block references an item or commitment that does not exist. */
  UNKNOWN_REFERENCE: 'UNKNOWN_REFERENCE',
} as const

export type ViolationCode = (typeof VIOLATION_CODES)[keyof typeof VIOLATION_CODES]

/**
 * `hard` blocks a plan from activating. `soft` is surfaced and narrated but does not
 * block — most notably OPTIMISTIC_VS_DEMONSTRATED, which is information about how
 * likely the plan is to survive contact, not a reason to refuse it.
 */
export type Severity = 'hard' | 'soft'

export type SubjectType =
  | 'node'
  | 'milestone'
  | 'item'
  | 'commitment'
  | 'block'
  | 'budget'
  | 'world'

export interface Violation {
  code: ViolationCode
  severity: Severity
  /** Written for a human reading it tired, a year from now. Include the numbers. */
  message: string
  subjectType: SubjectType
  subjectId: string | null
  details?: Record<string, unknown>
}

export function violation(v: Violation): Violation {
  return v
}
