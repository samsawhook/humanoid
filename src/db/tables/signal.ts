import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { timestamps } from './common'
import { items, scheduledBlocks } from './execution'
import { channel, outcomeStatus, skipReason } from './enums'

/**
 * Every inbound message, raw and verbatim.
 *
 * The raw payload is never discarded and never rewritten. Re-parsing history when the
 * schema changes is the entire point — an interpretation is a guess made by a
 * particular model at a particular time, and guesses get better.
 *
 * This table has no soft-delete semantics in practice: nothing deletes from it.
 */
export const captures = pgTable(
  'captures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: channel('channel').notNull(),
    externalMessageId: text('external_message_id'),
    /** The entire inbound body, exactly as it arrived. Never touched again. */
    rawPayload: jsonb('raw_payload').notNull(),
    rawText: text('raw_text'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),

    /** Interpretation, kept strictly separate from the original. */
    parsed: jsonb('parsed'),
    parsedAt: timestamp('parsed_at', { withTimezone: true }),
    parseModel: text('parse_model'),
    parseVersion: integer('parse_version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    byReceived: index('captures_received_idx').on(t.receivedAt),
  }),
)

/**
 * What actually happened to scheduled work.
 *
 * Retained for exactly one purpose: estimating realistic throughput so plans are built
 * on demonstrated capacity rather than optimism. Completion rate is not a metric here
 * and is never ranked on or displayed as a headline.
 *
 * The skip reason is the highest-value column in the database.
 */
export const outcomes = pgTable(
  'outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduledBlockId: uuid('scheduled_block_id').references(() => scheduledBlocks.id),
    itemId: uuid('item_id').references(() => items.id),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    status: outcomeStatus('status').notNull(),
    actualMinutes: integer('actual_minutes'),
    skipReason: skipReason('skip_reason'),
    skipNote: text('skip_note'),
    captureId: uuid('capture_id').references(() => captures.id),
    ...timestamps,
  },
  (t) => ({
    byDate: index('outcomes_date_idx').on(t.localDate),
    byItem: index('outcomes_item_idx').on(t.itemId),
  }),
)

/**
 * Decision log. Written by hand, never auto-populated — the value is in having
 * committed to an expected outcome before knowing the answer.
 */
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  theCall: text('the_call').notNull(),
  reasoning: text('reasoning').notNull(),
  expectedOutcome: text('expected_outcome').notNull(),
  reviewDate: date('review_date', { mode: 'string' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  nodeId: uuid('node_id'),
  ...timestamps,
})

/** Seeding questions — the interview that fills the tree in. */
export const seedQuestions = pgTable('seed_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  question: text('question').notNull(),
  topic: text('topic'),
  active: boolean('active').notNull().default(true),
  askedAt: timestamp('asked_at', { withTimezone: true }),
  answeredCaptureId: uuid('answered_capture_id').references(() => captures.id),
  ...timestamps,
})
