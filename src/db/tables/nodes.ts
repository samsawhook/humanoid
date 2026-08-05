import {
  boolean,
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
import { timestamps } from './common'
import {
  dateBasis,
  dateConfidence,
  dependencyKind,
  nodeKind,
  nodeLevel,
  nodeStatus,
  proxyDirection,
  proxySource,
  velocityPeriod,
  velocityUnit,
} from './enums'

/**
 * The goal tree. Self-referencing, spans every horizon level.
 *
 * A "domain" is not a separate concept — it is a `level: 'life'` node, and everything
 * below inherits it by walking up. One taxonomy.
 */
export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    title: text('title').notNull(),
    description: text('description'),
    level: nodeLevel('level').notNull(),
    kind: nodeKind('kind').notNull(),
    /**
     * What output counts as achieved. Required for achievement nodes and enforced by
     * the validator, which also rejects definitions phrased as time spent — hours are
     * a cost, not a goal. See LIFE_DASH.md D2.
     */
    outcomeDefinition: text('outcome_definition'),

    targetDate: date('target_date', { mode: 'string' }),
    dateBasis: dateBasis('date_basis'),
    dateConfidence: dateConfidence('date_confidence'),

    /** A deadline can be missed and rescheduled. A window can only be missed. */
    windowOpen: date('window_open', { mode: 'string' }),
    windowClose: date('window_close', { mode: 'string' }),
    windowBasis: text('window_basis'),

    /** A rate of OUTPUT. Computed by the backward pass; never entered by hand. */
    requiredVelocityAmount: numeric('required_velocity_amount'),
    requiredVelocityUnit: velocityUnit('required_velocity_unit'),
    requiredVelocityUnitLabel: text('required_velocity_unit_label'),
    requiredVelocityPeriod: velocityPeriod('required_velocity_period'),
    requiredVelocityComputedAt: timestamp('required_velocity_computed_at', { withTimezone: true }),

    /** Irreversible decisions deserve disproportionate planning effort. */
    reversible: boolean('reversible').notNull().default(true),
    status: nodeStatus('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    byParent: index('nodes_parent_idx').on(t.parentId),
    byLevel: index('nodes_level_idx').on(t.level),
    byWindowClose: index('nodes_window_close_idx').on(t.windowClose),
  }),
)

/**
 * Dependency edges. An edge table rather than an array column so the graph is
 * queryable and referentially sound, and so an edge can carry meaning.
 *
 * Beyond roughly two years this graph is the durable part of the plan — dates are
 * wrong by definition, but what-must-precede-what stays stable.
 */
export const nodeDependencies = pgTable(
  'node_dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    predecessorId: uuid('predecessor_id')
      .notNull()
      .references(() => nodes.id),
    successorId: uuid('successor_id')
      .notNull()
      .references(() => nodes.id),
    kind: dependencyKind('kind').notNull().default('finish_to_start'),
    note: text('note'),
    ...timestamps,
  },
  (t) => ({
    edge: uniqueIndex('node_dependencies_edge').on(t.predecessorId, t.successorId),
  }),
)

/** Stages: dated or window-bound output checkpoints on a node. */
export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id),
    title: text('title').notNull(),
    outcomeDefinition: text('outcome_definition'),
    sequence: integer('sequence').notNull().default(0),
    amount: numeric('amount'),
    unitLabel: text('unit_label'),

    targetDate: date('target_date', { mode: 'string' }),
    dateBasis: dateBasis('date_basis'),
    windowOpen: date('window_open', { mode: 'string' }),
    windowClose: date('window_close', { mode: 'string' }),

    achievedAt: timestamp('achieved_at', { withTimezone: true }),
    evidence: text('evidence'),
    ...timestamps,
  },
  (t) => ({
    byNode: index('milestones_node_idx').on(t.nodeId),
  }),
)

/**
 * Observable behavioral proxies for state nodes.
 *
 * State nodes need these as well as self-ratings. Proxies are what stop feel-goals
 * from being quietly deprioritised against goals that have hard numbers — "time with
 * my people" loses every argument against "LSAT score" unless it also has a number.
 */
export const proxyMetrics = pgTable(
  'proxy_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id),
    key: text('key').notNull(),
    label: text('label').notNull(),
    unitLabel: text('unit_label').notNull(),
    direction: proxyDirection('direction').notNull().default('higher_better'),
    targetAmount: numeric('target_amount'),
    floorAmount: numeric('floor_amount'),
    targetPeriod: velocityPeriod('target_period').notNull().default('week'),
    source: proxySource('source').notNull().default('self_reported'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    byNodeKey: uniqueIndex('proxy_metrics_node_key').on(t.nodeId, t.key),
  }),
)

export const proxyObservations = pgTable(
  'proxy_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    metricId: uuid('metric_id')
      .notNull()
      .references(() => proxyMetrics.id),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    amount: numeric('amount').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    captureId: uuid('capture_id'),
    ...timestamps,
  },
  (t) => ({
    byMetric: index('proxy_observations_metric_idx').on(t.metricId, t.periodStart),
  }),
)

/**
 * Self-rating dimensions. Defined by me, not a generic 1–10 mood score.
 * The evening check-in rotates least-recently-asked first.
 */
export const ratingDimensions = pgTable(
  'rating_dimensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    promptText: text('prompt_text').notNull(),
    scaleMin: integer('scale_min').notNull().default(1),
    scaleMax: integer('scale_max').notNull().default(5),
    nodeId: uuid('node_id').references(() => nodes.id),
    active: boolean('active').notNull().default(true),
    lastAskedAt: timestamp('last_asked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    byKey: uniqueIndex('rating_dimensions_key').on(t.key),
  }),
)

export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dimensionId: uuid('dimension_id')
      .notNull()
      .references(() => ratingDimensions.id),
    ratedAt: timestamp('rated_at', { withTimezone: true }).notNull(),
    value: numeric('value').notNull(),
    note: text('note'),
    captureId: uuid('capture_id'),
    ...timestamps,
  },
  (t) => ({
    byDimension: index('ratings_dimension_idx').on(t.dimensionId, t.ratedAt),
  }),
)
