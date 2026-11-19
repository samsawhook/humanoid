'use client'

/**
 * The year ahead and the balance sheet over time, for the path you pick.
 *
 * Everything is computed on the server (ledger.ts, paths.ts) and handed in as plain data;
 * this component only switches between paths, spans and accounts.
 */

import { useEffect, useState } from 'react'
import { TrendChart, type TrendSeries } from '@/components/TrendChart'
import type { AccountDef, GroupKey, Ledger, LedgerPoint, PathSummary, Side } from '@/core/money/ledger'
import {
  ARRANGEMENT_LABEL,
  BASE_SELECTION,
  DEFAULT_RATING,
  LOCATION_LABEL,
  OTHER_INCOME,
  PRINCIPLES,
  RETURN_BUDGET,
  WORK_LABEL,
  buildBridge,
  monthlyCash,
  salaryNeeded,
  vaNet,
  type Selection,
} from '@/core/money/returnBudget'

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
  [/Nth/, 'Nth — your business'],
  [/401\(k\)/, 'Investing (401k)'],
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

const PNL_COLOR: Record<string, string> = {
  Home: '#3987e5',
  'Wife & Kids': '#199e70',
  Personal: '#c98500',
  Tech: '#2fb5c9',
  Debt: '#d55181',
  Taxes: '#6b7280',
  Investing: '#9085e9',
  'School & moves': '#d95926',
  Other: '#7d848f',
}

/**
 * P&L over the timeline: income up, costs down (stacked by category), net as a dot.
 * Monthly for a year or eighteen months, quarterly for three to five years, yearly beyond.
 */
