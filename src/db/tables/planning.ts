import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { timestamps } from './common'
import { milestones, nodes } from './nodes'
import { capacitySource, channel, chatRole, outboundKind, planScope, planStatus, severity } from './enums'

/**
 * Every generated plan, with the model's stated rationale and the validator's output.
 *
 * A row is written after EVERY round of the propose → validate → revise loop, not just
 * the final one, so a function timeout costs one round rather than the whole pass.
 */
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: planScope('scope').notNull(),
    scopeStart: date('scope_start', { mode: 'string' }).notNull(),
    scopeEnd: date('scope_end', { mode: 'string' }).notNull(),
    round: integer('round').notNull().default(1),
    status: planStatus('status').notNull().default('draft'),

    model: text('model'),
    promptVersion: text('prompt_version'),

    proposal: jsonb('proposal').notNull(),
    /** The model's reasoning, in its own words. Kept for later review. */
    rationale: text('rationale'),

    /** { feasible, capacitySource, totals } — the verdict, as the validator produced it. */
    verdict: jsonb('verdict'),
    capacitySource: capacitySource('capacity_source'),

    activatedAt: timestamp('activated_at', { withTimezone: true }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    byScope: index('plans_scope_idx').on(t.scope, t.scopeStart),
  }),
)

/** Named violations, one row each. The validator never returns a boolean. */
export const planViolations = pgTable(
  'plan_violations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    code: text('code').notNull(),
    severity: severity('severity').notNull(),
    message: text('message').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    details: jsonb('details'),
    ...timestamps,
  },
  (t) => ({
    byPlan: index('plan_violations_plan_idx').on(t.planId),
    byCode: index('plan_violations_code_idx').on(t.code),
  }),
)

/**
 * The ranked statement of what is being given up to hold the plan.
 *
 * The most valuable artifact in the system, and the reason it has a stable `key`: a
 * sacrifice asserted in March and the same sacrifice asserted in September must be ONE
 * row, so that duration is visible. "You have been giving this up for seven months" is
 * a fact the snapshot-per-replan design would destroy.
 *
 * This is the headline number that replaces the banned completion rate.
 */
export const tradeoffs = pgTable(
  'tradeoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable across replans. Deterministic from what is being given up. */
    key: text('key').notNull(),
    nodeId: uuid('node_id').references(() => nodes.id),
    milestoneId: uuid('milestone_id').references(() => milestones.id),
    description: text('description').notNull(),
    rank: integer('rank').notNull().default(0),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when the sacrifice stops being asserted — the plan made room for it again. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    planId: uuid('plan_id').references(() => plans.id),
    ...timestamps,
  },
  (t) => ({
    byKey: uniqueIndex('tradeoffs_key').on(t.key),
  }),
)

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
})

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: chatRole('role').notNull(),
    content: jsonb('content').notNull(),
    /** Set when a turn produced a proposal, which then goes through the validator. */
    planId: uuid('plan_id').references(() => plans.id),
    ...timestamps,
  },
  (t) => ({
    byConversation: index('chat_messages_conversation_idx').on(t.conversationId),
  }),
)

/**
 * Sent digests and check-ins.
 *
 * The unique index is the idempotency guard: Vercel cron can double-fire, and without
 * it you get two morning digests and a system you stop trusting.
 */
export const outboundMessages = pgTable(
  'outbound_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: channel('channel').notNull(),
    kind: outboundKind('kind').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload'),
    externalMessageId: text('external_message_id'),
    ...timestamps,
  },
  (t) => ({
    oncePerDay: uniqueIndex('outbound_messages_once_per_day').on(t.kind, t.localDate),
  }),
)
