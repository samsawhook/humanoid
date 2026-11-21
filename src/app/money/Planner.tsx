'use client'

/**
 * The planner: return scenarios and the balance sheet in one place, with levers.
 *
 * Pick a scenario, move a lever, and the twenty-year model (paths.ts → ledger.ts) runs
 * again in the browser. Each lever starts at the scenario's own assumption; anything you
 * change is marked and can be reset. Every lever applies from the month you are home —
 * the deployment months are the payday plan itself and do not move.
 */

import { useEffect, useMemo, useState } from 'react'
import { buildLedger, buildSommerLedger, summarize, type GroupKey, type Ledger, type Side } from '@/core/money/ledger'
import { emergencyMonths, reenlistOf, reshapeLadder, saleMonth, type PathMonth } from '@/core/money/paths'
import { SCENARIOS, type Scenario } from '@/core/money/scenarios'
import { VA_MONTHLY } from '@/core/money/returnBudget'
import { AllView, Balances, type Period, type PlanGap, type ScenarioMeta } from './Outlook'
import { PaydayCard } from './PaydayFocus'
import { periodStatement } from '@/core/money/planStatement'

type Group = { key: GroupKey; label: string; side: Side }
type A = Scenario['a']

const usd0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const STORE = 'planner-v2'
type Who = 'sam' | 'sommer' | 'both'
const ledgerFor = (sc: Scenario, who: Who) => (who === 'sommer' ? buildSommerLedger(sc) : buildLedger(sc))

/** Every lever, as values. A scenario's own assumptions give the starting set. */
interface Levers {
  who: Who
  houseSell: boolean
  houseMonth: string
  bonus: number
  bonusMonth: string
  va: number
  child2: string | null
  child3: string | null
  carReplace: string | null
  carPrice: number
  carDown: number
  carSommer: number
  emergCount: number
  emergFirst: string
  emergEvery: number
  emergSize: number
  summer1L: number
  summer2L: number
  jobStart: string
  jobSalary: number
  signing: number
  partTime: number
  partTimeFrom: string
  lawLoans: boolean
  firmBar: boolean
  sommerHome: boolean
  sommerPT: number
}

export function baseLevers(sc: Scenario): Levers {
  const a = sc.a
  const sale = saleMonth(sc.path, a)
  const bonus = reenlistOf(sc.path, a)
  return {
    who: a.sommer.included ? 'both' : 'sam',
    houseSell: !!sale,
    houseMonth: sale ?? a.law.schoolStart,
    bonus: bonus?.bonus ?? 0,
    bonusMonth: bonus?.month ?? a.law.reenlistMonth,
    va: a.vaRating,
    child2: a.family.births[1] ?? null,
    child3: a.family.births[2] ?? null,
    carReplace: a.car.replaceMonth,
    carPrice: a.car.price,
    carDown: a.car.downShare,
    carSommer: a.car.sommerShare,
    emergCount: a.emergencies.count,
    emergFirst: a.emergencies.first,
    emergEvery: a.emergencies.everyMonths,
    emergSize: a.emergencies.size,
    summer1L: a.law.summerGross['2028'] ?? 0,
    summer2L: a.law.summerGross['2029'] ?? 0,
    jobStart: sc.path === 'law' ? a.law.jobStart : a.macc.jobStart,
    jobSalary: Math.round(sc.path === 'law' ? a.law.salary[0]![1] : a.macc.salary[0]![1] * (sc.path === 'night' ? a.night.dayJobScale : 1)),
    signing: a.signingBonus,
    partTime: a.law.partTime.monthly,
    partTimeFrom: a.law.partTime.from,
    lawLoans: a.law.loans.enabled,
    firmBar: a.law.firmPaysBar,
    sommerHome: a.sommer.homeRule,
    sommerPT: a.sommer.partTimeShare,
  }
}

