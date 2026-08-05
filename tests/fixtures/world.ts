/**
 * Hand-built worlds for the pure core. No database, no fixtures loaded from disk.
 *
 * Every builder takes overrides so a test can state only the thing it cares about,
 * which keeps the tests readable as documentation of what each rule means.
 */

import {
  DEFAULT_PLANNING_PARAMS,
  type CapacityBudget,
  type Commitment,
  type GoalNode,
  type Item,
  type Milestone,
  type NodeDependency,
  type Outcome,
  type Proposal,
  type ProposedBlock,
  type World,
} from '@/core/types'

/** A fixed instant so nothing in the suite depends on when it runs. */
export const NOW = new Date('2026-08-05T15:00:00Z')

export const CHICAGO = 'America/Chicago'
export const KUWAIT = 'Asia/Kuwait'

export function node(over: Partial<GoalNode> & { id: string }): GoalNode {
  return {
    parentId: null,
    title: `node ${over.id}`,
    level: 'life',
    kind: 'achievement',
    outcomeDefinition: 'a stated, observable output',
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
    ...over,
  }
}

export function item(over: Partial<Item> & { id: string }): Item {
  return {
    nodeId: null,
    milestoneId: null,
    title: `item ${over.id}`,
    effortMinutes: 60,
    effortConfidence: 'medium',
    dueAt: null,
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    autopilotCritical: false,
    ...over,
  }
}

export function milestone(over: Partial<Milestone> & { id: string; nodeId: string }): Milestone {
  return {
    title: `milestone ${over.id}`,
    outcomeDefinition: null,
    sequence: 1,
    amount: null,
    unitLabel: null,
    targetDate: null,
    dateBasis: null,
    windowOpen: null,
    windowClose: null,
    achievedAt: null,
    ...over,
  }
}

export function commitment(over: Partial<Commitment> & { id: string }): Commitment {
  return {
    title: `commitment ${over.id}`,
    nodeId: null,
    startsAt: new Date('2026-08-05T13:00:00Z'),
    endsAt: new Date('2026-08-05T15:00:00Z'),
    allDay: false,
    ...over,
  }
}

export function budget(over: Partial<CapacityBudget> & { nodeId: string }): CapacityBudget {
  return {
    hoursPerWeek: 10,
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    ...over,
  }
}

export function outcome(over: Partial<Outcome> & { id: string }): Outcome {
  return {
    itemId: null,
    scheduledBlockId: null,
    localDate: '2026-07-01',
    status: 'completed',
    actualMinutes: 60,
    skipReason: null,
    ...over,
  }
}

export function block(over: Partial<ProposedBlock> = {}): ProposedBlock {
  return {
    itemId: null,
    commitmentId: null,
    startsAt: new Date('2026-08-05T14:00:00Z'),
    endsAt: new Date('2026-08-05T15:00:00Z'),
    firmness: 'soft',
    ...over,
  }
}

export function world(over: Partial<World> = {}): World {
  return {
    now: NOW,
    timezonePeriods: [{ ianaZone: CHICAGO, effectiveFrom: new Date('2020-01-01T00:00:00Z') }],
    nodes: [],
    dependencies: [],
    milestones: [],
    items: [],
    commitments: [],
    capacityBudgets: [],
    outcomes: [],
    planningParams: DEFAULT_PLANNING_PARAMS,
    ...over,
  }
}

export function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    scope: 'week',
    scopeStart: '2026-08-03',
    scopeEnd: '2026-08-09',
    blocks: [],
    queue: [],
    rationale: 'test proposal',
    ...over,
  }
}

/**
 * A small but structurally complete world: one domain with a ceiling, one campaign
 * beneath it, one item. Tests that need a valid baseline start here and break one
 * thing, so what the test is actually asserting stays obvious.
 */
export function healthyWorld(): World {
  const lawSchool = node({
    id: 'law',
    level: 'life',
    title: 'Law School',
    outcomeDefinition: 'admitted and enrolled',
  })
  const lsat = node({
    id: 'lsat',
    parentId: 'law',
    level: 'campaign',
    title: 'LSAT',
    outcomeDefinition: 'LSAT score of 172 or better on an official administration',
  })
  const prep = item({ id: 'prep', nodeId: 'lsat', title: 'Timed section drill', effortMinutes: 90 })

  return world({
    nodes: [lawSchool, lsat],
    items: [prep],
    capacityBudgets: [budget({ nodeId: 'law', hoursPerWeek: 10 })],
  })
}
