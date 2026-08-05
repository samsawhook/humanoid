/**
 * Apply generated migrations over Neon's HTTP driver.
 *
 * `drizzle-kit migrate` opens a raw TCP connection on 5432, which is blocked in some
 * environments (and is the wrong driver for Vercel serverless anyway). This runs the
 * same generated SQL over HTTPS and keeps drizzle's own bookkeeping table in sync, so
 * `drizzle-kit` stays usable later.
 *
 *   node --env-file=.env.local scripts/migrate.mjs
 */

import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

const sql = neon(url)
const migrationsDir = path.join(process.cwd(), 'drizzle')

await sql`create schema if not exists drizzle`
await sql`
  create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )
`

const applied = await sql`select hash from drizzle.__drizzle_migrations`
const appliedHashes = new Set(applied.map((r) => r.hash))

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

let ran = 0
for (const file of files) {
  const body = await readFile(path.join(migrationsDir, file), 'utf8')
  const hash = createHash('sha256').update(body).digest('hex')

  if (appliedHashes.has(hash)) {
    console.log(`skip  ${file} (already applied)`)
    continue
  }

  // Drizzle separates statements with this marker rather than plain semicolons, which
  // matters because function bodies and check constraints contain semicolons.
  const statements = body
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`apply ${file} (${statements.length} statements)`)
  for (const statement of statements) {
    try {
      await sql.query(statement)
    } catch (error) {
      console.error(`\nFailed in ${file}:\n${statement}\n`)
      throw error
    }
  }

  await sql`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${hash}, ${Date.now()})
  `
  ran++
}

console.log(ran === 0 ? 'Nothing to apply. Database is current.' : `Applied ${ran} migration(s).`)

const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`
console.log(`\n${tables.length} tables:`)
console.log(tables.map((t) => t.table_name).join(', '))