export function apply(sc: Scenario, l: Levers): Scenario {
  const a: A = {
    ...sc.a,
    houseSaleMonth: l.houseSell ? l.houseMonth : null,
    sommer: { ...sc.a.sommer, included: l.who === 'both', homeRule: l.sommerHome, partTimeShare: l.sommerPT },
    law: {
      ...sc.a.law,
      house: l.houseSell ? 'sell' : 'rent',
      summerGross: { '2028': l.summer1L, '2029': l.summer2L },
      partTime: { monthly: l.partTime, from: l.partTimeFrom },
      loans: { ...sc.a.law.loans, enabled: l.lawLoans },
      firmPaysBar: l.firmBar,
      ...(sc.path === 'law' ? { jobStart: l.jobStart, salary: reshapeLadder(sc.a.law.salary, l.jobStart, l.jobSalary) } : {}),
    },
    macc:
      sc.path === 'law'
        ? sc.a.macc
        : { ...sc.a.macc, jobStart: l.jobStart, salary: reshapeLadder(sc.a.macc.salary, l.jobStart, l.jobSalary / (sc.path === 'night' ? sc.a.night.dayJobScale : 1)) },
    signingBonus: l.signing,
    reenlist: { bonus: l.bonus, month: l.bonusMonth },
    vaRating: l.va,
    vaMonthly: VA_MONTHLY[l.va] ?? sc.a.vaMonthly,
    family: { ...sc.a.family, births: [sc.a.family.births[0]!, ...[l.child2, l.child3].filter((b): b is string => !!b)].sort() },
    car: { ...sc.a.car, replaceMonth: l.carReplace, price: l.carPrice, downShare: l.carDown, sommerShare: l.carSommer },
    emergencies: { count: l.emergCount, first: l.emergFirst, everyMonths: l.emergEvery, size: l.emergSize },
  }
  return { ...sc, a }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const cashOfBal = (b: Record<string, number>) => (b.checking ?? 0) + (b.savings ?? 0) - (b.gap ?? 0)
const cashOfP = (p: { bal: Record<string, number> }) => (p.bal.checking ?? 0) + (p.bal.savings ?? 0) - (p.bal.gap ?? 0)

/** Solvency over the whole plan, from the month you are home. */
function solvency(l: Ledger) {
  const home = l.points.filter((p) => p.month >= l.homeMonth)
  let low = home[0]!
  for (const p of home) if (cashOfP(p) < cashOfP(low)) low = p
  const below = home.filter((p) => cashOfP(p) < -0.5)
  const peak = Math.max(0, ...l.points.map((p) => p.bal.gap ?? 0))
  const firstBelow = below[0]?.month ?? null
  const lastBelow = below.at(-1)?.month ?? null
  const light: 'green' | 'yellow' | 'red' = peak > 25000 ? 'red' : below.length ? 'yellow' : 'green'
  return { low: { value: cashOfP(low), month: low.month }, peak, firstBelow, lastBelow, light }
}

// ── Small controls ───────────────────────────────────────────────────────────

const showVal = (v: unknown) =>
  typeof v === 'number' ? (v >= 1000 ? usd0(v) : String(v)) : typeof v === 'boolean' ? (v ? 'on' : 'off') : v == null ? 'none' : /^\d{4}-\d{2}$/.test(String(v)) ? monLabel(String(v)) : String(v)

/** One lever: its title and current value, the controls, and a reset when changed. */
function Lever({ title, value, changed, onReset, children, hint }: { title: string; value: string; changed: boolean; onReset: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <div className={`lever ${changed ? 'changed' : ''}`}>
      <div className="lever-head">
        <span className="lever-title">
          {title}
          {changed && <i className="lever-dot" title="Changed from the scenario" />}
        </span>
        <span className="lever-val">{value}</span>
      </div>
      <div className="lever-body">{children}</div>
      {hint && <div className="lever-hint">{hint}</div>}
      {changed && (
        <button className="linkish lever-reset" onClick={onReset}>
          Reset to the scenario
        </button>
      )}
    </div>
  )
}

function Money({ value, onChange, step = 500, label }: { value: number; onChange: (n: number) => void; step?: number; label?: string }) {
  return (
    <label className="lv-field">
      {label && <span>{label}</span>}
      <span className="lv-money">
        $
        <input type="number" inputMode="numeric" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      </span>
    </label>
  )
}

function Month({ value, onChange, label, min = '2027-07' }: { value: string; onChange: (m: string) => void; label?: string; min?: string }) {
  return (
    <label className="lv-field">
      {label && <span>{label}</span>}
      <input type="month" min={min} max="2046-11" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  )
}

function Seg<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg seg-sm">
      {options.map(([v, l]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** A period of the plan in the paycheck card's format. */
function PeriodCard({ ledger, p }: { ledger: Ledger; p: Period }) {
  const months = ledger.months.filter((m) => p.months.includes(m.month))
  const n = Math.max(1, months.length)
  // A quarter or a year shows its typical month: every line averaged over the period, and
  // the balances moved by a month's share of the period's change.
  const avg = (rec: (m: PathMonth) => Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const m of months) for (const [k, v] of Object.entries(rec(m))) out[k] = (out[k] ?? 0) + v / n
    return out
  }
  const typical: PathMonth[] =
    n === 1
      ? months
      : [
          {
            ...months.at(-1)!,
            income: avg((m) => m.income),
            costs: avg((m) => m.costs),
            invested: months.reduce((t, m) => t + m.invested, 0) / n,
            borrowed: months.reduce((t, m) => t + (m.borrowed ?? 0), 0) / n,
            phase: p.phase,
          },
        ]
  const keys = new Set([...Object.keys(p.start), ...Object.keys(p.end)])
  const end = n === 1 ? p.end : Object.fromEntries([...keys].map((k) => [k, (p.start[k] ?? 0) + ((p.end[k] ?? 0) - (p.start[k] ?? 0)) / n]))
  const st = periodStatement(p.label, typical, p.start, end, { of: (g) => ledger.accounts.filter((a) => a.group === g).map((a) => a.key) })
  return (
    <PaydayCard
      st={st}
      tag={p.phase}
      title={n === 1 ? p.label : `Typical month — ${p.label}`}
      subtitle={n === 1 ? 'One month' : `The average of its ${n} months; cash starts where the period starts`}
      showActuals={false}
      checkingBefore={r2(cashOfBal(p.start))}
      checkingAfter={r2(cashOfBal(end))}
      savings={0}
      short={0}
      spendable=""
    />
  )
}

/** When the home rule puts Sommer at home, from the model's own months. */
function homeMonths(ledger: Ledger): string {
  const ms = ledger.months.filter((m) => 'Sommer at home — her household bills' in m.costs || 'Children under 5 (care costs; Sommer home, no childcare)' in m.costs).map((m) => m.month)
  if (!ms.length) return 'On this path it never triggers.'
  const runs: [string, string][] = []
  for (const m of ms) {
    const r = runs.at(-1)
    if (r && addMonthsLocal(r[1], 1) === m) r[1] = m
    else runs.push([m, m])
  }
  return `On this path: ${runs.map(([a, b]) => (a === b ? monLabel(a) : `${monLabel(a)} – ${monLabel(b)}`)).join(', ')}.`
}

/** The federal loans as borrowed: per school year, owed at repayment, and the payment. */
function loanSummary(ledger: Ledger): string {
  const byYear = new Map<string, number>()
  for (const m of ledger.months)
    if ((m.borrowed ?? 0) > 0) {
      const y = Number(m.month.slice(0, 4)) - (m.month.slice(5) < '08' ? 1 : 0)
      byYear.set(`${y}–${String(y + 1).slice(2)}`, (byYear.get(`${y}–${String(y + 1).slice(2)}`) ?? 0) + m.borrowed)
    }
  const first = ledger.months.find((m) => m.costs['Law-school loans — Tiered Standard repayment'])
  const owed = first ? ledger.months[ledger.months.indexOf(first) - 1]?.lawLoans ?? 0 : 0
  const parts = [...byYear.entries()].map(([y, v]) => `${y} ${usd0(v)}`).join(', ')
  return parts
    ? `Direct Unsubsidized, 8.07%, only what each year needs: ${parts} (after the fee). ${usd0(owed)} owed when repayment starts ${first ? monLabel(first.month) : ''}; ${first ? usd0(first.costs['Law-school loans — Tiered Standard repayment']!) : ''}/mo on the Tiered Standard plan. Limit $50k a year, $200k in all; no Grad PLUS for new borrowers.`
    : 'No federal loans needed: cash stays above zero through school.'
}

// ── Results ──────────────────────────────────────────────────────────────────

/** The numbers a decision turns on, from one run of the model. */
function kpis(l: Ledger) {
  const cashAt = cashAtOf(l)
  const home = l.months.filter((m) => m.month >= l.homeMonth)
  let low = home[0]!
  for (const m of home) if (cashAt(m) < cashAt(low)) low = m
  const short = home.filter((m) => cashAt(m) < -500)
  const yr = (from: number) => home.slice(from, from + 12)
  const net = (ms: PathMonth[]) => ms.reduce((t, m) => t + m.net, 0)
  const y1 = yr(0)
  // "Settled": the second year in the full-time job (the third year home if there is none).
  const job = home.findIndex((m) => (m.income['Salary'] ?? 0) > 0 || (m.income['Practice revenue (fees billed)'] ?? 0) > 0)
  const settledFrom = job >= 0 ? job + 12 : 24
  const y3 = yr(settledFrom)
  const y3Out = y3.reduce((t, m) => t + m.totalCosts, 0) / Math.max(1, y3.length)
  const y3In = y3.reduce((t, m) => t + m.totalIncome, 0)
  const saved = y3.reduce((t, m) => t + m.invested + m.net, 0)
  const cash3 = y3.length ? cashAt(y3.at(-1)!) : 0
  const bal = (p: { bal: Record<string, number> }, keys: string[]) => keys.reduce((t, k) => t + (p.bal[k] ?? 0), 0)
  const CONSUMER = ['platinum', 'brightway', 'credit_one', 'citi', 'capital_one', 'avant', 'chase', 'caine', 'car', 'arrears', 'car_new']
  const ALL = [...CONSUMER, 'student_loan', 'ut_loan', 'law_loans']
  const consumerFree = l.points.find((p) => p.month >= l.homeMonth && bal(p, CONSUMER) <= 0.5)?.month ?? null
  const allFree = l.points.find((p) => p.month >= l.homeMonth && bal(p, ALL) <= 0.5)?.month ?? null
  const nwAt = (n: number) => {
    const p = l.points.find((x) => x.month >= addMonthsLocal('2026-11', n)) ?? l.points.at(-1)!
    return netWorthOfLedger(p, l)
  }
  const last = l.points.at(-1)!
  const lawPeak = Math.max(0, ...l.months.map((m) => m.lawLoans ?? 0))
  const lawPmt = l.months.find((m) => m.costs['Law-school loans — Tiered Standard repayment'])?.costs['Law-school loans — Tiered Standard repayment'] ?? 0
  const borrowedY1 = y1.reduce((t, m) => t + (m.borrowed ?? 0), 0)
  return {
    settledLabel: y3.length ? `${monLabel(y3[0]!.month)} – ${monLabel(y3.at(-1)!.month)}` : '',
    borrowedY1,
    low: cashAt(low),
    lowMonth: low.month,
    monthsShort: short.length,
    peakBorrow: Math.max(0, ...l.points.map((p) => p.bal.gap ?? 0)),
    firstYear: net(y1),
    monthly3: net(y3) / Math.max(1, y3.length),
    runway: y3Out > 0 ? Math.max(0, cash3) / y3Out : 0,
    savingsRate: y3In > 0 ? saved / y3In : 0,
    consumerFree,
    allFree,
    nw5: nwAt(60),
    nw10: nwAt(120),
    nw20: nwAt(240),
    retire20: bal(last, ['tsp']),
    lawPeak,
    lawPmt,
  }
}
type Kpis = ReturnType<typeof kpis>

function addMonthsLocal(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const i = y! * 12 + (mo! - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
function netWorthOfLedger(p: { bal: Record<string, number> }, l: Ledger) {
  const side = (sd: string) => l.accounts.filter((a) => GROUP_SIDE[a.group] === sd).reduce((t, a) => t + (p.bal[a.key] ?? 0), 0)
  return side('asset') - side('debt')
}
const GROUP_SIDE: Record<string, string> = { cards: 'debt', mortgage: 'debt', student: 'debt', other: 'debt', tsp: 'asset', savings: 'asset', cash: 'asset', nth: 'asset', house: 'asset' }

/**
 * The dashboard: one tile per question a decision turns on, each coloured by how it reads,
 * and — when levers are changed — how far they moved it from the scenario's own run.
 */
function KpiDash({ k, base, solv }: { k: Kpis; base: Kpis | null; solv: ReturnType<typeof solvency> }) {
  const signed = (n: number) => `${n < 0 ? '−' : '+'}${usd0(Math.abs(n))}`
  const kfmt = (n: number) => (Math.abs(n) >= 1e6 ? `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e5 ? `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n) / 1000)}k` : usd0(n))
  const delta = (cur: number, b: number | undefined, better: 'up' | 'down', fmt = signed) => {
    if (base == null || b == null || Math.abs(cur - b) < 1) return null
    const good = better === 'up' ? cur > b : cur < b
    return <em className={good ? 'ok' : 'bad'}>{fmt(cur - b)} vs scenario</em>
  }
  const monthDelta = (cur: string | null, b: string | null | undefined) => {
    if (base == null || cur === b) return null
    if (!cur || !b) return <em className={cur ? 'ok' : 'bad'}>{cur ? 'sooner than scenario' : 'later than scenario'}</em>
    const d = (Number(cur.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(cur.slice(5)) - Number(b.slice(5))
    return <em className={d < 0 ? 'ok' : 'bad'}>{d < 0 ? `${-d} mo sooner` : `${d} mo later`}</em>
  }
  const tone = (v: number, warn: number, bad: number, higherBetter = true) => (higherBetter ? (v >= warn ? 'ok' : v >= bad ? 'warn' : 'bad') : v <= warn ? 'ok' : v <= bad ? 'warn' : 'bad')
  const tiles: { t: string; v: string; sub: string; cls: string; d?: React.ReactNode; tip: string }[] = [
    {
      t: 'Funded?',
      v: solv.light === 'green' ? 'Yes' : solv.light === 'yellow' ? 'Mostly' : 'No',
      sub: k.monthsShort ? `${k.monthsShort} months with a funding gap over $500` : 'Never a funding gap over $500',
      cls: solv.light === 'green' ? 'ok' : solv.light === 'yellow' ? 'warn' : 'bad',
      d: delta(k.monthsShort, base?.monthsShort, 'down', (n) => `${n > 0 ? '+' : ''}${n} mo`),
      tip: 'A funding gap is a month where the plan spends more cash than you have: the money has to come from somewhere — savings, family, a credit line. Over the whole plan from the month you are home.',
    },
    {
      t: 'Max cash funding gap',
      v: k.low < 0 ? kfmt(-k.low) : '$0',
      sub: k.low < 0 ? `${monLabel(k.lowMonth)} · to find: savings, family or a credit line` : `lowest cash ${kfmt(k.low)}, ${monLabel(k.lowMonth)}`,
      cls: tone(Math.max(0, -k.low), 0, 10000, false),
      d: delta(Math.max(0, -k.low), base ? Math.max(0, -base.low) : undefined, 'down'),
      tip: 'The most cash the plan is short at once after you are home — beyond any student loans. The model charges ~8% on it until it is made up.',
    },
    {
      t: 'First year home',
      v: signed(k.firstYear),
      sub: `${signed(k.firstYear / 12)}/mo average${k.borrowedY1 ? ` · before ${usd0(k.borrowedY1)} of loans` : ''}`,
      cls: tone(k.firstYear, 0, -12000),
      d: delta(k.firstYear, base?.firstYear, 'up'),
      tip: 'Income less costs over the first twelve months home (costs include investing).',
    },
    {
      t: 'Monthly margin, settled',
      v: `${signed(k.monthly3)}/mo`,
      sub: `2nd year in the job: ${k.settledLabel}`,
      cls: tone(k.monthly3, 500, 0),
      d: delta(k.monthly3, base?.monthly3, 'up'),
      tip: 'Average income less costs a month in the second year of the full-time job (the third year home if there is none): the slack the plan runs on once settled.',
    },
    {
      t: 'Emergency cushion',
      v: `${k.runway.toFixed(1)} mo`,
      sub: 'of costs in cash, end of the settled year',
      cls: tone(k.runway, 3, 1),
      d: delta(k.runway, base?.runway, 'up', (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} mo`),
      tip: 'Cash at the end of the settled year divided by a month of costs. Three to six months is the usual target.',
    },
    {
      t: 'Saving rate, settled',
      v: `${Math.round(k.savingsRate * 100)}%`,
      sub: 'of income invested or kept',
      cls: tone(k.savingsRate, 0.15, 0.05),
      d: delta(k.savingsRate * 100, base ? base.savingsRate * 100 : undefined, 'up', (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)} pts`),
      tip: '401(k), Nth and what is left over, as a share of income, in the settled year. 15% or more is the usual guide.',
    },
    {
      t: 'Cards & loans clear',
      v: k.consumerFree ? monLabel(k.consumerFree) : 'Not in 20 yrs',
      sub: k.allFree ? `student loans too: ${monLabel(k.allFree)}` : 'student loans: not in 20 yrs',
      cls: k.consumerFree && k.consumerFree <= '2030-12' ? 'ok' : k.consumerFree ? 'warn' : 'bad',
      d: monthDelta(k.consumerFree, base?.consumerFree),
      tip: 'When cards, Avant, Chase, the collection and any car loan are paid off; then when the student loans are too. Goldman and PSECU are held aside.',
    },
    ...(k.lawPeak > 0
      ? [
          {
            t: 'Law-school loans',
            v: kfmt(k.lawPeak),
            sub: `owed at most; ${usd0(k.lawPmt)}/mo from repayment`,
            cls: tone(k.lawPeak, 60000, 120000, false),
            d: delta(k.lawPeak, base?.lawPeak, 'down'),
            tip: 'Federal Direct Unsubsidized, only what each school year needs; interest accrues in school.',
          },
        ]
      : []),
    {
      t: 'Net worth',
      v: kfmt(k.nw10),
      sub: `10 yr · 5 yr ${kfmt(k.nw5)} · 20 yr ${kfmt(k.nw20)}`,
      cls: tone(k.nw10, 100000, 0),
      d: delta(k.nw10, base?.nw10, 'up'),
      tip: 'Assets less debts, from Nov 2026: 10 years shown large, 5 and 20 beside it.',
    },
    {
      t: 'Retirement, 20 yr',
      v: kfmt(k.retire20),
      sub: 'TSP & 401(k)',
      cls: tone(k.retire20, 250000, 100000),
      d: delta(k.retire20, base?.retire20, 'up'),
      tip: 'TSP, then the 401(k), at 6% a year — your 5% plus any match.',
    },
  ]
  return (
    <div className="pkpis">
      {tiles.map((x) => (
        <div key={x.t} className={`pkpi pkpi-${x.cls}`} title={x.tip}>
          <span className="pkpi-t">{x.t}</span>
          <b className="pkpi-v">{x.v}</b>
          <small className="pkpi-sub">{x.sub}</small>
          {x.d}
        </div>
      ))}
    </div>
  )
}

// ── Export ───────────────────────────────────────────────────────────────────

const LEVER_LABEL: Record<keyof Levers, string> = {
  who: 'Whose money',
  houseSell: 'Sell 628 Chamberlain',
  houseMonth: 'Sale month',
  bonus: 'Re-enlistment bonus',
  bonusMonth: 'Bonus month',
  va: 'VA rating %',
  child2: 'Next child',
  child3: 'Third child',
  carReplace: 'Car replaced',
  carPrice: 'Car price',
  carDown: 'Car down share',
  carSommer: 'Car — Sommer share',
  emergCount: 'Emergencies',
  emergFirst: 'First emergency',
  emergEvery: 'Months between',
  emergSize: 'Emergency size',
  summer1L: '1L summer',
  summer2L: '2L summer',
  jobStart: 'Job starts',
  jobSalary: 'Starting salary',
  signing: 'Signing bonus',
  partTime: 'Part-time in school $/mo',
  partTimeFrom: 'Part-time from',
  lawLoans: 'Federal law-school loans',
  firmBar: 'Firm pays bar costs',
  sommerHome: 'Sommer home when childcare ≈ her pay',
  sommerPT: 'Sommer part-time share',
}

const q = (v: string | number) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * Cash at the end of a month as the chart shows it: the ledger's point for that month where
 * there is one (it holds Sommer's savings in Combined while you are away), otherwise the
 * path's own cash (after the first five years the ledger keeps one point a year).
 */
const cashAtOf = (ledger: Ledger) => (m: Ledger['months'][number]) => {
  const p = ledger.points.find((x) => x.month === m.month)
  return p ? cashOfP(p) : m.cash
}

/** Every month, every line: one row a month, one column a line. */
function toCsv(ledger: Ledger): string {
  const ins = [...new Set(ledger.months.flatMap((m) => Object.keys(m.income)))]
  const outs = [...new Set(ledger.months.flatMap((m) => Object.keys(m.costs)))]
  const head = ['Month', 'Phase', 'Income', 'Costs', 'Net', 'Borrowed (student loans)', 'Law loans owed', 'Cash (negative = funding gap)', 'Debt (excl. mortgages)', 'Net worth', ...ins.map((k) => `In: ${k}`), ...outs.map((k) => `Out: ${k}`)]
  const cashAt = cashAtOf(ledger)
  const rows = ledger.months.map((m) => [m.month, m.phase, m.totalIncome, m.totalCosts, m.net, m.borrowed ?? 0, m.lawLoans ?? 0, cashAt(m), m.debt, m.netWorth, ...ins.map((k) => m.income[k] ?? 0), ...outs.map((k) => m.costs[k] ?? 0)])
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n')
}

/** A plain-text brief: the scenario, the levers, the results, a yearly table and the first 18 months home. */
function toBrief(sc: Scenario, lv: Levers, base: Levers, ledger: Ledger, solv: ReturnType<typeof solvency>): string {
  const fmt = (v: unknown) => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? usd0(v) : String(v)) : v === null ? 'none' : String(v))
  const levers = (Object.keys(LEVER_LABEL) as (keyof Levers)[]).map(
    (k) => `- ${LEVER_LABEL[k]}: ${fmt(lv[k])}${JSON.stringify(lv[k]) !== JSON.stringify(base[k]) ? ` (changed; scenario: ${fmt(base[k])})` : ''}`,
  )
  const cashAt = cashAtOf(ledger)
  const years = new Map<string, { inc: number; out: number; cash: number; debt: number; nw: number }>()
  for (const m of ledger.months) {
    const y = m.month.slice(0, 4)
    const e = years.get(y) ?? { inc: 0, out: 0, cash: 0, debt: 0, nw: 0 }
    e.inc += m.totalIncome
    e.out += m.totalCosts
    e.cash = cashAt(m)
    e.debt = m.debt
    e.nw = m.netWorth
    years.set(y, e)
  }
  const row = (cells: (string | number)[]) => `| ${cells.map((c) => (typeof c === 'number' ? usd0(c) : c)).join(' | ')} |`
  const home = ledger.months.filter((m) => m.month >= ledger.homeMonth).slice(0, 18)
  return [
    `# Money planner — ${ledger.label}`,
    `Scenario id: ${sc.id}. Home: ${monLabel(ledger.homeMonth)}. Exported ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '## Levers',
    ...levers,
    '',
    '## Result',
    `- Funded: ${solv.light}. Max cash funding gap ${usd0(Math.max(0, -solv.low.value))} in ${monLabel(solv.low.month)} (cash the plan is short and has to find).`,
    solv.firstBelow ? `- A funding gap from ${monLabel(solv.firstBelow)} to ${monLabel(solv.lastBelow!)}.` : '- No funding gap.',
    '',
    '## By year (cash = checking + savings; negative = a funding gap to find; debt excludes mortgages)',
    row(['Year', 'Income', 'Costs', 'Net', 'Cash, Dec', 'Debt, Dec', 'Net worth, Dec']),
    row(['---', '---', '---', '---', '---', '---', '---']),
    ...[...years.entries()].map(([y, e]) => row([y, e.inc, e.out, e.inc - e.out, e.cash, e.debt, e.nw])),
    '',
    '## First 18 months home, line by line',
    ...home.map(
      (m) =>
        `- ${monLabel(m.month)} (${m.phase}): in ${usd0(m.totalIncome)} [${Object.entries(m.income).map(([k, v]) => `${k} ${usd0(v)}`).join('; ')}] · out ${usd0(m.totalCosts)} [${Object.entries(m.costs).map(([k, v]) => `${k} ${usd0(v)}`).join('; ')}] · cash ${usd0(cashAt(m))}`,
    ),
  ].join('\n')
}

function Export({ sc, lv, base, ledger, solv }: { sc: Scenario; lv: Levers; base: Levers; ledger: Ledger; solv: ReturnType<typeof solvency> }) {
  const [copied, setCopied] = useState(false)
  const download = () => {
    const blob = new Blob([toCsv(ledger)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `planner-${sc.id}-${lv.who}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const copy = async () => {
    const text = toBrief(sc, lv, base, ledger, solv)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const t = document.createElement('textarea')
      t.value = text
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div className="export-row">
      <button className="btn-ghost" onClick={download}>
        Download CSV — every month, every line
      </button>
      <button className="btn-ghost" onClick={copy}>
        {copied ? 'Copied — paste it to Claude' : 'Copy for Claude'}
      </button>
    </div>
  )
}

// ── The planner ──────────────────────────────────────────────────────────────

export function Planner({ metas, groups, planGaps }: { metas: ScenarioMeta[]; groups: Group[]; planGaps: PlanGap[] }) {
  const [id, setId] = useState<string>('law_ttu')
  const [compare, setCompare] = useState(false)
  const [leversOpen, setLeversOpen] = useState(false)
  /** Changes per lever, kept across scenarios: what you set is what you are testing. */
  const [changes, setChanges] = useState<Partial<Levers>>({})
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null')
      if (s?.id) setId(s.id)
      if (s?.changes) setChanges(s.changes)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ id, changes }))
    } catch {}
  }, [id, changes])

  const sc = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!
  const base = useMemo(() => baseLevers(sc), [sc])
  const lv: Levers = { ...base, ...changes }
  const set = <K extends keyof Levers>(k: K, v: Levers[K]) =>
    setChanges((c) => {
      const n = { ...c, [k]: v }
      if (JSON.stringify(v) === JSON.stringify(base[k])) delete n[k]
      return n
    })
  const reset = (...ks: (keyof Levers)[]) =>
    setChanges((c) => {
      const n = { ...c }
      for (const k of ks) delete n[k]
      return n
    })
  const isChanged = (...ks: (keyof Levers)[]) => ks.some((k) => k in changes)
  const nChanged = Object.keys(changes).length

  const ledger = useMemo(() => ledgerFor(apply(sc, lv), lv.who), [sc, JSON.stringify(lv)]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarize(ledger), [ledger])
  const solv = useMemo(() => solvency(ledger), [ledger])
  const k = useMemo(() => kpis(ledger), [ledger])
  // The scenario's own run, for the same view, to show what the changed levers moved.
  const leverChanges = Object.keys(changes).filter((x) => x !== 'who').length
  const kBase = useMemo(
    () => (leverChanges ? kpis(ledgerFor(apply(sc, { ...base, who: lv.who }), lv.who)) : null),
    [sc, leverChanges, lv.who], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const meta = metas.find((m) => m.id === sc.id) ?? metas[0]!

  // Compare: every scenario with the same levers (only when asked — it runs fifteen models).
  const all = useMemo(() => {
    if (!compare) return null
    const ls = SCENARIOS.map((s) => {
      const l = { ...baseLevers(s), ...changes }
      return ledgerFor(apply(s, l), l.who)
    })
    return { ledgers: ls, summaries: Object.fromEntries(ls.map((l) => [l.path, summarize(l)])) }
  }, [compare, JSON.stringify(changes)]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLaw = sc.path === 'law'
  const kids = [lv.child2, lv.child3].filter(Boolean).length + 1
  const shocks = emergencyMonths({ ...sc.a, emergencies: { count: lv.emergCount, first: lv.emergFirst, everyMonths: lv.emergEvery, size: lv.emergSize } })
  const GL: Record<string, string> = { law: 'Law, full-time', evening: 'Law at night', cpa: 'MAcc → CPA' }

  return (
    <section className="outlook viz planner">
      <h2 style={{ marginTop: 0 }}>Planner</h2>
      <p className="sub" style={{ margin: '0 0 10px' }}>
        Pick a scenario, then move the levers. Everything below — cash, debts, net worth, the month cards — reruns as you change them. Levers apply from{' '}
        {monLabel(ledger.homeMonth)}, when you&rsquo;re home; the deployment months are the payday plan.
      </p>

      <div className="picker" role="group" aria-label="Scenario">
        {(['law', 'evening', 'cpa'] as const).map((g) => (
          <div className="picker-row" key={g}>
            <span className="picker-label">{GL[g]}</span>
            {metas
              .filter((m) => m.group === g)
              .map((m) => (
                <button
                  key={m.id}
                  className={!compare && m.id === sc.id ? 'on' : ''}
                  onClick={() => {
                    setId(m.id)
                    setCompare(false)
                  }}
                >
                  {m.short}
                </button>
              ))}
          </div>
        ))}
        <div className="picker-row">
          <span className="picker-label" />
          <button className={compare ? 'on' : ''} onClick={() => setCompare(!compare)}>
            Compare all — same levers
          </button>
        </div>
      </div>

      <details className="levers-wrap" open={leversOpen} onToggle={(e) => setLeversOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="levers-head">
          <h3>Levers</h3>
          <span className="sub" style={{ margin: 0 }}>
            {nChanged
              ? `${nChanged} changed from the scenario${leversOpen ? '' : ': ' + (Object.keys(changes) as (keyof Levers)[]).map((k) => `${LEVER_LABEL[k]} ${showVal(changes[k])}`).join(' · ')}`
              : 'All at the scenario’s own assumptions'}
          </span>
          {nChanged > 0 && (
            <button
              className="linkish"
              onClick={(e) => {
                e.preventDefault()
                setChanges({})
              }}
            >
              reset all
            </button>
          )}
        </summary>
      <div className="levers">
        <Lever
          title="Whose money" value={lv.who === 'sam' ? 'Sam' : lv.who === 'sommer' ? 'Sommer' : 'Combined'}
          changed={isChanged('who')}
          onReset={() => reset('who')}
          hint={
            lv.who === 'both'
              ? 'Both of you: your pay and hers; every expense once. What she saves while you are away joins the cash when you are home.'
              : lv.who === 'sam'
                ? 'Your side: your pay, VA and drill; your expenses — childcare and the children, the house, debts, the $300/mo you give Sommer.'
                : 'Sommer’s side: her $4,200/mo take-home and your $300/mo in; her bills ($2,500), her fun money and her car share out; the rest saved.'
          }
        >
          <Seg value={lv.who} options={[['sam', 'Sam'], ['sommer', 'Sommer'], ['both', 'Combined']]} onChange={(v) => set('who', v)} />
        </Lever>
        <Lever
          title="Sommer & the kids"
          value={lv.sommerHome ? (lv.sommerPT ? `Part-time when care ≈ pay` : 'Home when care ≈ pay') : 'Always works'}
          changed={isChanged('sommerHome', 'sommerPT')}
          onReset={() => reset('sommerHome', 'sommerPT')}
          hint={
            lv.sommerHome
              ? `Any month childcare comes within $1,500 of her take-home, she leaves full-time work: no childcare.${lv.sommerPT ? ` She works part-time (~20 hrs/wk around your schedule) for ${Math.round(lv.sommerPT * 100)}% of her pay.` : ' No pay.'} ${homeMonths(ledger)}`
              : 'She works full-time throughout and childcare is paid for every child under five.'
          }
        >
          <Seg value={lv.sommerHome} options={[[true, 'Home when care ≈ pay'], [false, 'Always works']]} onChange={(v) => set('sommerHome', v)} />
          {lv.sommerHome && <Seg value={lv.sommerPT} options={[[0.5, 'Part-time (half pay)'], [0.25, 'A little'], [0, 'Not at all']]} onChange={(v) => set('sommerPT', v)} />}
        </Lever>

        <Lever title="628 Chamberlain" value={lv.houseSell ? `Sell ${monLabel(lv.houseMonth)}` : 'Keep'} changed={isChanged('houseSell', 'houseMonth')} onReset={() => reset('houseSell', 'houseMonth')} hint={lv.houseSell ? 'Sold at 11% costs; the mortgage is cleared from the proceeds. Sold while you live there, you rent in Corpus ($1,800/mo).' : 'Kept. Let out once you move out; you never move back in.'}>
          <Seg value={lv.houseSell} options={[[false, 'Keep'], [true, 'Sell']]} onChange={(v) => set('houseSell', v)} />
          {lv.houseSell && <Month value={lv.houseMonth} onChange={(m) => set('houseMonth', m)} label="Sell in" />}
        </Lever>

        <Lever title="Re-enlistment bonus" value={lv.bonus ? `${usd0(lv.bonus)} · ${monLabel(lv.bonusMonth)}` : 'None'} changed={isChanged('bonus', 'bonusMonth')} onReset={() => reset('bonus', 'bonusMonth')} hint="One payment, 22% withheld. Many pay half up front — confirm with your retention NCO.">
          <Money value={lv.bonus} onChange={(n) => set('bonus', n)} step={1000} />
          {lv.bonus > 0 && <Month value={lv.bonusMonth} onChange={(m) => set('bonusMonth', m)} label="Paid in" />}
        </Lever>

        <Lever title="VA rating" value={`${lv.va}% · ${usd0(VA_MONTHLY[lv.va] ?? 0)}/mo`} changed={isChanged('va')} onReset={() => reset('va')} hint={`${usd0(VA_MONTHLY[lv.va] ?? 0)}/mo with a spouse and one child (more for each child), from ~4 months home; 10% until then, with back pay.`}>
          <div className="lv-va">
            <input type="range" min={10} max={100} step={10} value={lv.va} onChange={(e) => set('va', Number(e.target.value))} aria-label="VA rating" />
            <b>{lv.va}%</b>
          </div>
        </Lever>

        <Lever title="Children" value={[lv.child2, lv.child3].filter((c): c is string => !!c).map(monLabel).join(', ') || 'No more'} changed={isChanged('child2', 'child3')} onReset={() => reset('child2', 'child3')} hint={`${kids} in all. Each costs childcare plus $250/mo under five, $500/mo from five, $1,500 at birth.`}>
          <div className="lv-row">
            <Seg value={!!lv.child2} options={[[true, 'Next child'], [false, 'None']]} onChange={(v) => set('child2', v ? (base.child2 ?? '2028-06') : null)} />
            {lv.child2 && <Month value={lv.child2} onChange={(m) => set('child2', m)} />}
          </div>
          {lv.child2 && (
            <div className="lv-row">
              <Seg value={!!lv.child3} options={[[true, 'Third'], [false, 'None']]} onChange={(v) => set('child3', v ? (base.child3 ?? '2030-08') : null)} />
              {lv.child3 && <Month value={lv.child3} onChange={(m) => set('child3', m)} />}
            </div>
          )}
        </Lever>

        <Lever title="The Expedition" value={lv.carReplace ? `${usd0(lv.carPrice)} · ${monLabel(lv.carReplace)}${lv.carSommer ? ' · split' : ''}` : 'Lasts'} changed={isChanged('carReplace', 'carPrice', 'carDown', 'carSommer')} onReset={() => reset('carReplace', 'carPrice', 'carDown', 'carSommer')} hint={lv.carReplace ? `Used, paid in cash — no loan.${lv.carSommer > 0 ? ` Sommer pays ${usd0(lv.carPrice * lv.carSommer)} from her savings (~$7.6k by Jul 2027); you pay ${usd0(lv.carPrice * (1 - lv.carSommer))}.` : ''} If your cash isn’t there that month, the shortfall shows as borrowed below. The car is not counted as an asset.` : 'Lasts the whole plan — no replacement modelled.'}>
          <div className="lv-row">
            <Seg value={!!lv.carReplace} options={[[true, 'Replace'], [false, 'Lasts']]} onChange={(v) => set('carReplace', v ? (base.carReplace ?? '2027-09') : null)} />
            {lv.carReplace && <Month value={lv.carReplace} onChange={(m) => set('carReplace', m)} label="Dies in" />}
          </div>
          {lv.carReplace && (
            <div className="lv-row">
              <Money value={lv.carPrice} onChange={(n) => set('carPrice', n)} step={1000} label="Used, price" />
            </div>
          )}
          {lv.carReplace && (
            <div className="lv-row">
              <span className="lv-lab">Split</span>
              <Seg value={lv.carSommer} options={[[0, 'All you'], [0.5, '50 / 50 with Sommer']]} onChange={(v) => set('carSommer', v)} />
            </div>
          )}
        </Lever>

        <Lever
          title="Emergencies" value={lv.emergCount ? `${lv.emergCount} × ${usd0(lv.emergSize)}` : 'None'}
          changed={isChanged('emergCount', 'emergFirst', 'emergEvery', 'emergSize')}
          onReset={() => reset('emergCount', 'emergFirst', 'emergEvery', 'emergSize')}
          hint={lv.emergCount ? `${lv.emergCount} × ${usd0(lv.emergSize)}: ${shocks.slice(0, 4).map(monLabel).join(', ')}${shocks.length > 4 ? '…' : ''}. Paid from cash.` : 'None modelled. Slide to stress-test: a roof, a transmission, a hospital bill.'}
        >
          <div className="lv-va">
            <span className="lv-lab">How many</span>
            <input type="range" min={0} max={10} step={1} value={lv.emergCount} onChange={(e) => set('emergCount', Number(e.target.value))} aria-label="How many emergencies" />
            <b>{lv.emergCount}</b>
          </div>
          {lv.emergCount > 0 && (
            <>
              <div className="lv-va">
                <span className="lv-lab">Each</span>
                <input type="range" min={1000} max={30000} step={1000} value={lv.emergSize} onChange={(e) => set('emergSize', Number(e.target.value))} aria-label="Size of each" />
                <b>{usd0(lv.emergSize)}</b>
              </div>
              <div className="lv-row">
                <Month value={lv.emergFirst} onChange={(m) => set('emergFirst', m)} label="First" />
                <label className="lv-field">
                  <span>Every</span>
                  <select value={lv.emergEvery} onChange={(e) => set('emergEvery', Number(e.target.value))}>
                    {[6, 12, 18, 24, 36, 48, 60].map((n) => (
                      <option key={n} value={n}>
                        {n < 12 ? `${n} mo` : `${n / 12} yr`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
        </Lever>

        <Lever
          title={isLaw ? 'Attorney job' : sc.path === 'night' ? 'Day job' : sc.a.macc.selfEmployed ? 'Your practice' : 'The job'}
          value={`${monLabel(lv.jobStart)} · ${usd0(lv.jobSalary)}${lv.signing ? ` + ${usd0(lv.signing)}` : ''}`}
          changed={isChanged('jobStart', 'jobSalary', 'signing', 'firmBar')}
          onReset={() => reset('jobStart', 'jobSalary', 'signing', 'firmBar')}
          hint={`Starts ${monLabel(lv.jobStart)} at ${usd0(lv.jobSalary)}${sc.a.macc.selfEmployed && !isLaw ? ' profit' : ''} a year; the raises after follow the scenario's ladder, scaled to this start.${lv.signing ? ` Signing bonus with the first pay, 22% withheld.` : ' Signing bonuses are uncommon at mid-size firms; BigLaw pays bar stipends.'}`}
        >
          <div className="lv-row">
            <Month value={lv.jobStart} onChange={(m) => set('jobStart', m)} label="Starts" />
          </div>
          <div className="lv-row">
            <Money value={lv.jobSalary} onChange={(n) => set('jobSalary', n)} step={1000} label={sc.a.macc.selfEmployed && !isLaw ? 'Profit / yr' : 'Salary / yr'} />
          </div>
          <div className="lv-row">
            <Money value={lv.signing} onChange={(n) => set('signing', n)} step={1000} label="Signing bonus" />
          </div>
          {isLaw && (
            <div className="lv-row">
              <span className="lv-lab">Bar review & fees</span>
              <Seg value={lv.firmBar} options={[[true, 'Firm pays'], [false, 'You pay $4k']]} onChange={(v) => set('firmBar', v)} />
            </div>
          )}
        </Lever>

        {isLaw && (
          <Lever
            title="Work during law school" value={lv.partTime ? `${usd0(lv.partTime)}/mo` : 'None'}
            changed={isChanged('partTime', 'partTimeFrom')}
            onReset={() => reset('partTime', 'partTimeFrom')}
            hint={lv.partTime ? `Sep–May from ${monLabel(lv.partTimeFrom)}, taxed as wages. ~15 hrs/wk at $20 is about $1,300/mo.` : 'None. Texas Tech advises 1Ls not to work; many 2Ls and 3Ls clerk part-time.'}
          >
            <Seg value={lv.partTime > 0} options={[[false, 'None'], [true, 'Part-time']]} onChange={(v) => set('partTime', v ? 1300 : 0)} />
            {lv.partTime > 0 && (
              <div className="lv-row">
                <Money value={lv.partTime} onChange={(n) => set('partTime', n)} step={100} label="$/mo" />
                <Month value={lv.partTimeFrom} onChange={(m) => set('partTimeFrom', m)} label="From" />
              </div>
            )}
          </Lever>
        )}

        {isLaw && (
          <Lever
            title="Law-school loans" value={lv.lawLoans ? 'Federal' : 'None'}
            changed={isChanged('lawLoans')}
            onReset={() => reset('lawLoans')}
            hint={
              lv.lawLoans
                ? loanSummary(ledger)
                : 'None: any shortfall in school is borrowed as a cash gap at ~8% instead — not a real option, shown for comparison.'
            }
          >
            <Seg value={lv.lawLoans} options={[[true, 'Federal — what each year needs'], [false, 'None']]} onChange={(v) => set('lawLoans', v)} />
          </Lever>
        )}

        {isLaw && (
          <Lever
            title="Law summers" value={`${usd0(lv.summer1L)} / ${usd0(lv.summer2L)}`}
            changed={isChanged('summer1L', 'summer2L')}
            onReset={() => reset('summer1L', 'summer2L')}
            hint="Paid Jun–Aug, 22% withheld. Texas big firms pay 1Ls and 2Ls alike, ~$4,327/week; mid-size ~$2,000–2,500 (estimate)."
          >
            <Seg
              value={lv.summer1L === 43000 && lv.summer2L === 43000 ? 'big' : lv.summer1L === 20000 && lv.summer2L === 25000 ? 'mid' : 'own'}
              options={[
                ['mid', 'Mid-size / Big 4'],
                ['big', 'BigLaw'],
                ['own', 'Own'],
              ]}
              onChange={(v) => {
                if (v === 'big') setChanges((c) => ({ ...c, summer1L: 43000, summer2L: 43000 }))
                if (v === 'mid') reset('summer1L', 'summer2L')
              }}
            />
            <div className="lv-row">
              <Money value={lv.summer1L} onChange={(n) => set('summer1L', n)} step={1000} label="1L, 2028" />
              <Money value={lv.summer2L} onChange={(n) => set('summer2L', n)} step={1000} label="2L, 2029" />
            </div>
          </Lever>
        )}
      </div>
      </details>

      {compare && all ? (
        <AllView ledgers={all.ledgers} summaries={all.summaries} metas={metas} />
      ) : (
        <>
          <div className="results-head">
            <h3>Results</h3>
            <span className="sub" style={{ margin: 0 }}>
              <strong>{ledger.label}</strong> ·{' '}
              {lv.who === 'both' ? 'Combined — your money and Sommer’s' : lv.who === 'sam' ? 'Sam — your side only' : 'Sommer — her side only'}
              {leverChanges ? ` · ${leverChanges} lever${leverChanges === 1 ? '' : 's'} changed — deltas vs the scenario` : ''}
            </span>
          </div>
          <KpiDash k={k} base={kBase} solv={solv} />
          <div className="results-foot">
            <details className="depends">
              <summary>What this depends on ({meta.dependsOn.length + planGaps.length})</summary>
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
            <Export sc={sc} lv={lv} base={base} ledger={ledger} solv={solv} />
          </div>
          <Balances ledger={ledger} groups={groups} card={(p: Period) => <PeriodCard ledger={ledger} p={p} />} />
        </>
      )}
    </section>
  )
}
