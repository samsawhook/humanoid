'use client'

/**
 * The year ahead and the balance sheet over time, for the path you pick.
 *
 * Everything is computed on the server (ledger.ts, paths.ts) and handed in as plain data;
 * this component only switches between paths, spans and accounts.
 */

import { useEffect, useState } from 'react'
import { TrendChart, type TrendSeries } from '@/components/TrendChart'
import type { AccountDef, GroupKey, Ledger, Side } from '@/core/money/ledger'

const usd0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const TODAY = '2026-11-18'

const PATH_SHORT: Record<string, string> = {
  law: 'Law — Lubbock → Austin',
  night: 'Night law — Houston',
  macc: 'MAcc → CPA — Corpus',
  country: 'CPA → countryside',
}

const SPANS: { key: string; label: string; months: number }[] = [
  { key: '1y', label: '1 yr', months: 12 },
  { key: '18m', label: '18 mo', months: 18 },
  { key: '3y', label: '3 yr', months: 36 },
  { key: '5y', label: '5 yr', months: 60 },
  { key: '10y', label: '10 yr', months: 120 },
  { key: '20y', label: '20 yr', months: 240 },
]

const COLOR: Record<GroupKey, string> = {
  cards: 'var(--series-5)',
  mortgage: 'var(--series-1)',
  student: 'var(--series-4)',
  other: 'var(--series-2)',
  tsp: 'var(--series-1)',
  savings: 'var(--series-7)',
  cash: 'var(--series-4)',
  nth: 'var(--series-5)',
  house: 'var(--series-2)',
}

type Group = { key: GroupKey; label: string; side: Side }
type Bal = { bal: Record<string, number> }

const r2 = (n: number) => Math.round(n * 100) / 100

function monthsBetween(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))
}

// ── The months after you are home ────────────────────────────────────────────

const COST_GROUPS: [RegExp, string][] = [
  [/Taxes/, 'Taxes'],
  [/Mortgage|New home|Rent in|Corpus house|cost premium|Rural extras|countryside|Home upgrade/, 'Home'],
  [/Family support|Children|New baby/, 'Wife & Kids'],
  [/Your spending|Tricare|VA waived/, 'Personal'],
  [/Debt payments|UT loan/, 'Debt payments'],
  [/401\(k\)|Nth/, 'Investing'],
  [/Moving|Bar exam|CPA review|Spouse income/, 'School, exams & moves'],
]

