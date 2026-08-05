import { NODES, MILESTONES } from '@/core/goals/seed'
import { TIMELINE } from '@/core/money/rates'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll } from '@/core/money/allocation'
import { OBLIGATIONS } from '@/core/money/obligations'
import { localDaysBetween, startOfIsoWeek, addLocalDays } from '@/core/time/localDay'
import { adminItemsFor } from '@/core/money/adminItems'
import { Figure, TableView, Timeline, seriesColor } from '@/components/viz'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'

/**
 * The calendar, at the resolution the horizon actually supports.
 *
 * Not a month grid. At this range a month grid would be mostly empty boxes, and the
 * things that matter — when windows open and shut, when money lands, when the era
 * changes — are spans and points, not days.
 */
export default function CalendarPage() {
  const allocations = allocateAll(projectPaychecks(TODAY, '2027-08-01'), OBLIGATIONS)
  const admin = adminItemsFor(allocations)

  const eras = [
    {
      key: 'premob',
      label: 'Pre-mob',
      start: TIMELINE.premobStart,
      end: TIMELINE.deploymentStart,
      color: seriesColor(3),
    },
    {
      key: 'deployed',
      label: 'Deployed',
      start: TIMELINE.deploymentStart,
      end: TIMELINE.expectedReturn,
      color: seriesColor(0),
      estimated: true,
      note: 'End date is the 11-month read; orders run to ' + TIMELINE.ordersMaxEnd,
    },
    {
      key: 'czte',
      label: 'CZTE',
      start: TIMELINE.czteStart,
      end: TIMELINE.expectedReturn,
      color: seriesColor(2),
      note: 'Tax-free. Cannot be earned at any other time in your life.',
    },
    ...NODES.filter((n) => n.windowClose).map((n, i) => ({
      key: n.id,
      label: n.title,
      start: n.windowOpen ?? TODAY,
      end: n.windowClose!,
      color: seriesColor((i % 3) + 3),
      estimated: n.dateConfidence === 'low',
      note: n.outcomeDefinition ?? undefined,
    })),
  ]

  const upcoming = [
    { label: 'Nannies start', date: '2026-08-09', kind: 'obligation' },
    { label: 'FSA begins', date: TIMELINE.fsaStart, kind: 'pay' },
    { label: 'Ship out — CZTE and IDP begin', date: TIMELINE.deploymentStart, kind: 'era' },
    { label: 'ODP begins', date: TIMELINE.odpStart, kind: 'pay' },
    ...MILESTONES.filter((m) => !m.achievedAt && m.targetDate).map((m) => ({
      label: m.title,
      date: m.targetDate!,
      kind: 'milestone',
    })),
    ...admin.items.slice(0, 8).map((i) => ({
      label: i.title,
      date: i.dueAt!.toISOString().slice(0, 10),
      kind: 'admin',
    })),
  ]
    .map((e) => ({ ...e, days: localDaysBetween(TODAY, e.date) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days)

  const weeks = new Map<string, { pay: number; count: number }>()
  for (const a of allocations) {
    const w = startOfIsoWeek(a.paycheck.payDate)
    const prev = weeks.get(w) ?? { pay: 0, count: 0 }
    weeks.set(w, { pay: prev.pay + a.paycheck.net, count: prev.count + 1 })
  }

  return (
    <>
      <h1>Calendar</h1>
      <p className="sub">
        Spans and points, not a month grid — at this range the only things that matter are
        when windows open and shut, when the era changes, and when money lands.
      </p>

      <h2>The next twelve months</h2>
      <Figure
        title="Eras and windows"
        caption="Hatched bars carry estimated dates. Where CZTE and the deployment overlap is the only period in your life this money can be earned tax-free."
      >
        <Timeline from="2026-07-01" to="2028-03-01" today={TODAY} bars={eras} />
      </Figure>

      <h2>What lands next</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Days</th>
              <th>What</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((e) => (
              <tr key={`${e.date}-${e.label}`}>
                <td>{e.date}</td>
                <td className={e.days <= 45 ? 'warn' : ''}>{e.days}</td>
                <td style={{ whiteSpace: 'normal' }}>{e.label}</td>
                <td className="muted">{e.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Payday admin</h2>
      <p className="sub">
        Each payday&rsquo;s manual transfers, as one pinned item rather than six. Six
        separate to-dos on the 1st is a list you learn to ignore; one item you do in a
        single sitting is a thing that gets done.
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
            {admin.items.slice(0, 8).map((i) => (
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

      <h2>Paydays</h2>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          The 1st and the 15th, shifted back to Friday when they fall on a weekend. Weeks
          with a payday, through the deployment.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Payday</th>
                <th>Net</th>
                <th>Biggest line</th>
                <th>Left over</th>
              </tr>
            </thead>
            <tbody>
              {allocations.slice(0, 14).map((a) => {
                const biggest = [...a.lines].sort((x, y) => y.allocated - x.allocated)[0]
                return (
                  <tr key={a.paycheck.scheduledDate}>
                    <td className="muted">{startOfIsoWeek(a.paycheck.payDate)}</td>
                    <td>{a.paycheck.payDate}</td>
                    <td>${a.paycheck.net.toLocaleString()}</td>
                    <td className="muted">
                      {biggest ? `${biggest.label} $${biggest.allocated.toLocaleString()}` : '—'}
                    </td>
                    <td className="muted">
                      ${a.remainder.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note">
        <strong>Day-level scheduling lives on <a href="/week">This week</a>.</strong> The
        queue, the deterministic re-slotter and the ICS feed are all pure functions — they
        never needed the database, only persistence does. What is still missing is the
        record of what actually happened, which is what the schema is for.
      </div>
    </>
  )
}
