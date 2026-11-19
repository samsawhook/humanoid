import { TIMELINE } from '@/core/money/rates'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll } from '@/core/money/allocation'
import { OBLIGATIONS, ONE_OFFS } from '@/core/money/obligations'
import { localDaysBetween } from '@/core/time/localDay'
import { adminItemsFor } from '@/core/money/adminItems'
import { LANES, PLAN_BARS, PLAN_POINTS, upcoming, type LaneKey } from '@/core/plan/calendar'
import type { LocalDate } from '@/core/types'

export const dynamic = 'force-dynamic'

function todayInTexas(): LocalDate {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) as LocalDate
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nice = (d: string) => {
  const t = new Date(d + 'T12:00:00Z')
  return `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${String(t.getUTCFullYear()).slice(2)}`
}

const FROM = '2026-11-01'
const TO = '2028-10-01'

/**
 * One Gantt, one row per thing: service, the minimesters, both law-school cycles, the
 * job hunt and the money milestones. Bars are spans, diamonds are dates; hatched or
 * faded means the date is my estimate.
 */
function PlanGantt({ today }: { today: LocalDate }) {
  const labelW = 300
  const plotW = 1080
  const W = labelW + plotW + 16
  const rowH = 24
  const laneH = 30
  const top = 34
  const t0 = Date.parse(FROM + 'T00:00:00Z')
  const t1 = Date.parse(TO + 'T00:00:00Z')
  const x = (d: string) => labelW + ((Date.parse(d + 'T00:00:00Z') - t0) / (t1 - t0)) * plotW

  type Row =
    | { kind: 'lane'; lane: (typeof LANES)[number] }
    | { kind: 'bar'; lane: LaneKey; label: string; start: string; end: string; estimated?: boolean; note?: string }
    | { kind: 'point'; lane: LaneKey; label: string; date: string; estimated?: boolean; decision?: boolean; note?: string }
  const rows: Row[] = []
  for (const lane of LANES) {
    rows.push({ kind: 'lane', lane })
    const items: Row[] = [
      ...PLAN_BARS.filter((b) => b.lane === lane.key).map((b) => ({ kind: 'bar' as const, ...b })),
      ...PLAN_POINTS.filter((p) => p.lane === lane.key).map((p) => ({ kind: 'point' as const, ...p })),
    ]
    items.sort((a, b) => {
      const da = a.kind === 'bar' ? a.start : a.kind === 'point' ? a.date : ''
      const db = b.kind === 'bar' ? b.start : b.kind === 'point' ? b.date : ''
      return da < db ? -1 : da > db ? 1 : 0
    })
    rows.push(...items)
  }
  const ys: number[] = []
  let y = top
  for (const r of rows) {
    ys.push(y)
    y += r.kind === 'lane' ? laneH : rowH
  }
  const H = y + 8

  const months: string[] = []
  for (let i = 0; ; i++) {
    const d = new Date(Date.UTC(2026, 10 + i, 1))
    if (d.getTime() > t1) break
    months.push(d.toISOString().slice(0, 10))
  }
  const color = (k: LaneKey) => LANES.find((l) => l.key === k)!.color

  return (
    <div className="gantt-wrap">
      <svg className="gantt" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plan calendar, November 2026 to August 2028">
        {months.map((m) => {
          const jan = m.slice(5, 7) === '01'
          return (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={top - 6} y2={H - 6} stroke="var(--grid)" strokeWidth={jan ? 1.4 : 0.6} />
              <text x={x(m) + 3} y={top - 12} className="g-tick">
                {MON[Number(m.slice(5, 7)) - 1]}
                {jan || m === FROM ? ` ’${m.slice(2, 4)}` : ''}
              </text>
            </g>
          )
        })}
        {rows.map((r, i) => {
          const yy = ys[i]!
          if (r.kind === 'lane') {
            return (
              <g key={`lane-${r.lane.key}`}>
                <rect x={0} y={yy + 2} width={W} height={laneH - 4} fill="var(--panel-2)" rx={4} />
                <rect x={8} y={yy + 10} width={10} height={10} rx={2} fill={r.lane.color} />
                <text x={26} y={yy + 19} className="g-lane">
                  {r.lane.label}
                  {r.lane.note && <tspan className="g-note"> · {r.lane.note}</tspan>}
                </text>
              </g>
            )
          }
          const c = color(r.lane)
          if (r.kind === 'bar') {
            const x0 = Math.max(labelW, x(r.start))
            const w = Math.max(4, Math.min(labelW + plotW, x(r.end)) - x0)
            return (
              <g key={`b-${i}`} className="g-row">
                <title>{`${r.label}: ${nice(r.start)} → ${nice(r.end)}${r.estimated ? ' (estimated)' : ''}${r.note ? ` — ${r.note}` : ''}`}</title>
                <text x={labelW - 10} y={yy + 16} textAnchor="end" className="g-lbl">
                  {r.label}
                </text>
                <rect
                  x={x0}
                  y={yy + 5}
                  width={w}
                  height={rowH - 10}
                  rx={4}
                  fill={c}
                  fillOpacity={r.estimated ? 0.35 : 1}
                  stroke={c}
                  strokeWidth={r.estimated ? 1.5 : 0}
                  strokeDasharray={r.estimated ? '4 3' : undefined}
                />
              </g>
            )
          }
          const cx = x(r.date)
          const s = 7
          return (
            <g key={`p-${i}`} className="g-row">
              <title>{`${r.label}: ${nice(r.date)}${r.estimated ? ' (estimated)' : ''}${r.note ? ` — ${r.note}` : ''}`}</title>
              <text x={labelW - 10} y={yy + 16} textAnchor="end" className={`g-lbl${r.decision ? ' g-decision' : ''}`}>
                {r.decision ? '◇ ' : ''}
                {r.label}
              </text>
              <path
                d={`M${cx},${yy + 12 - s} L${cx + s},${yy + 12} L${cx},${yy + 12 + s} L${cx - s},${yy + 12} Z`}
                fill={r.decision ? 'var(--bg)' : c}
                stroke={r.decision ? 'var(--text)' : 'var(--surface-1)'}
                strokeWidth={r.decision ? 2 : 1.5}
                opacity={r.estimated && !r.decision ? 0.65 : 1}
              />
              <text x={cx + 11} y={yy + 16} className="g-date">
                {nice(r.date)}
              </text>
            </g>
          )
        })}
        <line x1={x(today)} x2={x(today)} y1={top - 6} y2={H - 6} stroke="var(--status-critical)" strokeWidth={2} />
        <text x={x(today) + 4} y={H - 8} className="g-today">
          today
        </text>
      </svg>
    </div>
  )
}

