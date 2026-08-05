/**
 * Apply generated migrations over Neon's HTTP driver.
 *
 * `drizzle-kit migrate` opens a raw TCP connection on 5432, which is blocked in some
 * environments (and is the wrong driver for Vercel serverless anyway). This runs the
 * same generated SQL over HTTPS and keeps drizzle's own bookkeeping table in sync, so
 * `drizzle-kit` stays usable later.
 *
 *   npm run db:migrate
 *
 * Reads .env.local itself (BOM-tolerant), so no --env-file flag is needed.
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

/**
 * Load .env.local ourselves rather than relying on `node --env-file`.
 *
 * PowerShell's `Set-Content -Encoding utf8` writes a UTF-8 BOM, which Node's env-file
 * parser chokes on — the first key silently comes back undefined and you get a
 * confusing "DATABASE_URL is not set". Stripping it here means the command works the
 * same on Windows, macOS and Linux with no flags.
 */
function loadEnvFile(file) {
  if (!existsSync(file)) return
  let text = readFileSync(file, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // BOM
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'))
loadEnvFile(path.join(process.cwd(), '.env'))

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    'DATABASE_URL is not set.\n\n' +
      'Create .env.local in the project root containing:\n' +
      '  DATABASE_URL="postgresql://...".\n\n' +
      'See .env.example.',
  )
  process.exit(1)
}

const sql = neon(url)
const migrationsDir = path.join(process.cwd(), 'drizzle')

try {
  await sql`select 1`
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Could not reach the database.\n  ${message}\n`)
  if (/allowlist|403|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    console.error(
      'That looks like a network policy blocking the Neon host rather than a bad\n' +
        'connection string. Run this from a machine with open outbound HTTPS.',
    )
  }
  process.exit(1)
}

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
