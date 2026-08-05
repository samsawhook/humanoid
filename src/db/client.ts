import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

/**
 * One pool for the process. Neon's pooled connection string handles the rest.
 *
 * Read `DATABASE_URL` lazily rather than at module load so importing this file in a
 * test or a script that never touches the database does not blow up.
 */
let pool: pg.Pool | null = null

export function getDb() {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.')
    pool = new pg.Pool({ connectionString: url })
  }
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof getDb>
export { schema }
