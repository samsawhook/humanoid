import { timestamp } from 'drizzle-orm/pg-core'

/**
 * Columns every table carries.
 *
 * `deletedAt` is on everything because all deletes are soft — no exception, including
 * tables where it seems unnecessary today. `captures` additionally is never deleted at
 * all, softly or otherwise.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}
