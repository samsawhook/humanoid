/**
 * Diagnostics. Returns JSON, never throws, never 500s.
 *
 * Exists because a Next.js server exception on a deployment shows you a digest hash
 * and nothing else. This answers, in one request: is the environment wired, is the
 * database reachable, is it migrated, is it seeded, and does the plan actually load.
 *
 * Deliberately reports presence and shape of secrets, never their values.
 */

import { neon } from '@neondatabase/serverless'
import { loadPlan } from '@/db/load'

export const dynamic = 'force-dynamic'

type Check = { ok: boolean; detail: string }

function describeUrl(url: string | undefined): string {
  if (!url) return 'not set'
  try {
    const parsed = new URL(url)
    // Host and database only. Never the password.
    return `${parsed.protocol}//…@${parsed.host}${parsed.pathname}`
  } catch {
    return 'set, but not a parseable URL'
  }
}

export async function GET() {
  const checks: Record<string, Check> = {}

  checks.env_database_url = {
    ok: Boolean(process.env.DATABASE_URL),
    detail: describeUrl(process.env.DATABASE_URL),
  }
  checks.env_ics_token = {
    ok: Boolean(process.env.ICS_FEED_TOKEN),
    detail: process.env.ICS_FEED_TOKEN
      ? `set (${process.env.ICS_FEED_TOKEN.length} chars)`
      : 'not set — the ICS feed will 503, nothing else is affected',
  }
  checks.env_anthropic = {
    ok: Boolean(process.env.ANTHROPIC_API_KEY),
    detail: process.env.ANTHROPIC_API_KEY ? 'set' : 'not set — no LLM features are built yet',
  }

  const counts: Record<string, number> = {}

  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL)
      await sql`select 1`
      checks.db_reachable = { ok: true, detail: 'connected over HTTPS' }

      try {
        const tables = await sql`
          select table_name from information_schema.tables
          where table_schema = 'public'
        `
        checks.db_migrated = {
          ok: tables.length > 0,
          detail: `${tables.length} tables — run \`npm run db:migrate\` if 0`,
        }

        for (const table of ['nodes', 'items', 'commitments', 'milestones', 'capacity_budgets']) {
          try {
            // Table name is from a fixed literal list above, never user input.
            const rows = await sql.query(
              `select count(*)::int as count from ${table} where deleted_at is null`,
            )
            counts[table] = Number(rows[0]?.count ?? 0)
          } catch {
            counts[table] = -1 // table missing
          }
        }

        checks.db_seeded = {
          ok: (counts.nodes ?? 0) > 0,
          detail:
            (counts.nodes ?? 0) > 0
              ? `${counts.nodes} nodes`
              : 'no nodes — run `npm run db:seed`',
        }
      } catch (error) {
        checks.db_migrated = {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        }
      }
    } catch (error) {
      checks.db_reachable = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // The thing every page actually depends on.
  let planSummary: Record<string, unknown> = {}
  try {
    const plan = await loadPlan()
    planSummary = {
      nodes: plan.nodes.length,
      items: plan.items.length,
      commitments: plan.commitments.length,
      milestones: plan.milestones.length,
      capacityBudgets: plan.capacityBudgets.length,
      timezonePeriods: plan.timezonePeriods.length,
    }
    checks.plan_loads = { ok: plan.nodes.length > 0, detail: 'loaded from the database' }
  } catch (error) {
    checks.plan_loads = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  const healthy = Object.values(checks).every((c) => c.ok || c === checks.env_anthropic)

  return Response.json(
    {
      healthy,
      runtime: { node: process.version, vercelEnv: process.env.VERCEL_ENV ?? 'local' },
      checks,
      counts,
      plan: planSummary,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
