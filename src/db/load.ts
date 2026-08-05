/**
 * Load the plan from Postgres, falling back to the code seed.
 *
 * The fallback is deliberate, not laziness. A planning system that shows a blank page
 * when the database is unreachable is worse than one that shows the last known plan
 * and says so — you read this on a bad connection in a tent. Every view renders the
 * source badge, so a fallback render is never mistaken for live data.
 *
 * Uses Neon's HTTP driver: works on Vercel serverless, and is the same transport the
 * migration and seed scripts use.
 */

import { neon } from '@neondatabase/serverless'
import type {
  Commitment,
  CapacityBudget,
  GoalNode,
  Item,
  Milestone,
  NodeDependency,
  TimezonePeriod,
} from '@/core/types'
import { NODES, MILESTONES, DEPENDENCIES } from '@/core/goals/seed'
import { ITEMS, COMMITMENTS } from '@/core/goals/items'
import { uuidForSlug } from './ids'

export interface LoadedPlan {
  source: 'database' | 'seed'
  /** Present only when the database was tried and failed. */
  error?: string
  nodes: GoalNode[]
  dependencies: NodeDependency[]
  milestones: Milestone[]
  items: Item[]
  commitments: Commitment[]
  capacityBudgets: CapacityBudget[]
  timezonePeriods: TimezonePeriod[]
  /** Resolve a seed slug to whatever id the current source uses. */
  resolveId: (slug: string) => string
}

const SEED_FALLBACK = (error?: string): LoadedPlan => ({
  source: 'seed',
  ...(error ? { error } : {}),
  nodes: NODES,
  dependencies: DEPENDENCIES,
  milestones: MILESTONES,
  items: ITEMS,
  commitments: COMMITMENTS,
  capacityBudgets: [
    { nodeId: 'service', hoursPerWeek: 50, effectiveFrom: '2026-08-05', effectiveTo: null },
    { nodeId: 'law', hoursPerWeek: 14, effectiveFrom: '2026-08-05', effectiveTo: null },
    { nodeId: 'macc', hoursPerWeek: 10, effectiveFrom: '2026-08-05', effectiveTo: null },
    { nodeId: 'money', hoursPerWeek: 4, effectiveFrom: '2026-08-05', effectiveTo: null },
    { nodeId: 'family', hoursPerWeek: 30, effectiveFrom: '2026-08-05', effectiveTo: null },
    { nodeId: 'health', hoursPerWeek: 8, effectiveFrom: '2026-08-05', effectiveTo: null },
  ],
  timezonePeriods: [
    { ianaZone: 'America/Chicago', effectiveFrom: new Date('2020-01-01T00:00:00Z') },
  ],
  // In seed mode the slug IS the id.
  resolveId: (slug) => slug,
})

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const date = (v: unknown): Date | null => (v ? new Date(String(v)) : null)

