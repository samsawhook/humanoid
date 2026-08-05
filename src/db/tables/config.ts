import { boolean, date, jsonb, numeric, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { timestamps } from './common'
import { paramAuthor } from './enums'

/**
 * Single-row table. The unique index on a column that can only hold `true` is what
 * makes "single-row" a database guarantee rather than a convention.
 */
export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    singletonGuard: boolean('singleton_guard').notNull().default(true),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    sex: text('sex').notNull(),
    /** Overrides the actuarial baseline when set. Null means use the SSA table. */
    lifeExpectancyOverrideYears: numeric('life_expectancy_override_years'),
    lifeExpectancySource: text('life_expectancy_source'),
    ...timestamps,
  },
  (t) => ({
    onlyOneRow: uniqueIndex('settings_singleton').on(t.singletonGuard),
  }),
)

/**
 * Planning parameters, individually addressable.
 *
 * Separate rows rather than a blob because the model proposes changes to these at
 * retro time, and each change needs its own rationale and its own audit trail.
 */
export const planningParams = pgTable(
  'planning_params',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    notes: text('notes'),
    updatedBy: paramAuthor('updated_by').notNull().default('me'),
    rationale: text('rationale'),
    ...timestamps,
  },
  (t) => ({
    byKey: uniqueIndex('planning_params_key').on(t.key),
  }),
)

/**
 * Which timezone was in effect when. The next row ends the previous period.
 *
 * This is not a settings field because a deployment moves you seven to nine hours, and
 * a single current-zone value would silently re-render every past record on the day it
 * changed. See LIFE_DASH.md D5.
 */
export const timezonePeriods = pgTable('timezone_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  ianaZone: text('iana_zone').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  note: text('note'),
  ...timestamps,
})
