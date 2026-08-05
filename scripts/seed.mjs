/**
 * Write the code-defined seed into Postgres.
 *
 *   npm run db:seed
 *
 * Idempotent: slugs hash to stable UUIDs (see src/db/ids.ts), so re-running upserts
 * the same rows rather than creating a second copy of the goal tree. Safe to run
 * after editing the seed files.
 *
 * Deliberately NOT destructive — it never deletes. If you remove a node from the seed
 * files it stays in the database until you soft-delete it by hand, because silently
 * dropping goal history is exactly the behaviour that makes a system untrustworthy.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

// ── env ─────────────────────────────────────────────────────────────────────
function loadEnvFile(file) {
  if (!existsSync(file)) return
  let text = readFileSync(file, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.')
  process.exit(1)
}

// ── deterministic ids (mirrors src/db/ids.ts) ───────────────────────────────
const NAMESPACE = '6f1a8c3e-9d2b-4e57-8a10-2c5b7f3d9e41'
function uuidForSlug(slug) {
  const h = createHash('sha1')
  h.update(Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex'))
  h.update(Buffer.from(slug, 'utf8'))
  const b = h.digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const x = b.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}
const id = (slug) => (slug ? uuidForSlug(slug) : null)

// ── load the TS seed modules ────────────────────────────────────────────────
// Run through tsx (see package.json) so these TypeScript imports resolve.
const seed = await import('../src/core/goals/seed.ts')
const itemsMod = await import('../src/core/goals/items.ts')

const sql = neon(process.env.DATABASE_URL)

try {
  await sql`select 1`
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Could not reach the database.\n  ${message}`)
  process.exit(1)
}

let counts = {}
const bump = (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

// ── settings, params, timezone ──────────────────────────────────────────────
await sql`
  insert into settings (id, singleton_guard, birth_date, sex, life_expectancy_source)
  values (${id('settings')}, true, ${'1995-01-01'}, ${'male'},
          ${'SSA period life table — birth_date is a PLACEHOLDER, correct it'})
  on conflict (id) do update set updated_at = now()
`
bump('settings')

for (const [key, value, notes] of [
  ['min_periods_for_throughput', 4, 'Weeks of outcome data before demonstrated capacity binds.'],
  ['max_planning_rounds', 3, 'propose → validate → revise, then escalate.'],
  ['checkin_question_limit', 3, 'Rotating self-rating questions per evening check-in.'],
]) {
  await sql`
    insert into planning_params (id, key, value, notes, updated_by)
    values (${id(`param:${key}`)}, ${key}, ${JSON.stringify(value)}, ${notes}, 'me')
    on conflict (id) do update set value = excluded.value, updated_at = now()
  `
  bump('planning_params')
}

await sql`
  insert into timezone_periods (id, iana_zone, effective_from, note)
  values (${id('tz:chicago')}, 'America/Chicago', '2020-01-01T00:00:00Z',
          'Home of record. Add a Kuwait/CENTCOM period on arrival — do NOT edit this row.')
  on conflict (id) do update set updated_at = now()
`
bump('timezone_periods')

// ── nodes ───────────────────────────────────────────────────────────────────
for (const node of seed.NODES) {
  await sql`
    insert into nodes (
      id, parent_id, title, level, kind, outcome_definition,
      target_date, date_basis, date_confidence,
      window_open, window_close, reversible, status
    ) values (
      ${id(node.id)}, ${id(node.parentId)}, ${node.title}, ${node.level}, ${node.kind},
      ${node.outcomeDefinition}, ${node.targetDate}, ${node.dateBasis}, ${node.dateConfidence},
      ${node.windowOpen}, ${node.windowClose}, ${node.reversible}, ${node.status}
    )
    on conflict (id) do update set
      parent_id = excluded.parent_id, title = excluded.title, level = excluded.level,
      kind = excluded.kind, outcome_definition = excluded.outcome_definition,
      target_date = excluded.target_date, date_basis = excluded.date_basis,
      date_confidence = excluded.date_confidence, window_open = excluded.window_open,
      window_close = excluded.window_close, reversible = excluded.reversible,
      status = excluded.status, updated_at = now()
  `
  bump('nodes')
}

for (const dep of seed.DEPENDENCIES) {
  await sql`
    insert into node_dependencies (id, predecessor_id, successor_id, kind)
    values (${id(`dep:${dep.predecessorId}->${dep.successorId}`)},
            ${id(dep.predecessorId)}, ${id(dep.successorId)}, ${dep.kind})
    on conflict (id) do update set kind = excluded.kind, updated_at = now()
  `
  bump('node_dependencies')
}

for (const m of seed.MILESTONES) {
  await sql`
    insert into milestones (
      id, node_id, title, outcome_definition, sequence, amount, unit_label,
      target_date, date_basis, window_open, window_close, achieved_at
    ) values (
      ${id(m.id)}, ${id(m.nodeId)}, ${m.title}, ${m.outcomeDefinition}, ${m.sequence},
      ${m.amount}, ${m.unitLabel}, ${m.targetDate}, ${m.dateBasis},
      ${m.windowOpen}, ${m.windowClose}, ${m.achievedAt ? m.achievedAt.toISOString() : null}
    )
    on conflict (id) do update set
      title = excluded.title, outcome_definition = excluded.outcome_definition,
      sequence = excluded.sequence, target_date = excluded.target_date,
      achieved_at = excluded.achieved_at, updated_at = now()
  `
  bump('milestones')
}

// ── items and commitments ───────────────────────────────────────────────────
for (const item of itemsMod.ITEMS) {
  await sql`
    insert into items (
      id, node_id, milestone_id, title, effort_minutes, effort_confidence,
      due_at, earliest_start_at, date_flexibility, status,
      recurrence_rule, autopilot_critical, priority_hint
    ) values (
      ${id(item.id)}, ${id(item.nodeId)}, ${id(item.milestoneId)}, ${item.title},
      ${item.effortMinutes}, ${item.effortConfidence},
      ${item.dueAt ? item.dueAt.toISOString() : null},
      ${item.earliestStartAt ? item.earliestStartAt.toISOString() : null},
      ${item.dateFlexibility}, ${item.status},
      ${item.recurrenceRule ?? null}, ${item.autopilotCritical}, ${item.priorityHint ?? null}
    )
    on conflict (id) do update set
      title = excluded.title, effort_minutes = excluded.effort_minutes,
      due_at = excluded.due_at, autopilot_critical = excluded.autopilot_critical,
      priority_hint = excluded.priority_hint, updated_at = now()
  `
  bump('items')
}

for (const c of itemsMod.COMMITMENTS) {
  await sql`
    insert into commitments (id, title, node_id, starts_at, ends_at, all_day, source)
    values (${id(c.id)}, ${c.title}, ${id(c.nodeId)},
            ${c.startsAt.toISOString()}, ${c.endsAt.toISOString()}, ${c.allDay}, 'manual')
    on conflict (id) do update set
      title = excluded.title, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, updated_at = now()
  `
  bump('commitments')
}

// ── capacity budgets ────────────────────────────────────────────────────────
// Ceilings, never targets. Rough first estimates; outcomes will supersede them.
for (const [slug, hours] of [
  ['service', 50],
  ['law', 14],
  ['macc', 10],
  ['money', 4],
  ['family', 30],
  ['health', 8],
]) {
  await sql`
    insert into capacity_budgets (id, node_id, hours_per_week, effective_from, note)
    values (${id(`budget:${slug}`)}, ${id(slug)}, ${hours}, '2026-08-05',
            'Declared estimate. A CEILING, never a target.')
    on conflict (id) do update set hours_per_week = excluded.hours_per_week, updated_at = now()
  `
  bump('capacity_budgets')
}

// ── rating dimensions ───────────────────────────────────────────────────────
for (const [key, label, prompt] of [
  ['connection', 'Connection', 'How connected did you feel to the people who matter today?'],
  ['purpose', 'Purpose', 'Did today move something you actually care about?'],
  ['body', 'Body', 'How did your body feel today?'],
  ['steadiness', 'Steadiness', 'How steady did you feel — not happy, steady?'],
]) {
  await sql`
    insert into rating_dimensions (id, key, label, prompt_text, scale_min, scale_max)
    values (${id(`dim:${key}`)}, ${key}, ${label}, ${prompt}, 1, 5)
    on conflict (id) do update set label = excluded.label,
      prompt_text = excluded.prompt_text, updated_at = now()
  `
  bump('rating_dimensions')
}

console.log('Seeded (idempotent — re-runnable):')
for (const [table, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(3)}  ${table}`)

const [{ count }] = await sql`select count(*)::int as count from nodes where deleted_at is null`
console.log(`\n${count} live nodes in the tree.`)
