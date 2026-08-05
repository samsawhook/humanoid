/**
 * Load the plan from Postgres. One source of truth, no fallback.
 *
 * There used to be a seed fallback here so pages rendered without a database. It was
 * removed deliberately: silently substituting different data means you can be looking
 * at a screen that is confidently wrong, and a planner you cannot trust at a glance is
 * worse than one that is honestly broken. If the database is not there, every page
 * says so and says what to run.
 *
 * That fallback also hid a real production bug for an entire deploy — the database
 * code path had never once executed locally. Failing loudly is cheaper.
 *
 * Uses Neon's HTTP driver: works on Vercel serverless, same transport as the
 * migration and seed scripts.
 */

import { neon } from '@neondatabase/serverless'
import type {
  Commitment,
  LocalDate,
  CapacityBudget,
  GoalNode,
  Item,
  Milestone,
  NodeDependency,
  TimezonePeriod,
} from '@/core/types'
import { uuidForSlug } from './ids'

export interface LoadedPlan {
  nodes: GoalNode[]
  dependencies: NodeDependency[]
  milestones: Milestone[]
  items: Item[]
  commitments: Commitment[]
  capacityBudgets: CapacityBudget[]
  timezonePeriods: TimezonePeriod[]
  /** Resolve a seed slug (e.g. 'lsat') to its row id. */
  resolveId: (slug: string) => string
}

/** Carries something you can act on, not a stack trace. Rendered by the error boundary. */
export class PlanUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanUnavailableError'
  }
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const date = (v: unknown): Date | null => (v ? new Date(String(v)) : null)

/**
 * Postgres `date` columns come back as JS Date objects, not 'YYYY-MM-DD' strings —
 * node-postgres' default type parser converts OID 1082, and the Neon driver inherits
 * that behaviour. Everything in `/src/core` expects the string form and
 * `parseLocalDate` throws loudly on anything else, which is correct of it and fatal
 * here.
 *
 * A DATE is parsed as local midnight, so the local getters round-trip it correctly
 * whatever the server's timezone. `toISOString()` would shift the day west of UTC.
 */
export function localDate(v: unknown): LocalDate | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export async function loadPlan(): Promise<LoadedPlan> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new PlanUnavailableError(
      'DATABASE_URL is not set. Locally: put it in .env.local. ' +
        'On Vercel: Settings → Environment Variables, then redeploy.',
    )
  }

  const sql = neon(url)

  let rows
  try {
    rows = await Promise.all([
      sql`select * from nodes where deleted_at is null order by level, sort_order, title`,
      sql`select * from node_dependencies where deleted_at is null`,
      sql`select * from milestones where deleted_at is null order by sequence`,
      sql`select * from items where deleted_at is null`,
      sql`select * from commitments where deleted_at is null order by starts_at`,
      sql`select * from capacity_budgets where deleted_at is null`,
      sql`select * from timezone_periods where deleted_at is null order by effective_from`,
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/relation .* does not exist/i.test(message)) {
      throw new PlanUnavailableError(
        `Database is reachable but not migrated — run \`npm run db:migrate\`. (${message})`,
      )
    }
    throw new PlanUnavailableError(`Database unreachable. ${message}`)
  }

  const [nodeRows, depRows, milestoneRows, itemRows, commitmentRows, budgetRows, tzRows] = rows

  if (nodeRows.length === 0) {
    throw new PlanUnavailableError(
      'Database is migrated but holds no goal tree — run `npm run db:seed`.',
    )
  }

  return {
    nodes: nodeRows.map(
      (r): GoalNode => ({
        id: String(r.id),
        parentId: r.parent_id ? String(r.parent_id) : null,
        title: String(r.title),
        level: r.level,
        kind: r.kind,
        outcomeDefinition: r.outcome_definition ?? null,
        targetDate: localDate(r.target_date),
        dateBasis: r.date_basis ?? null,
        dateConfidence: r.date_confidence ?? null,
        windowOpen: localDate(r.window_open),
        windowClose: localDate(r.window_close),
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
        targetDate: localDate(r.target_date),
        dateBasis: r.date_basis ?? null,
        windowOpen: localDate(r.window_open),
        windowClose: localDate(r.window_close),
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
        effectiveFrom: localDate(r.effective_from)!,
        effectiveTo: localDate(r.effective_to),
      }),
    ),
    timezonePeriods: tzRows.map(
      (r): TimezonePeriod => ({
        ianaZone: String(r.iana_zone),
        effectiveFrom: new Date(String(r.effective_from)),
      }),
    ),
    resolveId: uuidForSlug,
  }
}
