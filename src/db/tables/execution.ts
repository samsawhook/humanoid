import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { timestamps } from './common'
import { milestones, nodes } from './nodes'
import {
  commitmentSource,
  dateFlexibility,
  effortConfidence,
  firmness,
  itemStatus,
} from './enums'

/** Executable work — the "actions" link of goals → stages → actions → queue → schedule. */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nullable: inbox items arrive unattributed and get triaged onto a node later. */
    nodeId: uuid('node_id').references(() => nodes.id),
    milestoneId: uuid('milestone_id').references(() => milestones.id),
    title: text('title').notNull(),
    notes: text('notes'),

    /** An estimate. Corrected against outcomes.actual_minutes by the calibration pass. */
    effortMinutes: integer('effort_minutes').notNull().default(30),
    effortConfidence: effortConfidence('effort_confidence').notNull().default('medium'),

    dueAt: timestamp('due_at', { withTimezone: true }),
    earliestStartAt: timestamp('earliest_start_at', { withTimezone: true }),
    dateFlexibility: dateFlexibility('date_flexibility').notNull().default('elastic'),

    status: itemStatus('status').notNull().default('todo'),
    blockedReason: text('blocked_reason'),
    recurrenceRule: text('recurrence_rule'),

    /**
     * Must still happen when the system is being ignored — drill, medications, bills.
     * Anything whose consequence is non-recoverable. Bypasses ordering, pins
     * unconditionally.
     */
    autopilotCritical: boolean('autopilot_critical').notNull().default(false),
    priorityHint: integer('priority_hint'),
    ...timestamps,
  },
  (t) => ({
    byNode: index('items_node_idx').on(t.nodeId),
    byStatus: index('items_status_idx').on(t.status),
  }),
)

/**
 * Externally imposed immovable time. Consumes capacity before anything else is
 * allocated — this is what makes "Army ran three hours long" propagate correctly
 * rather than just producing an overfull day.
 */
export const commitments = pgTable(
  'commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    nodeId: uuid('node_id').references(() => nodes.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    location: text('location'),
    recurrenceRule: text('recurrence_rule'),

    /** Present from day one so an inbound ICS importer upserts rather than duplicates. */
    source: commitmentSource('source').notNull().default('manual'),
    sourceKey: text('source_key'),
    externalUid: text('external_uid'),
    ...timestamps,
  },
  (t) => ({
    byWindow: index('commitments_window_idx').on(t.startsAt, t.endsAt),
    externalIdentity: uniqueIndex('commitments_external_identity')
      .on(t.sourceKey, t.externalUid)
      .where(sql`${t.sourceKey} is not null and ${t.externalUid} is not null`),
  }),
)

/**
 * Hours per week available in a domain. A CEILING, never a target — the system will
 * never tell you to hit an hours number. Effective-dated because a deployment changes
 * every budget at once.
 */
export const capacityBudgets = pgTable(
  'capacity_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id),
    hoursPerWeek: numeric('hours_per_week').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    effectiveTo: date('effective_to', { mode: 'string' }),
    note: text('note'),
    ...timestamps,
  },
  (t) => ({
    byNode: index('capacity_budgets_node_idx').on(t.nodeId, t.effectiveFrom),
  }),
)

/**
 * The queue: an ordered item list for a local date.
 *
 * `orderedItemIds` is deliberately an array rather than a join table. It is a snapshot
 * of an ordering at a moment, not a relation — and re-slotting supersedes the whole
 * row rather than editing positions.
 */
export const dayPlans = pgTable(
  'day_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    planId: uuid('plan_id'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    orderedItemIds: uuid('ordered_item_ids').array().notNull().default(sql`'{}'::uuid[]`),
    rationale: text('rationale'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    byDate: index('day_plans_date_idx').on(t.localDate),
  }),
)

/**
 * The schedule. `firm` blocks are commitments and pinned work and do not move; `soft`
 * blocks carry real times but any re-slot may rewrite them.
 *
 * Re-slotting SUPERSEDES rows rather than mutating them, so what actually happened to
 * a day stays legible afterward.
 */
export const scheduledBlocks = pgTable(
  'scheduled_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    itemId: uuid('item_id').references(() => items.id),
    commitmentId: uuid('commitment_id').references(() => commitments.id),
    firmness: firmness('firmness').notNull().default('soft'),
    planId: uuid('plan_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    byDate: index('scheduled_blocks_date_idx').on(t.localDate),
    /** Exactly one of item or commitment — a block is one thing or the other. */
    exactlyOneSubject: check(
      'scheduled_blocks_one_subject',
      sql`(${t.itemId} is not null and ${t.commitmentId} is null)
       or (${t.itemId} is null and ${t.commitmentId} is not null)`,
    ),
  }),
)