export async function loadPlan(): Promise<LoadedPlan> {
  const url = process.env.DATABASE_URL
  if (!url) return SEED_FALLBACK('DATABASE_URL is not set.')

  try {
    const sql = neon(url)

    const [nodeRows, depRows, milestoneRows, itemRows, commitmentRows, budgetRows, tzRows] =
      await Promise.all([
        sql`select * from nodes where deleted_at is null order by level, sort_order, title`,
        sql`select * from node_dependencies where deleted_at is null`,
        sql`select * from milestones where deleted_at is null order by sequence`,
        sql`select * from items where deleted_at is null`,
        sql`select * from commitments where deleted_at is null order by starts_at`,
        sql`select * from capacity_budgets where deleted_at is null`,
        sql`select * from timezone_periods where deleted_at is null order by effective_from`,
      ])

    // An empty tree means the schema exists but nothing was seeded. Showing an empty
    // planner would look like a broken app rather than an un-run script, so fall back
    // and say so.
    if (nodeRows.length === 0) {
      return SEED_FALLBACK('Database is migrated but empty — run `npm run db:seed`.')
    }

    return {
      source: 'database',
      nodes: nodeRows.map(
        (r): GoalNode => ({
          id: String(r.id),
          parentId: r.parent_id ? String(r.parent_id) : null,
          title: String(r.title),
          level: r.level,
          kind: r.kind,
          outcomeDefinition: r.outcome_definition ?? null,
          targetDate: r.target_date ?? null,
          dateBasis: r.date_basis ?? null,
          dateConfidence: r.date_confidence ?? null,
          windowOpen: r.window_open ?? null,
          windowClose: r.window_close ?? null,
          requiredVelocity: r.required_velocity_amount
            ? {
                amount: num(r.required_velocity_amount),
                unit: r.required_velocity_unit,
                unitLabel: r.required_velocity_unit_label ?? '',
                period: r.required_velocity_period,
              }
            : null,
          reversible: Boolean(r.reversible),
          status: r.status,
        }),
      ),
      dependencies: depRows.map(
        (r): NodeDependency => ({
          predecessorId: String(r.predecessor_id),
          successorId: String(r.successor_id),
          kind: r.kind,
        }),
      ),
      milestones: milestoneRows.map(
        (r): Milestone => ({
          id: String(r.id),
          nodeId: String(r.node_id),
          title: String(r.title),
          outcomeDefinition: r.outcome_definition ?? null,
          sequence: num(r.sequence),
          amount: r.amount === null ? null : num(r.amount),
          unitLabel: r.unit_label ?? null,
          targetDate: r.target_date ?? null,
          dateBasis: r.date_basis ?? null,
          windowOpen: r.window_open ?? null,
          windowClose: r.window_close ?? null,
          achievedAt: date(r.achieved_at),
        }),
      ),
      items: itemRows.map(
        (r): Item => ({
          id: String(r.id),
          nodeId: r.node_id ? String(r.node_id) : null,
          milestoneId: r.milestone_id ? String(r.milestone_id) : null,
          title: String(r.title),
          effortMinutes: num(r.effort_minutes),
          effortConfidence: r.effort_confidence,
          dueAt: date(r.due_at),
          earliestStartAt: date(r.earliest_start_at),
          dateFlexibility: r.date_flexibility,
          status: r.status,
          autopilotCritical: Boolean(r.autopilot_critical),
          ...(r.recurrence_rule ? { recurrenceRule: String(r.recurrence_rule) } : {}),
          ...(r.priority_hint === null ? {} : { priorityHint: num(r.priority_hint) }),
        }),
      ),
      commitments: commitmentRows.map(
        (r): Commitment => ({
          id: String(r.id),
          title: String(r.title),
          nodeId: r.node_id ? String(r.node_id) : null,
          startsAt: new Date(String(r.starts_at)),
          endsAt: new Date(String(r.ends_at)),
          allDay: Boolean(r.all_day),
        }),
      ),
      capacityBudgets: budgetRows.map(
        (r): CapacityBudget => ({
          nodeId: String(r.node_id),
          hoursPerWeek: num(r.hours_per_week),
          effectiveFrom: r.effective_from,
          effectiveTo: r.effective_to ?? null,
        }),
      ),
      timezonePeriods: tzRows.map(
        (r): TimezonePeriod => ({
          ianaZone: String(r.iana_zone),
          effectiveFrom: new Date(String(r.effective_from)),
        }),
      ),
      // In database mode the slug hashes to the row id.
      resolveId: uuidForSlug,
    }
  } catch (error) {
    return SEED_FALLBACK(error instanceof Error ? error.message : String(error))
  }
}

/** Small banner data for every view, so a fallback render is never mistaken for live. */
export function sourceLabel(plan: LoadedPlan): { text: string; tone: 'good' | 'warn' } {
  return plan.source === 'database'
    ? { text: 'Live from database', tone: 'good' }
    : { text: `Seed fallback — ${plan.error ?? 'database not used'}`, tone: 'warn' }
}
