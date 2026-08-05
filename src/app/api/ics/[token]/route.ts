import { ITEMS, COMMITMENTS } from '@/core/goals/items'
import { NODES } from '@/core/goals/seed'
import { orderQueue } from '@/core/schedule/order'
import { reslotDay } from '@/core/schedule/reslot'
import { buildIcs } from '@/core/schedule/ics'
import { addLocalDays, localDayFor, startOfIsoWeek } from '@/core/time/localDay'

export const dynamic = 'force-dynamic'

const ZONE = 'America/Chicago'
const DAYS_AHEAD = 28

/**
 * The read-only calendar feed the phone subscribes to.
 *
 * The token lives in the URL path because a calendar subscription cannot send an
 * Authorization header. It is held in ICS_FEED_TOKEN, separate from CRON_SECRET so it
 * rotates independently — and anyone holding the URL can read the plan, which is
 * documented in .env.example.
 *
 * Compared in constant time: a plain === on a secret leaks its length and prefix to a
 * patient attacker, and this endpoint is public by construction.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const expected = process.env.ICS_FEED_TOKEN
  if (!expected) {
    return new Response('ICS feed is not configured.', { status: 503 })
  }

  const { token } = await params
  const bare = token.replace(/\.ics$/, '')
  if (!tokenMatches(bare, expected)) {
    return new Response('Not found', { status: 404 })
  }

  const today = localDayFor(ZONE, new Date())
  const start = startOfIsoWeek(today)
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addLocalDays(start, i))

  const queue = orderQueue(ITEMS, NODES, today)
  const orderedItems = queue.map((r) => r.item)

  const slotted = days.map((d) =>
    reslotDay(
      ZONE,
      d,
      orderedItems,
      COMMITMENTS.filter((c) => localDayFor(ZONE, c.startsAt) === d),
    ),
  )

  const queueTitles = Object.fromEntries(
    slotted.map((s) => [s.localDate, orderedItems.slice(0, 8).map((i) => i.title)]),
  )

  const body = buildIcs(slotted, queueTitles, {
    calendarName: 'Life Dash',
    now: new Date(),
  })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="life-dash.ics"',
    },
  })
}