function YearAhead({ ledger }: { ledger: Ledger }) {
  if (ledger.yearAhead.length === 0) return null
  return (
    <div className="ya-grid">
      {ledger.yearAhead.map((m) => {
        const groups = new Map<string, { total: number; lines: [string, number][] }>()
        for (const [k, v] of Object.entries(m.costs)) {
          const g = COST_GROUPS.find(([re]) => re.test(k))?.[1] ?? 'Other'
          const e = groups.get(g) ?? { total: 0, lines: [] }
          e.total += v
          e.lines.push([k, v])
          groups.set(g, e)
        }
        return (
          <article className="pcard ya" key={m.month}>
            <div className="pcard-head">
              <div>
                <div className="pcard-tag">{m.phase}</div>
                <div className="pcard-title">{MONTH[Number(m.month.slice(5, 7)) - 1]} {m.month.slice(0, 4)}</div>
              </div>
              <div className={`ya-net ${m.net < 0 ? 'neg' : ''}`}>
                {m.net < 0 ? '−' : '+'}
                {usd0(Math.abs(m.net))}
                <span>{m.net < 0 ? 'short — borrowed' : 'left over'}</span>
              </div>
            </div>
            <details className="sec">
              <summary>
                <div className="sec-top">
                  <span className="sec-name">Income</span>
                  <span className="sec-amt">{usd0(m.totalIncome)}</span>
                </div>
              </summary>
              <div className="sec-body">
                {Object.entries(m.income).map(([k, v]) => (
                  <div className="ln" key={k}>
                    <div className="ln-top">
                      <span className="ln-name">{k}</span>
                      <span className="ln-amt">{usd0(v)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
            {[...groups.entries()].map(([g, e]) => (
              <details className="sec" key={g}>
                <summary>
                  <div className="sec-top">
                    <span className="sec-name">{g}</span>
                    <span className="sec-amt">−{usd0(e.total)}</span>
                  </div>
                </summary>
                <div className="sec-body">
                  {e.lines.map(([k, v]) => (
                    <div className="ln" key={k}>
                      <div className="ln-top">
                        <span className="ln-name">{k}</span>
                        <span className="ln-amt">{usd0(v)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </article>
        )
      })}
    </div>
  )
}

// ── Balances ─────────────────────────────────────────────────────────────────

function groupTotal(p: Bal, accounts: AccountDef[], g: GroupKey) {
  return r2(accounts.filter((a) => a.group === g).reduce((s, a) => s + (p.bal[a.key] ?? 0), 0))
}

function AccountDetail({ ledger, account, side, onClose }: { ledger: Ledger; account: AccountDef; side: Side; onClose: () => void }) {
  const k = account.key
  const start = ledger.opening[k] ?? 0
  const pts = ledger.points
  let end = pts.findIndex((p) => (p.bal[k] ?? 0) <= 0.005)
  const paidOff = side === 'debt' && start > 0 && end >= 0
  if (!paidOff) end = pts.length - 1
  const rows = pts.slice(0, end + 1)
  let paid = 0
  let interest = 0
  for (const p of rows) {
    paid += p.pay[k] ?? 0
    interest += p.int[k] ?? 0
  }
  const series: TrendSeries[] = [
    {
      key: k,
      label: account.label,
      color: COLOR[account.group],
      points: [{ date: TODAY, value: start }, ...rows.map((p) => ({ date: `${p.month}-28`, value: p.bal[k] ?? 0 }))],
    },
  ]
  const payoffMonths = paidOff ? monthsBetween('2026-11', rows.at(-1)!.month) : null
  return (
    <div className="acct">
      <div className="acct-head">
        <h4>{account.label}</h4>
        <button className="btn-ghost" onClick={onClose}>Close ✕</button>
      </div>
      <div className="acct-facts">
        <div><span>Today</span><b>{usd(start)}</b></div>
        {side === 'debt' && (
          <>
            <div>
              <span>Paid off</span>
              <b className={paidOff ? 'ok' : ''}>
                {account.held ? 'Held — not paid' : paidOff ? `${monLabel(rows.at(-1)!.month)}` : 'Not within 20 yrs'}
              </b>
              {payoffMonths !== null && <small>{payoffMonths <= 0 ? 'this month' : `in ${payoffMonths} months`}</small>}
            </div>
            <div><span>Total paid</span><b>{usd0(paid)}</b></div>
            <div><span>Interest</span><b>{usd0(interest)}</b></div>
            {account.apr !== undefined && (
              <div><span>Rate</span><b>{(account.apr * 100).toFixed(2)}%</b>{account.aprNote && <small>{account.aprNote}</small>}</div>
            )}
          </>
        )}
        {side === 'asset' && <div><span>{monLabel(pts.at(-1)!.month)}</span><b>{usd0(pts.at(-1)!.bal[k] ?? 0)}</b></div>}
      </div>
      {account.paidBy && <p className="sub" style={{ margin: '6px 0' }}><strong>How it&rsquo;s paid:</strong> {account.paidBy}</p>}
      {account.note && <p className="sub" style={{ margin: '6px 0' }}>{account.note}</p>}
      <TrendChart series={series} height={220} ariaLabel={`${account.label} balance`} monthly tipTitle="" />
      {side === 'debt' && !account.held && (
        <details className="sec" open={rows.length <= 36}>
          <summary>
            <div className="sec-top">
              <span className="sec-name">Amortization schedule</span>
              <span className="sec-amt">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
            </div>
          </summary>
          <div className="tablewrap">
            <table className="amort">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Payment</th>
                  <th>Interest</th>
                  <th>Principal</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const pay = p.pay[k] ?? 0
                  const int = p.int[k] ?? 0
                  const yearly = i > 60
                  return (
                    <tr key={p.month}>
                      <td>{yearly ? `Year to ${monLabel(p.month)}` : monLabel(p.month)}</td>
                      <td>{usd(pay)}</td>
                      <td>{usd(int)}</td>
                      <td>{usd(pay - int)}</td>
                      <td>{usd(p.bal[k] ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function Balances({ ledger, groups }: { ledger: Ledger; groups: Group[] }) {
  const [span, setSpan] = useState('1y')
  const [open, setOpen] = useState<string | null>(null)
  // The mortgage and the house dwarf everything else; off by default, one tap to add.
  const [hidden, setHidden] = useState<GroupKey[]>(['mortgage', 'house'])
  const toggle = (g: GroupKey) => setHidden(hidden.includes(g) ? hidden.filter((x) => x !== g) : [...hidden, g])
  const months = SPANS.find((s) => s.key === span)!.months
  const lastMonth = (() => {
    const [y, m] = [2026, 11 + months]
    return `${y + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`
  })()
  const pts = ledger.points.filter((p) => p.month <= lastMonth)
  const accs = ledger.accounts
  const opening: Bal = { bal: ledger.opening }

  // Snapshot columns: today, then four steps to the end of the span.
  const cols: { label: string; p: Bal }[] = [{ label: 'Today', p: opening }]
  for (let i = 1; i <= 4; i++) {
    const target = Math.round((pts.length - 1) * (i / 4))
    const p = pts[target]
    if (p && !cols.some((c) => c.label === monLabel(p.month))) cols.push({ label: monLabel(p.month), p })
  }

  const present = (side: Side) =>
    groups.filter((g) => g.side === side).filter((g) => [opening, ...pts].some((p) => groupTotal(p, accs, g.key) > 0.5))
  const chart = (side: Side): TrendSeries[] =>
    present(side)
      .filter((g) => !hidden.includes(g.key))
      .map((g) => ({
        key: g.key,
        label: g.label,
        color: COLOR[g.key],
        points: [
          { date: TODAY, value: groupTotal(opening, accs, g.key) },
          ...pts.map((p) => ({ date: `${p.month}-28`, value: groupTotal(p, accs, g.key) })),
        ],
      }))

  const sideTotal = (p: Bal, side: Side) => groups.filter((g) => g.side === side).reduce((s, g) => s + groupTotal(p, accs, g.key), 0)
  const end = pts.at(-1)!
  const nw0 = sideTotal(opening, 'asset') - sideTotal(opening, 'debt')
  const nw1 = sideTotal(end, 'asset') - sideTotal(end, 'debt')

  const openAcc = open ? accs.find((a) => a.key === open) : null
  const shown = (a: AccountDef) => [opening, ...pts].some((p) => (p.bal[a.key] ?? 0) > 0.5)

  return (
    <section className="balances-tl">
      <div className="paymonth-head">
        <h3>Balances</h3>
        <div className="seg" role="group" aria-label="Timeline">
          {SPANS.map((s) => (
            <button key={s.key} className={s.key === span ? 'on' : ''} onClick={() => setSpan(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="nw-tiles">
        <div><span>Net worth today</span><b>{usd0(nw0)}</b></div>
        <div><span>Net worth {monLabel(end.month)}</span><b>{usd0(nw1)}</b></div>
        <div><span>Change</span><b className={nw1 >= nw0 ? 'ok' : 'bad'}>{nw1 >= nw0 ? '+' : '−'}{usd0(Math.abs(nw1 - nw0))}</b></div>
        <div><span>Debt {monLabel(end.month)}</span><b>{usd0(sideTotal(end, 'debt'))}</b><small>from {usd0(sideTotal(opening, 'debt'))}</small></div>
      </div>
      <div className="bal-charts">
        <figure>
          <figcaption className="fig-title">Debts</figcaption>
          <div className="chips-row">
            {present('debt').map((g) => (
              <button key={g.key} className={`gchip ${hidden.includes(g.key) ? '' : 'on'}`} onClick={() => toggle(g.key)} aria-pressed={!hidden.includes(g.key)}>
                <i className="sw" style={{ background: COLOR[g.key] }} />
                {g.label}
              </button>
            ))}
          </div>
          {chart('debt').length > 0 && <TrendChart series={chart('debt')} height={260} ariaLabel="Debt balances by group" monthly tipTitle="" />}
        </figure>
        <figure>
          <figcaption className="fig-title">Assets</figcaption>
          <div className="chips-row">
            {present('asset').map((g) => (
              <button key={g.key} className={`gchip ${hidden.includes(g.key) ? '' : 'on'}`} onClick={() => toggle(g.key)} aria-pressed={!hidden.includes(g.key)}>
                <i className="sw" style={{ background: COLOR[g.key] }} />
                {g.label}
              </button>
            ))}
          </div>
          {chart('asset').length > 0 && <TrendChart series={chart('asset')} height={260} ariaLabel="Asset balances by group" monthly tipTitle="" />}
        </figure>
      </div>

      <p className="sub" style={{ margin: '10px 0 6px' }}>Tap an account for its payoff schedule and chart.</p>
      <div className="tablewrap">
        <table className="baltable">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          {(['debt', 'asset'] as Side[]).map((side) => (
            <tbody key={side}>
              <tr className="side">
                <td>{side === 'debt' ? 'Debts' : 'Assets'}</td>
                {cols.map((c) => (
                  <td key={c.label}>{usd0(sideTotal(c.p, side))}</td>
                ))}
              </tr>
              {groups
                .filter((g) => g.side === side)
                .map((g) => {
                  const list = accs.filter((a) => a.group === g.key && shown(a))
                  if (list.length === 0) return null
                  return [
                    <tr className="grp" key={`g:${g.key}`}>
                      <td>
                        <i className="sw" style={{ background: COLOR[g.key] }} />
                        {g.label}
                      </td>
                      {cols.map((c) => (
                        <td key={c.label}>{usd0(groupTotal(c.p, accs, g.key))}</td>
                      ))}
                    </tr>,
                    ...list.map((a) => (
                      <tr key={a.key} className={`acc ${open === a.key ? 'on' : ''}`} onClick={() => setOpen(open === a.key ? null : a.key)}>
                        <td>
                          <button className="linkish">{a.label}</button>
                        </td>
                        {cols.map((c) => {
                          const v = c.p.bal[a.key] ?? 0
                          return (
                            <td key={c.label} className={side === 'debt' && v <= 0.005 && (ledger.opening[a.key] ?? 0) > 0 ? 'ok' : ''}>
                              {side === 'debt' && v <= 0.005 && (ledger.opening[a.key] ?? 0) > 0 ? '✓ paid' : usd0(v)}
                            </td>
                          )
                        })}
                      </tr>
                    )),
                  ]
                })}
            </tbody>
          ))}
          <tbody>
            <tr className="side">
              <td>Net worth</td>
              {cols.map((c) => (
                <td key={c.label}>{usd0(sideTotal(c.p, 'asset') - sideTotal(c.p, 'debt'))}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {openAcc && (
        <AccountDetail
          ledger={ledger}
          account={openAcc}
          side={groups.find((g) => g.key === openAcc.group)!.side}
          onClose={() => setOpen(null)}
        />
      )}
      <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>
        While deployed, every payment is the payday plan&rsquo;s. From {monLabel(ledger.homeMonth)}, the path model: $600/mo to
        payable debt (scheduled payments first, then the plan&rsquo;s order), $129/mo to the UT loan, and the path&rsquo;s cash,
        TSP/401(k), Nth and house values. Goldman and PSECU are held flat. Nth counts only what goes in from here.
      </p>
    </section>
  )
}

function Scenarios({ ledger, groups }: { ledger: Ledger; groups: Group[] }) {
  const accs = ledger.accounts
  const side = (p: Bal, sd: Side) => groups.filter((g) => g.side === sd).reduce((t, g) => t + groupTotal(p, accs, g.key), 0)
  const cashOf = (p: Bal) => (p.bal.checking ?? 0) + (p.bal.savings ?? 0) - (p.bal.gap ?? 0)
  const at = (m: string) => ledger.points.find((p) => p.month === m)
  const rows = ledger.yearAhead.map((m) => {
    const p = at(m.month)!
    const i = ledger.points.indexOf(p)
    const prev = ledger.points[i - 1] ?? { bal: ledger.opening }
    const nw = side(p, 'asset') - side(p, 'debt')
    const nwPrev = side(prev, 'asset') - side(prev, 'debt')
    const debtPayable = side(p, 'debt') - groupTotal(p, accs, 'mortgage') - (p.bal.gap ?? 0)
    const debtPrev = side(prev, 'debt') - groupTotal(prev, accs, 'mortgage') - (prev.bal.gap ?? 0)
    return {
      m,
      cash: cashOf(p),
      dCash: cashOf(p) - cashOf(prev),
      debt: debtPayable,
      dDebt: debtPayable - debtPrev,
      nw,
      dNw: nw - nwPrev,
    }
  })
  if (rows.length === 0) return null
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  const first = ledger.points[ledger.points.indexOf(at(rows[0]!.m.month)!) - 1]!
  const signed = (n: number) => `${n < 0 ? '−' : '+'}${usd0(Math.abs(n))}`
  const series: TrendSeries[] = [
    {
      key: 'cash',
      label: 'Cash',
      color: 'var(--series-4)',
      points: [{ date: `${first.month}-28`, value: cashOf(first) }, ...rows.map((r) => ({ date: `${r.m.month}-28`, value: r.cash }))],
    },
    {
      key: 'nw',
      label: 'Net worth',
      color: 'var(--series-1)',
      points: [
        { date: `${first.month}-28`, value: side(first, 'asset') - side(first, 'debt') },
        ...rows.map((r) => ({ date: `${r.m.month}-28`, value: r.nw })),
      ],
    },
    {
      key: 'debt',
      label: 'Debt',
      color: 'var(--series-5)',
      points: [
        { date: `${first.month}-28`, value: side(first, 'debt') - groupTotal(first, accs, 'mortgage') - (first.bal.gap ?? 0) },
        ...rows.map((r) => ({ date: `${r.m.month}-28`, value: r.debt })),
      ],
    },
  ]
  const totIn = sum((r) => r.m.totalIncome)
  const totOut = sum((r) => r.m.totalCosts)
  return (
    <>
      <div className="nw-tiles">
        <div><span>Income, first 12 months</span><b>{usd0(totIn)}</b></div>
        <div><span>Costs</span><b>{usd0(totOut)}</b><small>incl. {usd0(sum((r) => r.m.invested))} invested</small></div>
        <div><span>Net cash flow</span><b className={totIn - totOut >= 0 ? 'ok' : 'bad'}>{signed(totIn - totOut)}</b></div>
        <div><span>Net worth change</span><b className={sum((r) => r.dNw) >= 0 ? 'ok' : 'bad'}>{signed(sum((r) => r.dNw))}</b></div>
      </div>
      <TrendChart series={series} height={260} ariaLabel="Cash, debt and net worth, first year home" monthly tipTitle="" />
      <div className="tablewrap" style={{ marginTop: 10 }}>
        <table className="baltable cf">
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Costs</th>
              <th>Cash flow</th>
              <th>Cash</th>
              <th>Debt</th>
              <th>Δ debt</th>
              <th>Net worth</th>
              <th>Δ NW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.month} className="acc-static">
                <td>
                  {monLabel(r.m.month)}
                  <div className="cf-phase">{r.m.phase}</div>
                </td>
                <td>{usd0(r.m.totalIncome)}</td>
                <td>{usd0(r.m.totalCosts)}</td>
                <td className={r.m.net < 0 ? 'neg' : 'ok'}>{signed(r.m.net)}</td>
                <td className={r.cash < 0 ? 'neg' : ''}>{usd0(r.cash)}</td>
                <td>{usd0(r.debt)}</td>
                <td className={r.dDebt <= 0 ? 'ok' : 'neg'}>{signed(r.dDebt)}</td>
                <td>{usd0(r.nw)}</td>
                <td className={r.dNw >= 0 ? 'ok' : 'neg'}>{signed(r.dNw)}</td>
              </tr>
            ))}
            <tr className="side">
              <td>12 months</td>
              <td>{usd0(totIn)}</td>
              <td>{usd0(totOut)}</td>
              <td>{signed(totIn - totOut)}</td>
              <td>{usd0(rows.at(-1)!.cash)}</td>
              <td>{usd0(rows.at(-1)!.debt)}</td>
              <td>{signed(sum((r) => r.dDebt))}</td>
              <td>{usd0(rows.at(-1)!.nw)}</td>
              <td>{signed(sum((r) => r.dNw))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ margin: '8px 0 14px', fontSize: 12.5 }}>
        Cash flow is income less costs (costs include the 401(k) and Nth). Cash is checking + savings, less anything borrowed to
        cover a gap (below zero = borrowed). Debt leaves out the mortgage and that borrowing, and includes Goldman and PSECU, held flat. Δ NW also counts TSP growth, mortgage principal and house value.
      </p>
      <h3 className="fig-title" style={{ marginTop: 6 }}>Month by month — tap a heading to open it</h3>
      <YearAhead ledger={ledger} />
    </>
  )
}

type View = 'paychecks' | 'scenarios' | 'balances' | 'briefing'

const NAV: { key: View; label: string; hint: string }[] = [
  { key: 'paychecks', label: 'Paycheck allocation', hint: 'Every payday to the end of the deployment' },
  { key: 'scenarios', label: 'Return scenarios', hint: 'First year home, by path' },
  { key: 'balances', label: 'Balance sheet', hint: 'Debts & assets over time' },
  { key: 'briefing', label: 'Briefing & detail', hint: 'Attention items, advice, working' },
]

/** The Money page: a menu on the left, one view at a time. The path choice is shared. */
export function MoneyShell({
  ledgers,
  groups,
  paychecks,
  briefing,
}: {
  ledgers: Ledger[]
  groups: Group[]
  paychecks: React.ReactNode
  briefing: React.ReactNode
}) {
  const [view, setViewState] = useState<View>('paychecks')
  const [path, setPath] = useState<string>('law')
  useEffect(() => {
    const h = window.location.hash.slice(1) as View
    if (NAV.some((n) => n.key === h)) setViewState(h)
  }, [])
  const setView = (v: View) => {
    setViewState(v)
    try {
      history.replaceState(null, '', `#${v}`)
    } catch {}
    window.scrollTo({ top: 0 })
  }
  const ledger = ledgers.find((l) => l.path === path) ?? ledgers[0]!
  const pathPicker = (
    <div className="seg seg-wide" role="group" aria-label="Path">
      {ledgers.map((l) => (
        <button key={l.path} className={l.path === path ? 'on' : ''} onClick={() => setPath(l.path)}>
          {PATH_SHORT[l.path] ?? l.label}
        </button>
      ))}
    </div>
  )
  return (
    <div className="mlayout">
      <nav className="mnav" aria-label="Money views">
        {NAV.map((n) => (
          <button key={n.key} className={n.key === view ? 'on' : ''} onClick={() => setView(n.key)} aria-current={n.key === view}>
            <span>{n.label}</span>
            <small>{n.hint}</small>
          </button>
        ))}
      </nav>
      <div className="mview">
        <div hidden={view !== 'paychecks'}>{paychecks}</div>
        {view === 'scenarios' && (
          <section className="outlook viz">
            <h2 style={{ marginTop: 0 }}>Return scenarios — first year home</h2>
            {pathPicker}
            <p className="sub" style={{ margin: '8px 0 10px' }}>
              <strong>{ledger.label}.</strong> {monLabel(ledger.homeMonth)} to {monLabel(ledger.yearAhead.at(-1)?.month ?? ledger.homeMonth)}, from the
              20-year model, starting from where the deployment plan leaves you.
            </p>
            <Scenarios ledger={ledger} groups={groups} />
          </section>
        )}
        {view === 'balances' && (
          <section className="outlook viz">
            <h2 style={{ marginTop: 0 }}>Balance sheet progression</h2>
            {pathPicker}
            <div style={{ height: 10 }} />
            <Balances ledger={ledger} groups={groups} />
          </section>
        )}
        <div hidden={view !== 'briefing'}>{briefing}</div>
      </div>
    </div>
  )
}