export default function CalendarPage() {
  const today = todayInTexas()
  const allocations = allocateAll(projectPaychecks(today, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
  const admin = adminItemsFor(allocations)
  const laneLabel = (k: LaneKey) => LANES.find((l) => l.key === k)!.label.split(' — ')[0]
  const next = upcoming(today).slice(0, 24)

  return (
    <>
      <h1>Calendar</h1>
      <p className="sub">
        The plan from now to the 2028 school year, one row per thing. Bars are spans, diamonds are dates, ◇ is a decision.
        Dashed or faded means the date is my estimate — hover for the detail.
      </p>

      <div className="viz">
        <PlanGantt today={today} />
      </div>

      <h2>What lands next</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Days</th>
              <th>What</th>
              <th>Area</th>
            </tr>
          </thead>
          <tbody>
            {next.map((e) => {
              const days = localDaysBetween(today, e.date)
              return (
                <tr key={`${e.date}-${e.label}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {nice(e.date)}
                    {e.estimated ? <span className="muted"> ~</span> : ''}
                  </td>
                  <td className={days <= 30 ? 'warn' : ''}>{days}</td>
                  <td style={{ whiteSpace: 'normal' }}>
                    {e.decision ? '◇ ' : ''}
                    {e.label}
                    {e.note && <div className="muted" style={{ fontSize: 12 }}>{e.note}</div>}
                  </td>
                  <td className="muted">{laneLabel(e.lane)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2>Payday admin</h2>
      <p className="sub">
        Each payday&rsquo;s manual transfers as one pinned item. The line-by-line detail is on the Money page&rsquo;s paycheck cards.
      </p>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Due</th>
              <th>What</th>
              <th>Est.</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {admin.items.slice(0, 6).map((i) => (
              <tr key={i.id}>
                <td>{i.dueAt!.toISOString().slice(0, 10)}</td>
                <td>📌 {i.title}</td>
                <td className="muted">{i.effortMinutes}m</td>
                <td className="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {i.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