function PnlChart({ points, months }: { points: LedgerPoint[]; months: number }) {
  const unit: 'month' | 'quarter' | 'year' = months <= 18 ? 'month' : months <= 60 ? 'quarter' : 'year'
  type Period = { label: string; income: number; out: Record<string, number> }
  const periods: Period[] = []
  const keyOf = (m: string) => {
    const y = m.slice(0, 4)
    const mo = Number(m.slice(5, 7))
    return unit === 'month' ? m : unit === 'quarter' ? `${y} Q${Math.ceil(mo / 3)}` : y
  }
  for (const p of points.filter((x) => x.income > 0 || Object.keys(x.out).length)) {
    const k = keyOf(p.month)
    let per = periods.at(-1)
    if (!per || per.label !== k) {
      per = { label: k, income: 0, out: {} }
      periods.push(per)
    }
    per.income += p.income
    for (const [g, v] of Object.entries(p.out)) per.out[g] = (per.out[g] ?? 0) + v
  }
  if (!periods.length) return null
  const outTotal = (p: Period) => Object.values(p.out).reduce((t, v) => t + v, 0)
  const max = Math.max(1, ...periods.map((p) => Math.max(p.income, outTotal(p))))
  const W = 1000
  const H = 300
  const top = 16
  const mid = top + (H - 40) / 2
  const half = (H - 40) / 2
  const y = (v: number) => (v / max) * half
  const bw = (W - 60) / periods.length
  const groupsOrder = ['Home', 'Wife & Kids', 'Personal', 'Tech', 'Debt', 'Taxes', 'Investing', 'School & moves', 'Other']
  const present = groupsOrder.filter((g) => periods.some((p) => (p.out[g] ?? 0) > 0))
  const fmt = (n: number) => (Math.abs(n) >= 100000 ? `$${Math.round(n / 1000)}k` : usd0(n))
  const label = (k: string) => (unit === 'month' ? monLabel(k).replace(' 20', ' ’') : k)
  const step = Math.ceil(periods.length / 12)
  return (
    <figure className="pnl">
      <figcaption className="fig-title">
        Profit & loss — {unit === 'month' ? 'monthly' : unit === 'quarter' ? 'quarterly' : 'yearly'} · income up, costs down, net ●
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit and loss by period">
        <line x1={50} x2={W - 6} y1={mid} y2={mid} stroke="var(--muted)" strokeWidth={1} />
        {[-1, -0.5, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={50} x2={W - 6} y1={mid - f * half} y2={mid - f * half} stroke="var(--grid)" strokeWidth={0.6} />
            <text x={46} y={mid - f * half + 4} textAnchor="end" className="pnl-axis">
              {f < 0 ? '−' : ''}
              {fmt(Math.abs(f * max))}
            </text>
          </g>
        ))}
        {periods.map((p, i) => {
          const x = 52 + i * bw + bw * 0.15
          const w = bw * 0.7
          let down = mid
          const net = p.income - outTotal(p)
          return (
            <g key={p.label}>
              <title>
                {`${label(p.label)}\nIncome ${usd0(p.income)}\n` +
                  present.map((g) => `${g} −${usd0(p.out[g] ?? 0)}`).join('\n') +
                  `\nNet ${net < 0 ? '−' : '+'}${usd0(Math.abs(net))}`}
              </title>
              <rect x={x} y={mid - y(p.income)} width={w} height={Math.max(0.5, y(p.income))} rx={2} fill="#c9d3df" opacity={0.9} />
              {present.map((g) => {
                const h = y(p.out[g] ?? 0)
                const r = <rect key={g} x={x} y={down} width={w} height={Math.max(0, h - 0.6)} fill={PNL_COLOR[g]} />
                down += h
                return r
              })}
              <circle cx={x + w / 2} cy={mid - y(net)} r={Math.max(2.5, Math.min(5, bw / 6))} fill={net >= 0 ? '#3fc56b' : '#e66767'} stroke="var(--panel)" strokeWidth={1.5} />
              {i % step === 0 && (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" className="pnl-axis">
                  {label(p.label)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="split-legend">
        <span><i className="swatch-dot" style={{ background: '#c9d3df' }} />Income</span>
        {present.map((g) => (
          <span key={g}>
            <i className="swatch-dot" style={{ background: PNL_COLOR[g] }} />
            {g}
          </span>
        ))}
        <span><i className="swatch-dot" style={{ background: '#3fc56b', borderRadius: '50%' }} />Net (red below zero)</span>
      </div>
    </figure>
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
      <PnlChart points={pts} months={months} />
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

export interface ScenarioMeta {
  id: string
  group: 'law' | 'evening' | 'cpa'
  short: string
  label: string
  dependsOn: string[]
}
export interface PlanGap {
  date: string
  label: string
  amount: number
}

const LIGHT_LABEL: Record<string, string> = { green: 'No missing funds', yellow: 'Some missing funds', red: 'Large missing funds' }

/** The quick review: lights, the numbers that decide it, then the months. */
function ReviewHeader({ meta, summary, planGaps }: { meta: ScenarioMeta; summary: PathSummary; planGaps: PlanGap[] }) {
  const gapTotal = planGaps.reduce((t, g) => t + g.amount, 0)
  const nw = (k: string) => summary.netWorth.find((n) => n.label === k)!
  return (
    <>
      <div className="lights">
        <span className={`lightchip lc-${summary.funds}`} title={summary.fundsNote}>
          <i />
          {LIGHT_LABEL[summary.funds]} after you&rsquo;re home
        </span>
        <span className={`lightchip lc-${planGaps.length ? 'yellow' : 'green'}`} title={planGaps.map((g) => `${g.label} ${usd0(g.amount)} (${g.date})`).join(' · ')}>
          <i />
          {planGaps.length ? `${usd0(gapTotal)} not covered in the deployment plan (${planGaps.length})` : 'Deployment plan fully covered'}
        </span>
        <span className="lightchip lc-yellow" title={meta.dependsOn.join(' · ')}>
          <i />
          Depends on {meta.dependsOn.length} things — hover
        </span>
      </div>
      <div className="nw-tiles review-tiles">
        <div title="Income less costs, the first twelve months home">
          <span>First year home</span>
          <b className={summary.firstYearCashFlow >= 0 ? 'ok' : 'bad'}>{summary.firstYearCashFlow >= 0 ? '+' : '−'}{usd0(Math.abs(summary.firstYearCashFlow))}</b>
          <small>{usd0(summary.firstYearIncome)} in · {usd0(summary.firstYearCosts)} out</small>
        </div>
        <div title="Checking + savings, less anything borrowed, at its lowest in the first five years">
          <span>Lowest cash</span>
          <b className={summary.lowCash.value < 0 ? 'bad' : 'ok'}>{usd0(summary.lowCash.value)}</b>
          <small>{monLabel(summary.lowCash.month)}</small>
        </div>
        <div title="The most borrowed at once to cover a gap">
          <span>Most borrowed</span>
          <b className={summary.peakGap > 0 ? 'bad' : 'ok'}>{usd0(summary.peakGap)}</b>
          <small>{summary.monthsShort} of 60 months short</small>
        </div>
        <div title="Cards, Avant, Chase, student loans, the collection — all paid">
          <span>Debt-free</span>
          <b>{summary.debtFree ? monLabel(summary.debtFree) : 'not in 20 yrs'}</b>
          <small>mortgage aside</small>
        </div>
        <div>
          <span>Net worth, 5 yr</span>
          <b className={nw('5 yr').value >= 0 ? 'ok' : 'bad'}>{usd0(nw('5 yr').value)}</b>
          <small>10 yr {usd0(nw('10 yr').value)}</small>
        </div>
        <div>
          <span>Net worth, 20 yr</span>
          <b className="ok">{usd0(nw('20 yr').value)}</b>
          <small>{monLabel(nw('20 yr').month)}</small>
        </div>
      </div>
      <details className="depends">
        <summary>What this depends on</summary>
        <ul>
          {meta.dependsOn.map((d) => (
            <li key={d}>{d}</li>
          ))}
          {planGaps.map((g) => (
            <li key={g.label + g.date}>
              Before you&rsquo;re home: {g.label} — {usd0(g.amount)} not covered ({g.date})
            </li>
          ))}
        </ul>
      </details>
    </>
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
      <h3 className="fig-title" style={{ marginTop: 14 }}>The first twelve months home — tap a heading to open it</h3>
      <YearAhead ledger={ledger} />
      <h3 className="fig-title" style={{ marginTop: 6 }}>Cash, debt and net worth</h3>
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
    </>
  )
}

/** Every scenario side by side — the comparison the PDF made, kept current. */
function AllView({ ledgers, summaries, metas }: { ledgers: Ledger[]; summaries: Record<string, PathSummary>; metas: ScenarioMeta[] }) {
  const [group, setGroup] = useState<'law' | 'evening' | 'cpa' | 'all'>('all')
  const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-4)', 'var(--series-5)', 'var(--series-7)', 'var(--series-3)']
  const shown = metas.filter((m) => group === 'all' || m.group === group)
  // Net worth over twenty years, one line per scenario (≤ 6 at a time keeps it readable).
  const chartSet = (group === 'all' ? ['law_ttu', 'night_uh', 'cpa_fed', 'cpa_mid', 'cpa_sole', 'cpa_country'].map((id) => metas.find((m) => m.id === id)!).filter(Boolean) : shown).slice(0, 6)
  const series: TrendSeries[] = chartSet.map((m, i) => {
    const l = ledgers.find((x) => x.path === m.id)!
    return {
      key: m.id,
      label: m.short,
      color: COLORS[i % COLORS.length]!,
      points: l.points.filter((_, k) => k % 6 === 0 || k > 60).map((p) => ({ date: `${p.month}-28`, value: p.bal ? netWorthOf(p, l) : 0 })),
    }
  })
  const GROUPS_ORDER: ('law' | 'evening' | 'cpa')[] = ['law', 'evening', 'cpa']
  const GL: Record<string, string> = { law: 'Law school, full-time', evening: 'Law at night, with a day job', cpa: 'MAcc → CPA' }
  return (
    <>
      <div className="seg" role="group" aria-label="Which scenarios" style={{ marginBottom: 10 }}>
        {(['all', 'law', 'evening', 'cpa'] as const).map((g) => (
          <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All' : GL[g]}
          </button>
        ))}
      </div>
      <h3 className="fig-title">Net worth, next twenty years{group === 'all' ? ' — one of each kind' : ''}</h3>
      <TrendChart series={series} height={300} ariaLabel="Net worth by scenario" monthly tipTitle="" />
      <div className="tablewrap" style={{ marginTop: 12 }}>
        <table className="baltable alltable">
          <thead>
            <tr>
              <th>Scenario</th>
              <th title="Missing funds after you are home">Funds</th>
              <th>First year</th>
              <th>Lowest cash</th>
              <th>Most borrowed</th>
              <th>Debt-free</th>
              <th>NW 1 yr</th>
              <th>NW 3 yr</th>
              <th>NW 5 yr</th>
              <th>NW 10 yr</th>
              <th>NW 20 yr</th>
            </tr>
          </thead>
          {GROUPS_ORDER.filter((g) => group === 'all' || g === group).map((g) => (
            <tbody key={g}>
              <tr className="side">
                <td colSpan={11}>{GL[g]}</td>
              </tr>
              {metas
                .filter((m) => m.group === g)
                .map((m) => {
                  const sm = summaries[m.id]!
                  const nv = (k: string) => sm.netWorth.find((n) => n.label === k)!.value
                  return (
                    <tr key={m.id} className="acc-static" title={m.dependsOn.join(' · ')}>
                      <td>{m.short}</td>
                      <td>
                        <span className={`lightchip lc-${sm.funds} mini`} title={sm.fundsNote}>
                          <i />
                        </span>
                      </td>
                      <td className={sm.firstYearCashFlow < 0 ? 'neg' : 'ok'}>{usd0(sm.firstYearCashFlow)}</td>
                      <td className={sm.lowCash.value < 0 ? 'neg' : ''}>{usd0(sm.lowCash.value)}</td>
                      <td className={sm.peakGap > 0 ? 'neg' : ''}>{usd0(sm.peakGap)}</td>
                      <td>{sm.debtFree ? monLabel(sm.debtFree) : '—'}</td>
                      {['1 yr', '3 yr', '5 yr', '10 yr', '20 yr'].map((k) => (
                        <td key={k} className={nv(k) < 0 ? 'neg' : ''}>
                          {Math.abs(nv(k)) >= 100000 ? `${nv(k) < 0 ? '−' : ''}$${Math.round(Math.abs(nv(k)) / 1000)}k` : usd0(nv(k))}
                        </td>
                      ))}
                    </tr>
                  )
                })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8, fontSize: 12.5 }}>
        Each scenario starts from where the deployment plan leaves you (the same in all of them) and runs the 20-year model:
        family of five, the house upgrade when cash allows, VA 10% until the claim is decided ~4 months home, then 30%. Funds light: green never short, yellow short but under
        $25k at worst, red more. Hover a row for what it depends on. Pay ladders and city costs are estimates.
      </p>
    </>
  )
}

function netWorthOf(p: { bal: Record<string, number> }, l: Ledger) {
  const debtGroups: GroupKey[] = ['cards', 'mortgage', 'student', 'other']
  const accs = l.accounts
  const side = (debt: boolean) =>
    accs.filter((a) => debtGroups.includes(a.group) === debt).reduce((t, a) => t + (p.bal[a.key] ?? 0), 0)
  return Math.round(side(false) - side(true))
}

/**
 * After you're home: a normal month as a card like the paycheck cards — my best estimates,
 * every line editable — worked backwards to the salary it takes. Edits stay on this device.
 */
const CAT_COLORS: Record<string, string> = {
  home: '#3987e5',
  car: '#d95926',
  sent: '#199e70',
  personal: '#c98500',
  tech: '#2fb5c9',
  debt: '#d55181',
  invest: '#9085e9',
  tax: '#6b7280',
}
const STORE = 'return-budget-v2'

/** Your base, then each modification as a step, to a new total and the salary it takes. */
function BudgetBridge({
  spend,
  other,
  rating,
  loans,
}: {
  spend: number
  other: { va: number; drill: number }
  rating: number
  loans: { student: number; ut: number }
}) {
  const [sel, setSel] = useState<Selection>(BASE_SELECTION)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('return-budget-mods')
      if (raw) setSel({ ...BASE_SELECTION, ...JSON.parse(raw) })
    } catch {}
  }, [])
  const pick = (next: Selection) => {
    setSel(next)
    try {
      window.localStorage.setItem('return-budget-mods', JSON.stringify(next))
    } catch {}
  }
  const b = buildBridge(sel, loans)
  const delta = b.rows.reduce((t, r) => t + r.amount, 0)
  const extraIncome = b.income.reduce((t, r) => t + r.amount, 0)
  const total = spend + delta
  const base = salaryNeeded(spend, other)
  // Income that is not salary goes against the spend before solving for the salary.
  const mod = salaryNeeded(Math.max(0, total - extraIncome), other)
  const gapNoSalary = Math.round(total - extraIncome - monthlyCash(0, other).cash)
  const max = Math.max(1, ...b.rows.map((r) => Math.abs(r.amount)))
  const seg = <K extends keyof Selection>(k: K, opts: Record<string, string>, cast: (x: string) => Selection[K]) => (
    <div className="seg">
      {Object.entries(opts).map(([val, label]) => (
        <button key={val} className={String(sel[k]) === val ? 'on' : ''} onClick={() => pick({ ...sel, [k]: cast(val) })}>
          {label}
        </button>
      ))}
    </div>
  )
  const groups = ['Location', 'Remote / office', 'Type of work', 'School', 'Children'] as const
  return (
    <section className="bridge">
      <h3 className="fig-title">Modifications — your base, then my estimates for each change</h3>
      <div className="mods">
        <div className="mod"><span>Location</span>{seg('location', LOCATION_LABEL, (x) => x as Selection['location'])}</div>
        <div className="mod"><span>Remote / office</span>{seg('arrangement', ARRANGEMENT_LABEL, (x) => x as Selection['arrangement'])}</div>
        <div className="mod"><span>Type of work</span>{seg('work', WORK_LABEL, (x) => x as Selection['work'])}</div>
        <div className="mod"><span>Children</span>{seg('children', { 1: 'One (base)', 2: 'Two', 3: 'Three' }, (x) => Number(x) as Selection['children'])}</div>
        <div className="mod"><span>School</span>{seg('macc', { false: 'Done (base)', true: 'Finishing the MAcc' }, (x) => (x === 'true') as Selection['macc'])}</div>
      </div>
      <div className="bridge-table">
        <div className="br-row br-base">
          <span>Your base — a normal month in Corpus</span>
          <span />
          <b>{usd0(spend)}</b>
        </div>
        {groups.map((g) => {
          const rs = b.rows.filter((r) => r.group === g)
          if (!rs.length) return null
          return (
            <div key={g}>
              <div className="br-group">{g}</div>
              {rs.map((r) => (
                <div className="br-row" key={r.label} title={r.why}>
                  <span>
                    {r.label}
                    <small>{r.why}</small>
                  </span>
                  <span className="br-bar">
                    <i className={r.amount < 0 ? 'down' : 'up'} style={{ width: `${(Math.abs(r.amount) / max) * 100}%` }} />
                  </span>
                  <b className={r.amount < 0 ? 'ok' : 'bad'}>
                    {r.amount < 0 ? '−' : '+'}
                    {usd0(Math.abs(r.amount))}
                  </b>
                </div>
              ))}
            </div>
          )
        })}
        {b.income.map((r) => (
          <div className="br-row" key={r.label} title={r.why}>
            <span>
              {r.label} <small>{r.why}</small>
            </span>
            <span className="br-bar">
              <i className="down" style={{ width: `${(r.amount / Math.max(max, r.amount)) * 100}%` }} />
            </span>
            <b className="ok">+{usd0(r.amount)} in</b>
          </div>
        ))}
        <div className="br-row br-total">
          <span>Modified month</span>
          <span />
          <b>{usd0(total)}</b>
        </div>
      </div>
      <div className="nw-tiles" style={{ marginTop: 10 }}>
        <div>
          <span>Salary needed — base</span>
          <b>{usd0(base.salary)}</b>
          <small>VA {rating}%</small>
        </div>
        {b.noSalary ? (
          <div>
            <span>Full-time school — monthly gap</span>
            <b className={gapNoSalary > 0 ? 'bad' : 'ok'}>{gapNoSalary > 0 ? `−${usd0(gapNoSalary)}` : `+${usd0(-gapNoSalary)}`}</b>
            <small>after VA, drill and GI Bill housing — borrowed or covered by Sommer</small>
          </div>
        ) : (
          <div>
            <span>Salary needed — modified</span>
            <b className={mod.salary > base.salary ? 'bad' : 'ok'}>{usd0(mod.salary)}</b>
            <small>
              {mod.salary >= base.salary ? '+' : '−'}
              {usd0(Math.abs(mod.salary - base.salary))} vs base · city pay ×{b.payScale.toFixed(2)}
            </small>
          </div>
        )}
        <div>
          <span>Offers here</span>
          <b>{usd0(85000 * b.payScale)}</b>
          <small>federal, scaled to the city · mid-size {usd0(78000 * b.payScale)} · small {usd0(65000 * b.payScale)}</small>
        </div>
      </div>
      <details className="depends">
        <summary>Your principles — kept in every version</summary>
        <ul>
          {PRINCIPLES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function ReturnBudget() {
  const [edits, setEdits] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE)
      if (raw) setEdits(JSON.parse(raw))
    } catch {}
  }, [])
  const save = (next: Record<string, number>) => {
    setEdits(next)
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next))
    } catch {}
  }
  const v = (k: string, d: number) => edits[k] ?? d
  const rating = v('rating', DEFAULT_RATING)
  const other = { va: vaNet(rating), drill: v('in:drill', OTHER_INCOME[1]!.amount) }
  const cats = RETURN_BUDGET.map((c) => ({
    ...c,
    total: c.lines.reduce((t, l) => t + v(`${c.key}:${l.key}`, l.amount), 0),
  }))
  const spend = cats.reduce((t, c) => t + c.total, 0)
  const need = salaryNeeded(spend, other)
  const gross = need.grossMonthly
  const pct = (n: number) => (gross > 0 ? `${((n / gross) * 100).toFixed(1)}%` : '')
  const offers = [
    { label: 'Federal / contractor', salary: 85000 },
    { label: 'Mid-size firm', salary: 78000 },
    { label: 'Small firm', salary: 65000 },
  ].map((o) => ({ ...o, left: Math.round(monthlyCash(o.salary, other).cash - spend) }))
  // Export: every line with your number (and mine where you changed it), the totals and
  // the solve — as text to paste back into the chat, or as a file.
  const [copied, setCopied] = useState(false)
  const exportText = () => {
    const out: string[] = [`BACK-HOME BUDGET — exported ${new Date().toISOString().slice(0, 10)}`, '']
    out.push('Income (not salary):')
    out.push(`  VA rating: ${rating}% → ${other.va} a month, net of drill days`)
    for (const l of OTHER_INCOME.filter((x) => x.key !== 'va')) {
      const mine = v(`in:${l.key}`, l.amount)
      out.push(`  ${l.label}: ${mine}${mine !== l.amount ? ` (estimate was ${l.amount})` : ''}`)
    }
    for (const c of cats) {
      out.push('', `${c.label}: ${Math.round(c.total * 100) / 100}`)
      for (const l of c.lines) {
        const mine = v(`${c.key}:${l.key}`, l.amount)
        out.push(`  ${l.label}: ${mine}${mine !== l.amount ? ` (estimate was ${l.amount})` : ''}`)
      }
    }
    out.push(
      '',
      `Spending: ${Math.round(spend)} a month`,
      `Salary needed: ${need.salary} a year (gross ${need.grossMonthly} a month with VA and drill; taxes ${need.taxes}; 401k ${need.k401})`,
      ...offers.map((o) => `${o.label} at ${o.salary}: ${o.left >= 0 ? '+' : ''}${o.left} a month`),
      '',
      `Changed lines: ${Object.keys(edits).length}`,
    )
    return out.join('\n')
  }
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      downloadExport()
    }
  }
  const downloadExport = () => {
    const blob = new Blob([exportText()], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `back-home-budget-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const input = (k: string, d: number) => (
    <input
      type="number"
      inputMode="decimal"
      className={edits[k] !== undefined ? 'edited' : ''}
      value={Math.round(v(k, d) * 100) / 100}
      onChange={(e) => save({ ...edits, [k]: Number(e.target.value) || 0 })}
    />
  )
  const pill = (amount: number, color: string) => (
    <div className="bbar" aria-hidden>
      <span className="bpill" style={{ width: `${Math.min(100, Math.max(2.5, (amount / gross) * 100))}%`, borderColor: color }}>
        <i style={{ width: '100%', background: color, opacity: 0.35 }} />
      </span>
    </div>
  )
  return (
    <section className="rbudget">
      <article className="pcard pcard-wide">
        <header className="pcard-head">
          <div>
            <div className="pcard-tag">After you&rsquo;re home · a normal month · yours to edit</div>
            <div className="pcard-title">Salary needed: {usd0(need.salary)} a year</div>
            <div className="pcard-sub">
              Gross {usd0(gross)} a month with VA and drill · taxes {usd0(need.taxes)} · 401(k) 5% {usd0(need.k401)} · spending {usd0(spend)}
            </div>
          </div>
          <div className="pcard-gross">
            <div className="pcard-big">{usd0(gross)}</div>
            <div className="pcard-sub">gross a month</div>
            <div className="rb-actions">
              <button className="btn-ghost" onClick={() => copyExport()}>
                {copied ? 'Copied ✓' : 'Copy for Claude'}
              </button>
              <button className="btn-ghost" onClick={() => downloadExport()}>
                Download
              </button>
              <button className="btn-ghost" onClick={() => save({})} disabled={Object.keys(edits).length === 0}>
                Reset to my estimates
              </button>
            </div>
          </div>
        </header>
        <div className="rb-offers">
          {offers.map((o) => (
            <span key={o.label} className={`lightchip lc-${o.left >= 0 ? 'green' : o.left > -500 ? 'yellow' : 'red'}`} title="First-year salary on that route, against this budget">
              <i />
              {o.label} {usd0(o.salary)}: {o.left >= 0 ? `+${usd0(o.left)}` : `−${usd0(-o.left)}`}/mo
            </span>
          ))}
        </div>
        <div className="pcard-body">
          <div className="pcol">
            <details className="sec" open>
              <summary>
                <div className="sec-top">
                  <span className="sec-name">
                    <i className="swatch-dot" style={{ background: '#a3aab6' }} />
                    Gross income
                  </span>
                  <span className="sec-amt">{usd0(gross)}</span>
                </div>
              </summary>
              <div className="sec-body">
                <div className="ln rb-line">
                  <div className="ln-top">
                    <div className="ln-name">Salary (needed)</div>
                    <div className="ln-amt">{usd0(need.salary / 12)}<span className="ln-pct">{pct(need.salary / 12)}</span></div>
                  </div>
                </div>
                <div className="ln rb-line" title="VA compensation for a veteran with a spouse and one child, about 2028 rates, less ~39 drill and AT days a year. Your range is 30–80%.">
                  <div className="ln-top">
                    <div className="ln-name">
                      VA disability — <b>{rating}%</b>
                    </div>
                    <div className="ln-amt">{usd0(other.va)}</div>
                  </div>
                  <input
                    className="rb-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={rating}
                    aria-label="VA disability rating"
                    onChange={(e) => save({ ...edits, rating: Number(e.target.value) })}
                  />
                  <div className="rb-ticks">
                    {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => (
                      <span key={t} className={t >= 30 && t <= 80 ? 'in-range' : ''}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                {OTHER_INCOME.filter((l) => l.key !== 'va').map((l) => (
                  <div className="ln rb-line" key={l.key} title={l.basis}>
                    <div className="ln-top">
                      <div className="ln-name">{l.label}</div>
                      <div className="ln-amt">{input(`in:${l.key}`, l.amount)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
            <details className="sec">
              <summary>
                <div className="sec-top">
                  <span className="sec-name">
                    <i className="swatch-dot" style={{ background: CAT_COLORS.tax }} />
                    Taxes & 401(k)
                  </span>
                  <span className="sec-amt">−{usd0(need.taxes + need.k401)}<span className="ln-pct">{pct(need.taxes + need.k401)}</span></span>
                </div>
                {pill(need.taxes + need.k401, CAT_COLORS.tax!)}
              </summary>
              <div className="sec-body">
                <div className="ln"><div className="ln-top"><div className="ln-name">Federal income tax + FICA (Texas has none)</div><div className="ln-amt">{usd0(need.taxes)}</div></div></div>
                <div className="ln"><div className="ln-top"><div className="ln-name">401(k) — your 5%</div><div className="ln-amt">{usd0(need.k401)}</div></div></div>
              </div>
            </details>
          </div>
          <div className="pcol">
            {cats.map((c) => (
              <details className="sec" key={c.key}>
                <summary>
                  <div className="sec-top">
                    <span className="sec-name">
                      <i className="swatch-dot" style={{ background: CAT_COLORS[c.key] }} />
                      {c.label}
                    </span>
                    <span className="sec-amt">−{usd0(c.total)}<span className="ln-pct">{pct(c.total)}</span></span>
                  </div>
                  {pill(c.total, CAT_COLORS[c.key]!)}
                </summary>
                <div className="sec-body">
                  {c.lines.map((l) => (
                    <div className="ln rb-line" key={l.key} title={l.basis}>
                      <div className="ln-top">
                        <div className="ln-name">{l.label}</div>
                        <div className="ln-amt">{input(`${c.key}:${l.key}`, l.amount)}</div>
                      </div>
                      {pill(v(`${c.key}:${l.key}`, l.amount), CAT_COLORS[c.key]!)}
                      <div className="ln-meta"><span>{l.basis}</span></div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </article>
      <BudgetBridge spend={spend} other={other} rating={rating} loans={{ student: v('debt:student', 75.83), ut: v('debt:ut', 129) }} />
    </section>
  )
}

type View = 'paychecks' | 'scenarios' | 'balances' | 'home' | 'briefing'

const NAV: { key: View; label: string; hint: string }[] = [
  { key: 'home', label: 'Back-home budget', hint: 'A normal month home, worked back to the salary' },
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
  metas,
  summaries,
  planGaps,
}: {
  ledgers: Ledger[]
  groups: Group[]
  metas: ScenarioMeta[]
  summaries: Record<string, PathSummary>
  planGaps: PlanGap[]
  paychecks: React.ReactNode
  briefing: React.ReactNode
}) {
  const [view, setViewState] = useState<View>('paychecks')
  const [path, setPath] = useState<string>('law_ttu')
  // The side rail (layout) switches views by the address's #hash.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as View
      setViewState(NAV.some((n) => n.key === h) ? h : 'paychecks')
      window.scrollTo({ top: 0 })
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  const setView = (v: View) => {
    setViewState(v)
    try {
      history.replaceState(null, '', `#${v}`)
    } catch {}
    window.scrollTo({ top: 0 })
  }
  const ledger = ledgers.find((l) => l.path === path) ?? ledgers[0]!
  const meta = metas.find((m) => m.id === ledger.path) ?? metas[0]!
  const GL: Record<string, string> = { law: 'Law, full-time', evening: 'Law at night', cpa: 'MAcc → CPA' }
  const pathPicker = (withAll: boolean) => (
    <div className="picker" role="group" aria-label="Scenario">
      {withAll && (
        <div className="picker-row">
          <span className="picker-label" />
          <button className={path === 'all' ? 'on' : ''} onClick={() => setPath('all')}>
            All — compare
          </button>
        </div>
      )}
      {(['law', 'evening', 'cpa'] as const).map((g) => (
        <div className="picker-row" key={g}>
          <span className="picker-label">{GL[g]}</span>
          {metas
            .filter((m) => m.group === g)
            .map((m) => (
              <button key={m.id} className={m.id === path ? 'on' : ''} onClick={() => setPath(m.id)}>
                {m.short}
              </button>
            ))}
        </div>
      ))}
    </div>
  )
  return (
    <div className="mlayout">
      <div className="mview">
        <div hidden={view !== 'paychecks'}>{paychecks}</div>
        {view === 'home' && (
          <section>
            <h2 style={{ marginTop: 0 }}>Back-home budget</h2>
            <ReturnBudget />
          </section>
        )}
        {view === 'scenarios' && (
          <section className="outlook viz">
            <h2 style={{ marginTop: 0 }}>Return scenarios</h2>
            {pathPicker(true)}
            {path === 'all' ? (
              <AllView ledgers={ledgers} summaries={summaries} metas={metas} />
            ) : (
              <>
                <p className="sub" style={{ margin: '10px 0 8px' }}>
                  <strong>{ledger.label}.</strong> From {monLabel(ledger.homeMonth)}, starting from where the deployment plan leaves you.
                </p>
                <ReviewHeader meta={meta} summary={summaries[ledger.path]!} planGaps={planGaps} />
                <Scenarios ledger={ledger} groups={groups} />
              </>
            )}
          </section>
        )}
        {view === 'balances' && (
          <section className="outlook viz">
            <h2 style={{ marginTop: 0 }}>Balance sheet progression</h2>
            {pathPicker(false)}
            <div style={{ height: 10 }} />
            <Balances ledger={ledger} groups={groups} />
          </section>
        )}
        <div hidden={view !== 'briefing'}>{briefing}</div>
      </div>
    </div>
  )
}
