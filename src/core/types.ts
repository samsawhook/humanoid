/**
 * Domain types for the pure core.
 *
 * These are deliberately NOT the Drizzle row types. The core must be readable and
 * testable without a database, and it must not break when a column is renamed.
 * `/src/db` maps rows onto these; everything under `/src/core` speaks only these.
 *
 * Nothing in this directory reads the clock, the network, or the database.
 */

/** A local calendar date, 'YYYY-MM-DD'. Never an instant. */
export type LocalDate = string

/** An IANA timezone name, e.g. 'America/Chicago'. Never an offset. */
export type IanaZone = string

export type NodeLevel = 'life' | 'decade' | 'campaign' | 'year' | 'quarter'
export type NodeKind = 'achievement' | 'state'
export type NodeStatus = 'active' | 'achieved' | 'abandoned' | 'deferred'

/**
 * Where a date came from, and therefore whether it binds.
 *
 * Only `external_fixed` is a real constraint — an LSAT administration, a drill
 * weekend, a registration deadline. `self_imposed` and `estimated` dates are
 * movable, and the planner is allowed to move them as long as it says so.
 */
export type DateBasis = 'external_fixed' | 'self_imposed' | 'estimated'
export type DateConfidence = 'low' | 'medium' | 'high'

/**
 * Units of OUTPUT, never of time.
 *
 * A goal is never "spend X hours on Y". Hours are a cost, estimated separately by
 * the validator to answer "does this fit" — they never define what a node is.
 */
export type VelocityUnit = 'milestones' | 'units' | 'currency' | 'rating_points'
export type VelocityPeriod = 'week' | 'month' | 'quarter' | 'year'

export interface RequiredVelocity {
  amount: number
  unit: VelocityUnit
  /** Human label, e.g. 'application components submitted'. For legibility only. */
  unitLabel: string
  period: VelocityPeriod
}

export interface GoalNode {
  id: string
  parentId: string | null
  title: string
  level: NodeLevel
  kind: NodeKind
  /**
   * What output counts as achieved. Required for `kind: 'achievement'`.
   * "Hours spent" is never a valid outcome definition; see MISSING_OUTCOME_DEFINITION.
   */
  outcomeDefinition: string | null
  targetDate: LocalDate | null
  dateBasis: DateBasis | null
  dateConfidence: DateConfidence | null
  windowOpen: LocalDate | null
  windowClose: LocalDate | null
  requiredVelocity: RequiredVelocity | null
  reversible: boolean
  status: NodeStatus
}

export type DependencyKind = 'finish_to_start' | 'gates_window'

export interface NodeDependency {
  predecessorId: string
  successorId: string
  kind: DependencyKind
}

export interface Milestone {
  id: string
  nodeId: string
  title: string
  outcomeDefinition: string | null
  sequence: number
  amount: number | null
  unitLabel: string | null
  targetDate: LocalDate | null
  dateBasis: DateBasis | null
  windowOpen: LocalDate | null
  windowClose: LocalDate | null
  achievedAt: Date | null
}

export type DateFlexibility = 'fixed' | 'elastic'
export type ItemStatus = 'todo' | 'doing' | 'done' | 'dropped' | 'blocked'
export type EffortConfidence = 'low' | 'medium' | 'high'

export interface Item {
  id: string
  nodeId: string | null
  milestoneId: string | null
  title: string
  /** An estimate. Corrected against `Outcome.actualMinutes` by the calibration pass. */
  effortMinutes: number
  effortConfidence: EffortConfidence
  dueAt: Date | null
  earliestStartAt: Date | null
  dateFlexibility: DateFlexibility
  status: ItemStatus
  /**
   * Must still happen when the system is being ignored — drill, medications, bills.
   * Anything whose consequence is non-recoverable. Bypasses ordering, pins
   * unconditionally.
   */
  autopilotCritical: boolean
}

export interface Commitment {
  id: string
  title: string
  nodeId: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
}

export interface CapacityBudget {
  /** Always a `level: 'life'` node — the domain. */
  nodeId: string
  /** A CEILING, never a target. Coming in under is not a failure and is never reported as one. */
  hoursPerWeek: number
  effectiveFrom: LocalDate
  effectiveTo: LocalDate | null
}

export type Firmness = 'firm' | 'soft'

export interface ScheduledBlock {
  id: string
  localDate: LocalDate
  startsAt: Date
  endsAt: Date
  itemId: string | null
  commitmentId: string | null
  firmness: Firmness
}

export type OutcomeStatus = 'completed' | 'partial' | 'skipped'

/**
 * Why something did not happen. The highest-value signal in the system:
 * `external_overrun` and `didnt_want_to` imply opposite corrections.
 */
export type SkipReason =
  | 'external_overrun'
  | 'no_time'
  | 'didnt_want_to'
  | 'did_something_else'
  | 'blocked_external'
  | 'other'

export interface Outcome {
  id: string
  itemId: string | null
  scheduledBlockId: string | null
  localDate: LocalDate
  status: OutcomeStatus
  actualMinutes: number | null
  skipReason: SkipReason | null
}

/**
 * Which number a feasibility check was built on. Always reported, never assumed —
 * a verdict built on a guess and a verdict built on measurement are different claims.
 */
export type CapacitySource = 'declared' | 'demonstrated'

export interface TimezonePeriod {
  ianaZone: IanaZone
  effectiveFrom: Date
}

/**
 * Everything the pure core is allowed to see. Assembled by `/src/services`,
 * handed in whole. The core never fetches.
 */
export interface World {
  /** The instant the planning pass is reasoning about. Passed in; never read from the clock. */
  now: Date
  timezonePeriods: TimezonePeriod[]
  nodes: GoalNode[]
  dependencies: NodeDependency[]
  milestones: Milestone[]
  items: Item[]
  commitments: Commitment[]
  capacityBudgets: CapacityBudget[]
  outcomes: Outcome[]
  planningParams: PlanningParams
}

export interface PlanningParams {
  /** Periods of outcome data required before demonstrated throughput supersedes the declared budget. */
  minPeriodsForThroughput: number
  /** Consecutive sub-velocity periods before a slip escalates a level. Per level. */
  propagationThresholdByLevel: Record<NodeLevel, number>
  maxPlanningRounds: number
  checkinQuestionLimit: number
}

export const DEFAULT_PLANNING_PARAMS: PlanningParams = {
  minPeriodsForThroughput: 4,
  propagationThresholdByLevel: {
    life: 3,
    decade: 3,
    campaign: 3,
    year: 3,
    quarter: 3,
  },
  maxPlanningRounds: 3,
  checkinQuestionLimit: 3,
}

/** A proposal the LLM produced, before it is trusted. */
export interface Proposal {
  scope: NodeLevel | 'week' | 'day'
  scopeStart: LocalDate
  scopeEnd: LocalDate
  blocks: ProposedBlock[]
  /** Ordered item ids for a day proposal. */
  queue: string[]
  rationale: string
}

export interface ProposedBlock {
  itemId: string | null
  commitmentId: string | null
  startsAt: Date
  endsAt: Date
  firmness: Firmness
}
