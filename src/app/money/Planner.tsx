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
import { emergencyMonths, reenlistOf, reshapeLadder, saleMonth } from '@/core/money/paths'
import { SCENARIOS, type Scenario } from '@/core/money/scenarios'
import { VA_MONTHLY } from '@/core/money/returnBudget'
import { AllView, Balances, ReviewHeader, type Period, type PlanGap, type ScenarioMeta } from './Outlook'
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
  }
}

export function apply(sc: Scenario, l: Levers): Scenario {
  const a: A = {
    ...sc.a,
    houseSaleMonth: l.houseSell ? l.houseMonth : null,
    sommer: { ...sc.a.sommer, included: l.who === 'both' },
    law: {
      ...sc.a.law,
      house: l.houseSell ? 'sell' : 'rent',
      summerGross: { '2028': l.summer1L, '2029': l.summer2L },
      partTime: { monthly: l.partTime, from: l.partTimeFrom },
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

function Lever({ title, changed, onReset, children, hint }: { title: string; changed: boolean; onReset: () => void; children: React.ReactNode; hint?: string }) {
  return (
    <div className={`lever ${changed ? 'changed' : ''}`}>
      <div className="lever-head">
        <span>
          {title}
          {changed && <i className="lever-dot" title="Changed from the scenario" />}
        </span>
        {changed && (
          <button className="linkish" onClick={onReset}>
            reset
          </button>
        )}
      </div>
      <div className="lever-body">{children}</div>
      {hint && <div className="lever-hint">{hint}</div>}
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
  const st = periodStatement(p.label, months, p.start, p.end, { of: (g) => ledger.accounts.filter((a) => a.group === g).map((a) => a.key) })
  const n = months.length
  return (
    <PaydayCard
      st={st}
      tag={p.phase}
      title={p.label}
      subtitle={n === 1 ? 'One month' : `${n} months, added up`}
      showActuals={false}
      checkingBefore={r2(cashOfBal(p.start))}
      checkingAfter={r2(cashOfBal(p.end))}
      savings={0}
      short={0}
      spendable=""
    />
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
}

const q = (v: string | number) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Every month, every line: one row a month, one column a line. */
function toCsv(ledger: Ledger): string {
  const ins = [...new Set(ledger.months.flatMap((m) => Object.keys(m.income)))]
  const outs = [...new Set(ledger.months.flatMap((m) => Object.keys(m.costs)))]
  const head = ['Month', 'Phase', 'Income', 'Costs', 'Net', 'Cash (no new debt)', 'Debt (excl. mortgages)', 'Net worth', ...ins.map((k) => `In: ${k}`), ...outs.map((k) => `Out: ${k}`)]
  // Cash as the chart shows it (the ledger's, which holds Sommer's savings in Combined) where there is a point.
  const cashAt = (m: (typeof ledger.months)[number]) => {
    const p = ledger.points.find((x) => x.month === m.month)
    return p ? cashOfP(p) : m.cash
  }
  const rows = ledger.months.map((m) => [m.month, m.phase, m.totalIncome, m.totalCosts, m.net, cashAt(m), m.debt, m.netWorth, ...ins.map((k) => m.income[k] ?? 0), ...outs.map((k) => m.costs[k] ?? 0)])
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n')
}

/** A plain-text brief: the scenario, the levers, the results, a yearly table and the first 18 months home. */
function toBrief(sc: Scenario, lv: Levers, base: Levers, ledger: Ledger, solv: ReturnType<typeof solvency>): string {
  const fmt = (v: unknown) => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? usd0(v) : String(v)) : v === null ? 'none' : String(v))
  const levers = (Object.keys(LEVER_LABEL) as (keyof Levers)[]).map(
    (k) => `- ${LEVER_LABEL[k]}: ${fmt(lv[k])}${JSON.stringify(lv[k]) !== JSON.stringify(base[k]) ? ` (changed; scenario: ${fmt(base[k])})` : ''}`,
  )
  const years = new Map<string, { inc: number; out: number; cash: number; debt: number; nw: number }>()
  for (const m of ledger.months) {
    const y = m.month.slice(0, 4)
    const e = years.get(y) ?? { inc: 0, out: 0, cash: 0, debt: 0, nw: 0 }
    e.inc += m.totalIncome
    e.out += m.totalCosts
    e.cash = cashOfP(ledger.points.find((x) => x.month >= m.month) ?? { bal: {} })
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
    `- Solvency: ${solv.light}. Lowest cash ${usd0(solv.low.value)} in ${monLabel(solv.low.month)}; most borrowed at once ${usd0(solv.peak)}.`,
    solv.firstBelow ? `- Cash below zero from ${monLabel(solv.firstBelow)} to ${monLabel(solv.lastBelow!)}.` : '- Cash never below zero.',
    '',
    '## By year (cash = checking + savings less anything borrowed; debt excludes mortgages)',
    row(['Year', 'Income', 'Costs', 'Net', 'Cash, Dec', 'Debt, Dec', 'Net worth, Dec']),
    row(['---', '---', '---', '---', '---', '---', '---']),
    ...[...years.entries()].map(([y, e]) => row([y, e.inc, e.out, e.inc - e.out, e.cash, e.debt, e.nw])),
    '',
    '## First 18 months home, line by line',
    ...home.map(
      (m) =>
        `- ${monLabel(m.month)} (${m.phase}): in ${usd0(m.totalIncome)} [${Object.entries(m.income).map(([k, v]) => `${k} ${usd0(v)}`).join('; ')}] · out ${usd0(m.totalCosts)} [${Object.entries(m.costs).map(([k, v]) => `${k} ${usd0(v)}`).join('; ')}] · cash ${usd0(cashOfP(ledger.points.find((x) => x.month >= m.month) ?? { bal: {} }))}`,
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

      <div className="levers-head">
        <h3>Levers</h3>
        <span className="sub" style={{ margin: 0 }}>
          {nChanged ? (
            <>
              {nChanged} changed from the scenario ·{' '}
              <button className="linkish" onClick={() => setChanges({})}>
                reset all
              </button>
            </>
          ) : (
            'All at the scenario’s own assumptions'
          )}
        </span>
      </div>
      <div className="levers">
        <Lever
          title="Whose money"
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
        <Lever title="628 Chamberlain" changed={isChanged('houseSell', 'houseMonth')} onReset={() => reset('houseSell', 'houseMonth')} hint={lv.houseSell ? 'Sold at 11% costs; the mortgage is cleared from the proceeds. Sold while you live there, you rent in Corpus ($1,800/mo).' : 'Kept. Let out once you move out; you never move back in.'}>
          <Seg value={lv.houseSell} options={[[false, 'Keep'], [true, 'Sell']]} onChange={(v) => set('houseSell', v)} />
          {lv.houseSell && <Month value={lv.houseMonth} onChange={(m) => set('houseMonth', m)} label="Sell in" />}
        </Lever>

        <Lever title="Re-enlistment bonus" changed={isChanged('bonus', 'bonusMonth')} onReset={() => reset('bonus', 'bonusMonth')} hint="One payment, 22% withheld. Many pay half up front — confirm with your retention NCO.">
          <Money value={lv.bonus} onChange={(n) => set('bonus', n)} step={1000} />
          {lv.bonus > 0 && <Month value={lv.bonusMonth} onChange={(m) => set('bonusMonth', m)} label="Paid in" />}
        </Lever>

        <Lever title="VA rating" changed={isChanged('va')} onReset={() => reset('va')} hint={`${usd0(VA_MONTHLY[lv.va] ?? 0)}/mo with a spouse and one child (more for each child), from ~4 months home; 10% until then, with back pay.`}>
          <div className="lv-va">
            <input type="range" min={10} max={100} step={10} value={lv.va} onChange={(e) => set('va', Number(e.target.value))} aria-label="VA rating" />
            <b>{lv.va}%</b>
          </div>
        </Lever>

        <Lever title="Children" changed={isChanged('child2', 'child3')} onReset={() => reset('child2', 'child3')} hint={`${kids} in all. Each costs childcare plus $250/mo under five, $500/mo from five, $1,500 at birth.`}>
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

        <Lever title="The Expedition" changed={isChanged('carReplace', 'carPrice', 'carDown', 'carSommer')} onReset={() => reset('carReplace', 'carPrice', 'carDown', 'carSommer')} hint={lv.carReplace ? `Used, paid in cash — no loan.${lv.carSommer > 0 ? ` Sommer pays ${usd0(lv.carPrice * lv.carSommer)} from her savings (~$7.6k by Jul 2027); you pay ${usd0(lv.carPrice * (1 - lv.carSommer))}.` : ''} If your cash isn’t there that month, the shortfall shows as borrowed below. The car is not counted as an asset.` : 'Lasts the whole plan — no replacement modelled.'}>
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
          title="Emergencies"
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
          changed={isChanged('jobStart', 'jobSalary', 'signing')}
          onReset={() => reset('jobStart', 'jobSalary', 'signing')}
          hint={`Starts ${monLabel(lv.jobStart)} at ${usd0(lv.jobSalary)}${sc.a.macc.selfEmployed && !isLaw ? ' profit' : ''} a year; the raises after follow the scenario's ladder, scaled to this start.${lv.signing ? ` Signing bonus with the first pay, 22% withheld.` : ''}`}
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
        </Lever>

        {isLaw && (
          <Lever
            title="Work during law school"
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
            title="Law summers"
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

      {compare && all ? (
        <AllView ledgers={all.ledgers} summaries={all.summaries} metas={metas} />
      ) : (
        <>
          <div className={`solvency lq-${solv.light}`}>
            <i className="bdot" />
            <div>
              <b>
                {solv.light === 'green'
                  ? 'Solvent the whole way'
                  : solv.firstBelow === solv.lastBelow
                    ? `Cash runs short in ${monLabel(solv.firstBelow!)}`
                    : `Cash runs short between ${monLabel(solv.firstBelow!)} and ${monLabel(solv.lastBelow!)}`}
              </b>
              <span>
                Lowest cash {usd0(solv.low.value)} in {monLabel(solv.low.month)}
                {solv.peak > 0 && <> · most borrowed at once {usd0(solv.peak)} (at ~8%)</>}
              </span>
            </div>
          </div>
          <Export sc={sc} lv={lv} base={base} ledger={ledger} solv={solv} />
          <p className="sub" style={{ margin: '10px 0 8px' }}>
            <strong>{ledger.label}.</strong>{' '}
            {lv.who === 'both' ? 'Combined — your money and Sommer’s.' : lv.who === 'sam' ? 'Sam — your income and your expenses only.' : 'Sommer — her income and her expenses only.'}
          </p>
          <ReviewHeader meta={meta} summary={summary} planGaps={planGaps} />
          <Balances ledger={ledger} groups={groups} card={(p: Period) => <PeriodCard ledger={ledger} p={p} />} />
        </>
      )}
    </section>
  )
}
