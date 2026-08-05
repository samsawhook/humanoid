import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Every enum in one file, because adding a value is a migration and it should be
 * obvious where to go to write one.
 */

export const nodeLevel = pgEnum('node_level', ['life', 'decade', 'campaign', 'year', 'quarter'])
export const nodeKind = pgEnum('node_kind', ['achievement', 'state'])
export const nodeStatus = pgEnum('node_status', ['active', 'achieved', 'abandoned', 'deferred'])

/** Only `external_fixed` binds the validator. See LIFE_DASH.md R2. */
export const dateBasis = pgEnum('date_basis', ['external_fixed', 'self_imposed', 'estimated'])
export const dateConfidence = pgEnum('date_confidence', ['low', 'medium', 'high'])

/** Units of OUTPUT. Never of time. See LIFE_DASH.md D2. */
export const velocityUnit = pgEnum('velocity_unit', [
  'milestones',
  'units',
  'currency',
  'rating_points',
])
export const velocityPeriod = pgEnum('velocity_period', ['week', 'month', 'quarter', 'year'])

export const dependencyKind = pgEnum('dependency_kind', ['finish_to_start', 'gates_window'])

export const dateFlexibility = pgEnum('date_flexibility', ['fixed', 'elastic'])
export const itemStatus = pgEnum('item_status', ['todo', 'doing', 'done', 'dropped', 'blocked'])
export const effortConfidence = pgEnum('effort_confidence', ['low', 'medium', 'high'])

export const commitmentSource = pgEnum('commitment_source', ['manual', 'telegram', 'imported'])

export const firmness = pgEnum('firmness', ['firm', 'soft'])

export const outcomeStatus = pgEnum('outcome_status', ['completed', 'partial', 'skipped'])

/**
 * The highest-value signal in the system. "Army ran long" and "didn't feel like it"
 * imply opposite corrections, so they must never collapse into one bucket.
 */
export const skipReason = pgEnum('skip_reason', [
  'external_overrun',
  'no_time',
  'didnt_want_to',
  'did_something_else',
  'blocked_external',
  'other',
])

export const proxyDirection = pgEnum('proxy_direction', [
  'higher_better',
  'lower_better',
  'target_band',
])
export const proxySource = pgEnum('proxy_source', ['self_reported', 'derived_from_outcomes'])

export const channel = pgEnum('channel', ['telegram', 'web', 'sms', 'email'])

export const planScope = pgEnum('plan_scope', [
  'life',
  'decade',
  'campaign',
  'year',
  'quarter',
  'week',
  'day',
])
export const planStatus = pgEnum('plan_status', [
  'draft',
  'validated',
  'rejected',
  'active',
  'superseded',
])
export const severity = pgEnum('severity', ['hard', 'soft'])
export const capacitySource = pgEnum('capacity_source', ['declared', 'demonstrated'])

export const chatRole = pgEnum('chat_role', ['user', 'assistant', 'tool'])
export const outboundKind = pgEnum('outbound_kind', [
  'morning_digest',
  'evening_checkin',
  'alert',
])
export const paramAuthor = pgEnum('param_author', ['me', 'model'])
