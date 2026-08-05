import Link from 'next/link'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, summarize } from '@/core/money/allocation'
import { OBLIGATIONS } from '@/core/money/obligations'
import { TIMELINE } from '@/core/money/rates'
import { localDaysBetween } from '@/core/time/localDay'

export const dynamic = 'force-dynamic'

/**
 * Overview. Deliberately shows windows rather than a to-do list — closure risk is the
 * ranking that matters, and it looks nothing like a normal task list.
 */
export default function HomePage() {
  const today = new Date().toISOString().slice(0, 10)
  const allocations = allocateAll(projectPaychecks(today, '2027-08-01'), OBLIGATIONS)
  const summary = summarize(allocations)
  const next = allocations[0]

  const windows = [
    { label: 'Ship out', date: TIMELINE.deploymentStart, note: 'Pre-mob started 2026-07-31.' },
    { label: 'CZTE opens', date: TIMELINE.czteStart, note: 'Tax-free window. Decide allocation before it opens, not after.' },
    { label: 'FSA starts', date: TIMELINE.fsaStart, note: 'Start date unconfirmed — see rates.ts.' },
    { label: 'ODP starts', date: TIMELINE.odpStart, note: '"60 days from start" was ambiguous; assumed from deployment.' },
    { label: 'Expected return', date: TIMELINE.expectedReturn, note: '11-month read. Orders run to ' + TIMELINE.ordersMaxEnd + '.' },
  ]
    .map((w) => ({ ...w, days: localDaysBetween(today, w.date) }))
    .filter((w) => w.days >= 0)
    .sort((a, b) => a.days - b.days)

  return (
    <>
      <h1>Life Dash</h1>
      <p className="sub">
        Planning across the full horizon. Goals are defined by output, never by hours.
      </p>

      <h2>Windows, nearest first</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Window</th>
              <th>Opens / closes</th>
              <th>Days</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.label}>
                <td>{w.label}</td>
                <td>{w.date}</td>
                <td className={w.days <= 45 ? 'warn' : ''}>{w.days}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>{w.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Next payday</h2>
      <div className="panel">
        {next ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 650 }}>
              {next.paycheck.payDate} — ${next.paycheck.net.toLocaleString()}
            </div>
            <ul className="tight">
              {next.lines.map((l) => (
                <li key={l.key}>
                  {l.label}: ${l.allocated.toLocaleString()}
                  {l.shortfall > 0 && <span className="bad"> (short ${l.shortfall.toLocaleString()})</span>}
                </li>
              ))}
            </ul>
            <div className="muted">Left over: ${next.remainder.toLocaleString()}</div>
          </>
        ) : (
          <span className="muted">No paydays in range.</span>
        )}
        <div style={{ marginTop: 10 }}>
          <Link href="/money">Full cash-flow ladder →</Link>
        </div>
      </div>

      <h2>Status</h2>
      <div className="panel">
        <ul className="tight">
          <li>Pure core (time, validator, capacity, money): <span className="good">built, 61 tests</span></li>
          <li>Schema and migration: <span className="warn">generated, not yet applied</span></li>
          <li>Goal tree and closure-risk ranking: <span className="good">seeded in code</span></li>
          <li>Backward/forward passes, verdict: <span className="muted">not built</span></li>
          <li>Telegram, digests, cron, ICS, chat: <span className="muted">not built</span></li>
        </ul>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Cash-flow shortfall across the deployment: ${summary.totalShortfall.toLocaleString()} over{' '}
          {summary.shortPaydays.length} paydays.
        </p>
      </div>
    </>
  )
}
