import { loadPlan } from '@/db/load'
import { adminItemsFor } from '@/core/money/adminItems'
import { allocateAll } from '@/core/money/allocation'
import { OBLIGATIONS } from '@/core/money/obligations'
import { projectPaychecks } from '@/core/money/paychecks'
import { orderQueue } from '@/core/schedule/order'
import {
  DEFAULT_DAY_TEMPLATE,
  fillTemplate,
  survivingIntervals,
  templateIntervalsFor,
  weeklyTemplateMinutes,
} from '@/core/schedule/dayTemplate'
import { subtreeOf } from '@/core/tree'
import { addLocalDays, localDayFor, startOfIsoWeek } from '@/core/time/localDay'
import { Figure } from '@/components/viz'
import type { Item } from '@/core/types'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'
const ZONE = 'America/Chicago'

const hhmm = (d: Date) =>
  d.toLocaleTimeString('en-US', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export default async function WeekPage() {
  const plan = await loadPlan()

  const weekStart = startOfIsoWeek(TODAY)
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart, i))
  // Payday transfers are real, dated, pinned work — they belong in the queue, not
  // only on a finance page nobody opens at 06:00.
  const admin = adminItemsFor(
    allocateAll(projectPaychecks(TODAY, addLocalDays(TODAY, 60)), OBLIGATIONS),
    plan.resolveId('money'),
  )
  const queue = orderQueue([...plan.items, ...admin.items], plan.nodes, TODAY)
  const orderedItems = queue.map((r) => r.item)

  // Template blocks reference seed slugs; resolve them to whatever ids the source uses.
  const template = DEFAULT_DAY_TEMPLATE.map((b) => ({
    ...b,
    nodeId: b.nodeId ? plan.resolveId(b.nodeId) : null,
  }))

  const descendantsOf = new Map<string, Set<string>>()
  const isInDomain = (item: Item, nodeId: string): boolean => {
    if (!item.nodeId) return false
    let set = descendantsOf.get(nodeId)
    if (!set) {
      set = new Set(subtreeOf(plan.nodes, nodeId).map((n) => n.id))
      descendantsOf.set(nodeId, set)
    }
    return set.has(item.nodeId)
  }

  const schedule = days.map((date) => {
    const dayCommitments = plan.commitments.filter((c) => localDayFor(ZONE, c.startsAt) === date)
    const intervals = survivingIntervals(
      templateIntervalsFor(ZONE, date, template),
      dayCommitments,
    )
    const { fills } = fillTemplate(intervals, orderedItems, isInDomain)
    return { date, dayCommitments, fills }
  })

  const todayPlan = schedule.find((d) => d.date === TODAY) ?? schedule[0]!
  const weeklyMinutes = weeklyTemplateMinutes(DEFAULT_DAY_TEMPLATE)
  const scheduledMinutes = schedule.reduce(
    (sum, d) => sum + d.fills.reduce((s, f) => s + f.items.reduce((x, i) => x + i.minutes, 0), 0),
    0,
  )

  return (
    <>
      <h1>This week</h1>
      <p className="sub">
        Week of {weekStart}. The default day reserves blocks by <em>domain</em>, and the queue
        fills them — so the 05:30 block is always &ldquo;LSAT&rdquo;, whatever is top of the
        LSAT queue that morning.{' '}
        <span className="muted">{plan.items.length} items, live from the database.</span>
      </p>

      <div className="cards">
        <Card k="Template offers" v={`${Math.round(weeklyMinutes / 60)}h/wk`} />
        <Card k="Actually scheduled" v={`${Math.round(scheduledMinutes / 6) / 10}h`} tone="good" />
        <Card k="Queue depth" v={String(queue.length)} />
        <Card
          k="Pinned"
          v={String(queue.filter((q) => q.pinned).length)}
          tone="warn"
        />
      </div>

      <h2>Today — {todayPlan.date}</h2>
      <div className="panel">
        {todayPlan.dayCommitments.length > 0 && (
          <div className="muted" style={{ marginBottom: 10 }}>
            Commitments first:{' '}
            {todayPlan.dayCommitments
              .map((c) => `${hhmm(c.startsAt)}–${hhmm(c.endsAt)} ${c.title}`)
              .join(' · ')}
          </div>
        )}
        {todayPlan.fills.length === 0 && (
          <div className="muted">No template blocks survived today&rsquo;s commitments.</div>
        )}
        {todayPlan.fills.map((f) => (
          <div
            key={`${f.interval.block.key}-${f.interval.start.toISOString()}`}
            style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <strong>
                {hhmm(f.interval.start)}–{hhmm(f.interval.end)} · {f.interval.block.label}
              </strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {f.interval.minutes}m
                {f.unusedMinutes > 0 && <span className="warn"> · {f.unusedMinutes}m unused</span>}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {f.interval.block.purpose}
            </div>
            {f.items.length === 0 ? (
              <div className="warn" style={{ fontSize: 13, marginTop: 4 }}>
                Nothing queued for this domain. Left empty on purpose — back-filling it with
                unrelated work would hide the fact that this queue is dry.
              </div>
            ) : (
              <ul className="tight" style={{ marginTop: 4 }}>
                {f.items.map((x) => (
                  <li key={x.item.id}>
                    {x.item.title} <span className="muted">· {x.minutes}m</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <h2>The week</h2>
      <Figure
        title="Default day, applied"
        caption="Commitments carve into template blocks rather than sitting alongside them — a duty day that runs long shrinks that evening's study block instead of double-booking it."
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Blocks</th>
                <th>Scheduled</th>
                <th>Unused</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((d) => {
                const mins = d.fills.reduce(
                  (s, f) => s + f.items.reduce((x, i) => x + i.minutes, 0),
                  0,
                )
                const unused = d.fills.reduce((s, f) => s + f.unusedMinutes, 0)
                return (
                  <tr key={d.date}>
                    <td className={d.date === TODAY ? 'warn' : ''}>{d.date}</td>
                    <td>{d.fills.length}</td>
                    <td>{Math.round(mins / 6) / 10}h</td>
                    <td className={unused > 60 ? 'warn' : 'muted'}>{unused}m</td>
                    <td className="muted" style={{ whiteSpace: 'normal' }}>
                      {d.fills
                        .flatMap((f) => f.items.map((i) => i.item.title))
                        .slice(0, 2)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Figure>

      <h2>The queue</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Effort</th>
              <th>Why here</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r, i) => (
              <tr key={r.item.id}>
                <td className="muted">{r.pinned ? '📌' : i + 1}</td>
                <td style={{ whiteSpace: 'normal' }}>
                  {r.item.title}
                  {r.item.notes && (
                    <details style={{ marginTop: 2 }}>
                      <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                        detail
                      </summary>
                      <pre
                        className="muted"
                        style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '4px 0 0' }}
                      >
                        {r.item.notes}
                      </pre>
                    </details>
                  )}
                </td>
                <td className="muted">{r.item.effortMinutes}m</td>
                <td className={r.pinned ? 'warn' : 'muted'} style={{ whiteSpace: 'normal' }}>
                  {r.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The default day</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Days</th>
              <th>Time</th>
              <th>Reserved for</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_DAY_TEMPLATE.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td className="muted">
                  {b.weekdays.map((d) => 'SMTWTFS'[d]).join('')}
                </td>
                <td className="muted">
                  {String(Math.floor(b.startMinute / 60)).padStart(2, '0')}:
                  {String(b.startMinute % 60).padStart(2, '0')}–
                  {String(Math.floor(b.endMinute / 60)).padStart(2, '0')}:
                  {String(b.endMinute % 60).padStart(2, '0')}
                </td>
                <td className="muted">{b.nodeId ?? 'anything'}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>
                  {b.purpose}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Edit in <code>src/core/schedule/dayTemplate.ts</code>. Deliberately modest — a
          template you miss every day teaches you to ignore the system, and the first thing
          this has to earn is trust.
        </p>
      </div>
    </>
  )
}

function Card({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="panel card">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
    </div>
  )
}
