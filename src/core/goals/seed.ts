/**
 * The goal tree, seeded from what you have told me.
 *
 * This lives in code rather than the database for now so the views work before the
 * migration lands. Once the schema is applied this file becomes the seed script and
 * the views read from Postgres instead — the shapes are already the core types.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  DATES MARKED `estimated` ARE MINE, NOT YOURS. Specifically: LSAT administration
 *  dates, the application-cycle window, and MAcc term boundaries. I did not have
 *  authoritative sources, and rather than invent precise-looking dates I marked
 *  them low-confidence. `dateBasis: 'external_fixed'` is the only value that binds
 *  the validator, so nothing here is treated as a hard constraint until you
 *  confirm it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GoalNode, Milestone, NodeDependency } from '../types'
import { TIMELINE } from '../money/rates'

const n = (node: GoalNode): GoalNode => node

const BASE_NODES: GoalNode[] = [
  // ── Domains ────────────────────────────────────────────────────────────────
  n({
    id: 'service',
    parentId: null,
    title: 'Service',
    level: 'life',
    kind: 'achievement',
    outcomeDefinition: 'Deployment completed, career options preserved, body intact.',
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'law',
    parentId: null,
    title: 'Law',
    level: 'life',
    kind: 'achievement',
    outcomeDefinition: 'Admitted to and enrolled at a law school worth the opportunity cost.',
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'macc',
    parentId: null,
    title: 'MAcc',
    level: 'life',
    kind: 'achievement',
    outcomeDefinition: 'TAMU-CC online MAcc conferred.',
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'money',
    parentId: null,
    title: 'Money',
    level: 'life',
    kind: 'achievement',
    outcomeDefinition:
      'Net worth positive and liquid, with no consumer debt and the house current.',
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'family',
    parentId: null,
    title: 'Family',
    level: 'life',
    kind: 'state',
    outcomeDefinition: null,
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'health',
    parentId: null,
    title: 'Health',
    level: 'life',
    kind: 'state',
    outcomeDefinition: null,
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),

  // ── Service ────────────────────────────────────────────────────────────────
  n({
    id: 'deployment',
    parentId: 'service',
    title: 'CENTCOM deployment',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'Return home, orders complete, with the follow-on options still open.',
    targetDate: TIMELINE.expectedReturn,
    dateBasis: 'estimated',
    dateConfidence: 'low',
    windowOpen: TIMELINE.premobStart,
    windowClose: TIMELINE.ordersMaxEnd,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),

  // ── Law ────────────────────────────────────────────────────────────────────
  n({
    id: 'lsat',
    parentId: 'law',
    title: 'LSAT',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'A scored LSAT on an official administration, at or above target.',
    targetDate: '2027-01-16',
    dateBasis: 'estimated',
    dateConfidence: 'low',
    windowOpen: '2026-08-05',
    // Last administration that still lands inside the application cycle.
    windowClose: '2027-02-28',
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'applications',
    parentId: 'law',
    title: 'Applications',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'Complete applications submitted to the target school list.',
    targetDate: '2027-11-15',
    dateBasis: 'estimated',
    dateConfidence: 'low',
    /**
     * Rolling admissions. This is the clearest window in the whole tree: an
     * application submitted in September and the identical application submitted in
     * February are not the same application. Ranking this by its closing date alone
     * gets it wrong — the cost ramps continuously from the day it opens.
     */
    windowOpen: '2027-09-01',
    windowClose: '2028-02-15',
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),

  // ── MAcc ───────────────────────────────────────────────────────────────────
  n({
    id: 'macc_coursework',
    parentId: 'macc',
    title: 'MAcc coursework',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'All remaining courses passed. 2 of ~10 complete.',
    targetDate: '2028-05-31',
    dateBasis: 'estimated',
    dateConfidence: 'low',
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),

  // ── Money ──────────────────────────────────────────────────────────────────
  n({
    id: 'arrears',
    parentId: 'money',
    title: 'Clear the arrears',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'Mortgage and auto loan both current, no missed payments outstanding.',
    targetDate: '2026-12-15',
    dateBasis: 'self_imposed',
    dateConfidence: 'high',
    windowOpen: '2026-08-05',
    windowClose: '2026-12-31',
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'czte_window',
    parentId: 'money',
    title: 'Use the CZTE window',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition:
      'Consumer debt eliminated and an emergency fund funded, out of tax-free income.',
    targetDate: TIMELINE.expectedReturn,
    dateBasis: 'estimated',
    dateConfidence: 'medium',
    /**
     * The textbook window. This money can only be earned inside the deployment, at a
     * tax treatment available at no other time in your life. It cannot be missed and
     * made up later — and the correct response is to decide where it goes BEFORE it
     * opens, which is why this node's real deadline is the 4th of September, not the
     * day the deployment ends.
     */
    windowOpen: TIMELINE.czteStart,
    windowClose: TIMELINE.expectedReturn,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'emergency_fund',
    parentId: 'money',
    title: 'Emergency fund',
    level: 'campaign',
    kind: 'achievement',
    outcomeDefinition: 'One month of running costs held liquid — roughly $4,500.',
    targetDate: '2027-03-01',
    dateBasis: 'self_imposed',
    dateConfidence: 'medium',
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
]


/**
 * The era layer.
 *
 * The spec's ladder runs life → decade/era → campaign → year → quarter, and the tree
 * skipped straight from life to campaign. Without eras there is nothing to render a
 * horizon breakdown from, and more importantly nothing that expresses *phase intent* —
 * the thing that makes a decade legible when its campaigns are still vague.
 */
export const ERAS: GoalNode[] = [
  n({
    id: 'era_mob',
    parentId: 'service',
    title: 'Mobilised era',
    level: 'decade',
    kind: 'achievement',
    outcomeDefinition: 'Deployment served, career optionality intact, body and marriage intact.',
    targetDate: TIMELINE.ordersMaxEnd,
    dateBasis: 'external_fixed',
    dateConfidence: 'medium',
    windowOpen: TIMELINE.premobStart,
    windowClose: TIMELINE.ordersMaxEnd,
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'era_law_entry',
    parentId: 'law',
    title: 'Entry to the profession',
    level: 'decade',
    kind: 'achievement',
    outcomeDefinition: 'Admitted, enrolled, JD conferred and bar passed.',
    targetDate: '2032-07-31',
    dateBasis: 'estimated',
    dateConfidence: 'low',
    windowOpen: '2026-08-05',
    windowClose: '2033-12-31',
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'era_credential',
    parentId: 'macc',
    title: 'Accounting credential',
    level: 'decade',
    kind: 'achievement',
    outcomeDefinition: 'MAcc conferred; CPA eligibility established.',
    targetDate: '2028-12-31',
    dateBasis: 'estimated',
    dateConfidence: 'low',
    windowOpen: null,
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'era_solvency',
    parentId: 'money',
    title: 'Back to solvent',
    level: 'decade',
    kind: 'achievement',
    outcomeDefinition:
      'Net worth positive and liquid: no consumer debt, house current, one year of runway.',
    targetDate: '2029-12-31',
    dateBasis: 'self_imposed',
    dateConfidence: 'medium',
    windowOpen: '2026-08-05',
    windowClose: null,
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'era_young_family',
    parentId: 'family',
    title: 'Years with young children',
    level: 'decade',
    kind: 'state',
    outcomeDefinition: null,
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: '2026-08-05',
    windowClose: '2038-12-31',
    requiredVelocity: null,
    /** The defining irreversible window: these years do not come back. */
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'era_capable_body',
    parentId: 'health',
    title: 'Years the body can do hard things',
    level: 'decade',
    kind: 'state',
    outcomeDefinition: null,
    targetDate: null,
    dateBasis: null,
    dateConfidence: null,
    windowOpen: '2026-08-05',
    windowClose: '2041-12-31',
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
]

/**
 * Year and quarter nodes for the near horizon only.
 *
 * Deliberately shallow: resolution decays with distance, and storing quarters at five
 * years out would be fiction with a schema. These exist because the next eighteen
 * months are where the plan is actually load-bearing.
 */
export const PERIODS: GoalNode[] = [
  n({
    id: 'y2026_law',
    parentId: 'lsat',
    title: '2026 — get a score',
    level: 'year',
    kind: 'achievement',
    outcomeDefinition: 'An official LSAT score in hand before the 2027 cycle opens.',
    targetDate: '2026-12-31',
    dateBasis: 'self_imposed',
    dateConfidence: 'medium',
    windowOpen: '2026-08-05',
    windowClose: '2027-02-28',
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
  n({
    id: 'q3_2026_law',
    parentId: 'y2026_law',
    title: 'Q3 2026 — blitz and register',
    level: 'quarter',
    kind: 'achievement',
    outcomeDefinition:
      'Diagnostic scored, LSAC military exception filed, sitting chosen and registered.',
    targetDate: '2026-09-30',
    dateBasis: 'self_imposed',
    dateConfidence: 'high',
    windowOpen: '2026-08-05',
    windowClose: '2026-09-30',
    requiredVelocity: null,
    reversible: false,
    status: 'active',
  }),
  n({
    id: 'y2026_money',
    parentId: 'arrears',
    title: '2026 — stop the bleeding',
    level: 'year',
    kind: 'achievement',
    outcomeDefinition: 'Auto loan cleared and the mortgage arrears materially reduced.',
    targetDate: '2026-12-31',
    dateBasis: 'self_imposed',
    dateConfidence: 'medium',
    windowOpen: '2026-08-05',
    windowClose: '2026-12-31',
    requiredVelocity: null,
    reversible: true,
    status: 'active',
  }),
]

/** Campaigns re-parented under their era, so every path runs life → era → campaign. */
const ERA_OF: Record<string, string> = {
  deployment: 'era_mob',
  lsat: 'era_law_entry',
  applications: 'era_law_entry',
  macc_coursework: 'era_credential',
  arrears: 'era_solvency',
  czte_window: 'era_solvency',
  emergency_fund: 'era_solvency',
}

/** The whole tree: domains, eras, campaigns, and the near-horizon year and quarter nodes. */
export const NODES: GoalNode[] = [
  ...BASE_NODES.map((node) =>
    ERA_OF[node.id] ? { ...node, parentId: ERA_OF[node.id]! } : node,
  ),
  ...ERAS,
  ...PERIODS,
]

export const MILESTONES: Milestone[] = [
  {
    id: 'm_lsat_diag',
    nodeId: 'lsat',
    title: 'Diagnostic taken, target score set',
    outcomeDefinition: 'A scored diagnostic and a written target.',
    sequence: 1,
    amount: null,
    unitLabel: null,
    targetDate: '2026-08-31',
    dateBasis: 'self_imposed',
    windowOpen: null,
    windowClose: null,
    achievedAt: null,
  },
  {
    id: 'm_lsat_sit',
    nodeId: 'lsat',
    title: 'Sit an official administration',
    outcomeDefinition: 'An official score released.',
    sequence: 2,
    amount: null,
    unitLabel: null,
    targetDate: '2027-01-16',
    dateBasis: 'estimated',
    windowOpen: null,
    windowClose: '2027-02-28',
    achievedAt: null,
  },
  {
    id: 'm_arrears_mortgage',
    nodeId: 'arrears',
    title: 'Mortgage current',
    outcomeDefinition: 'No missed mortgage payments outstanding.',
    sequence: 1,
    amount: null,
    unitLabel: null,
    targetDate: '2026-12-15',
    dateBasis: 'self_imposed',
    windowOpen: null,
    windowClose: null,
    achievedAt: null,
  },
  {
    id: 'm_arrears_car',
    nodeId: 'arrears',
    title: 'Auto loan current',
    outcomeDefinition: 'No missed auto payments outstanding.',
    sequence: 2,
    amount: null,
    unitLabel: null,
    targetDate: '2026-12-15',
    dateBasis: 'self_imposed',
    windowOpen: null,
    windowClose: null,
    achievedAt: null,
  },
  {
    id: 'm_macc_1',
    nodeId: 'macc_coursework',
    title: 'Courses 1–2 complete',
    outcomeDefinition: 'Two courses passed.',
    sequence: 1,
    amount: 2,
    unitLabel: 'courses',
    targetDate: '2026-07-31',
    dateBasis: 'external_fixed',
    windowOpen: null,
    windowClose: null,
    achievedAt: new Date('2026-07-31T00:00:00Z'),
  },
  {
    id: 'm_czte_decide',
    nodeId: 'czte_window',
    title: 'Allocation decided before the window opens',
    outcomeDefinition:
      'A written decision on where every tax-free dollar goes, logged in `decisions`.',
    sequence: 1,
    amount: null,
    unitLabel: null,
    targetDate: TIMELINE.czteStart,
    dateBasis: 'external_fixed',
    windowOpen: null,
    windowClose: TIMELINE.czteStart,
    achievedAt: null,
  },
]

export const DEPENDENCIES: NodeDependency[] = [
  // No score, no application. The single hardest constraint in the tree.
  { predecessorId: 'lsat', successorId: 'applications', kind: 'finish_to_start' },
  // The arrears have to be cured before the tax-free money can go anywhere useful.
  { predecessorId: 'arrears', successorId: 'czte_window', kind: 'gates_window' },
  // The deployment gates when the LSAT can realistically be sat.
  { predecessorId: 'deployment', successorId: 'lsat', kind: 'gates_window' },
]
