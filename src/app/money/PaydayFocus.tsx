import type { Allocation } from '@/core/money/allocation'
import { EARLY_PAY_BUSINESS_DAYS, depositFor } from '@/core/money/statements'
import { BUCKETS } from '@/core/money/briefing'
import { ACTUALS, ACTUALS_AS_OF, actualsFor, spentOn, type Actual } from '@/core/money/actuals'
import { PAYMENT_INFO, scheduledFor, CHECKING, SAVINGS, type PaymentInfo, type Scheduled } from '@/core/money/execution'
import { nov1Statement, NOV1 } from '@/core/money/reconstruct'
import { combineStatements, paycheckStatement, type PaycheckStatement, type StatementLine, type StatementSection } from '@/core/money/statement'
import { benchmarkRows, type BenchRow, type BenchStatus } from '@/core/money/benchmarks'
import { PATH_ASSUMPTIONS } from '@/core/money/paths'
import { combinedStatement, HER_CHECKING_START, HER_SAVINGS_START, sommerStatement } from '@/core/money/sides'
import { WhoSwitch } from './WhoSwitch'
import { limitsFor, tspYear } from '@/core/money/limits'
import { projectPaycheck } from '@/core/money/paychecks'
import { monthlyBasicPay } from '@/core/money/drillPay'

/**
 * The next six paychecks, open at the top of the Money page.
 *
 * Each card reads top to bottom so it adds up:
 *   take-home + carried in − each category − spending between paydays = carried out
 * and its "carried out" is the next card's "carried in".
 *
 * Categories are collapsible (the triangle): the header carries the category's budget
 * and how much of it has actually gone out, from ACTUALS; open it for the lines.
 *
 * "Now" is the most recent paycheck that is already spendable — pay lands about two
 * business days before its official date.
 */

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function nice(isoDate: string): string {
  const d = parse(isoDate)
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
}

/** The day the money is spendable: N business days before the pay date. */
export function spendableFrom(payDate: string, businessDays = EARLY_PAY_BUSINESS_DAYS): string {
  const d = parse(payDate)
  let left = businessDays
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return iso(d)
}

/** Index of the paycheck being spent on `today`, and the one after it. */
export function currentAndNext(allocations: Allocation[], today: string): [number, number | null] {
  let current = 0
  for (let i = 0; i < allocations.length; i++) {
    if (spendableFrom(allocations[i]!.paycheck.payDate) <= today) current = i
  }
  return [current, current + 1 < allocations.length ? current + 1 : null]
}

function todayInTexas(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

interface Row {
  key: string
  label: string
  /** Money out on this paycheck. */
  budget: number
  spent: number
  short: number
  byHand: boolean
  /** A one-off's own date. */
  date?: string
  /** Spending cut already taken off `budget` this period (shown, so the number explains itself). */
  cut?: number
  info?: PaymentInfo
  scheduled?: Scheduled
  txns: Actual[]
}

interface Group {
  key: string
  label: string
  rows: Row[]
}

const LABELS: Record<string, string> = {
  housing: 'Mortgage',
  home: 'Wife & Kids',
  you: 'Your spending',
  debt: 'Debt payments',
  invest: 'Investing',
  save: 'Savings',
}

const ONE_OFF_GROUP: [RegExp, string, string][] = [
  [/^macc_/, 'school', 'School'],
  [/^emergency_/, 'emergency', 'Emergency (assumed)'],
]

/**
 * The paycheck's lines, by category. One-offs dated before the next payday are spent out
 * of THIS paycheck, so they are placed in its categories (gifts and the GEICO start under
 * your spending, the course under School). Spending cuts reduce "Your own spending"
 * directly rather than appearing as money in.
 */
export function groupsFor(a: Allocation, next: Allocation | undefined): Group[] {
  const payday = a.paycheck.scheduledDate
  const lines = a.lines.filter((l) => l.allocated > 0 || l.shortfall > 0)
  const toRow = (l: (typeof lines)[number]): Row => ({
    key: l.key,
    label: l.label,
    budget: l.allocated,
    spent: spentOn(payday, l.key),
    short: l.shortfall,
    byHand: l.execution === 'manual',
    info: PAYMENT_INFO[l.key],
    scheduled: scheduledFor(l.key, payday),
    txns: actualsFor(payday, l.key),
  })
  const groups: Group[] = []
  const used = new Set<string>()
  for (const b of BUCKETS) {
    const keys = b.keys as readonly string[]
    const mine = lines.filter((l) => !used.has(l.key) && (keys.includes(l.key) || keys.includes(l.capGroup ?? '')))
    mine.forEach((l) => used.add(l.key))
    if (mine.length) groups.push({ key: b.key, label: LABELS[b.key] ?? b.label, rows: mine.map(toRow) })
  }
  const other = lines.filter((l) => !used.has(l.key))
  if (other.length) groups.push({ key: 'other', label: 'Other', rows: other.map(toRow) })

  const groupFor = (key: string, label: string) => {
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label, rows: [] }
      groups.push(g)
    }
    return g
  }
  for (const o of next?.oneOffs ?? []) {
    if (o.amount > 0) {
      // A spending cut: take it off "Your own spending".
      const own = groups.flatMap((g) => g.rows).find((r) => r.key === 'living_deployed')
      if (own) {
        own.budget = Math.round((own.budget - o.amount) * 100) / 100
        own.cut = Math.round(((own.cut ?? 0) + o.amount) * 100) / 100
        continue
      }
    }
    const [, gk, gl] = ONE_OFF_GROUP.find(([re]) => re.test(o.key)) ?? [null, 'you', LABELS.you!]
    groupFor(gk as string, gl as string).rows.push({
      key: o.key,
      label: o.label,
      budget: -o.amount,
      spent: spentOn(payday, o.key),
      short: 0,
      byHand: true,
      date: o.date,
      txns: actualsFor(payday, o.key),
    })
  }
  return groups.filter((g) => g.rows.length)
}

function Progress({ budget, spent }: { budget: number; spent: number }) {
  if (budget <= 0) return null
  const pct = Math.max(0, Math.min(100, (spent / budget) * 100))
  return (
    <span className="paybar" aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}

const shortDate = (d: string) => nice(d)

/** What to say under a line, and whether it is something you still have to do. */
function status(row: Row, spendable: string): { text: string; cls: string } {
  if (row.budget <= 0) return { text: '', cls: 'muted' }
  if (row.spent >= row.budget - 0.5) return { text: '✓ paid', cls: 'good' }
  if (row.scheduled) {
    return { text: `Scheduled ${shortDate(row.scheduled.date)} (${row.scheduled.by})`, cls: 'sched' }
  }
  const left = row.budget - row.spent
  if (row.info?.unconfirmed) return { text: 'Unconfirmed: may not be going out. Check.', cls: 'warn' }
  if (row.info?.how === 'automatic') {
    const when = row.info.when
    return { text: row.spent > 0 ? `${usd(row.spent)} so far · auto, ${when}` : `Auto · ${when}`, cls: 'muted' }
  }
  if (row.info?.when === 'done') return { text: '', cls: 'muted' }
  // By hand and not yet done: a to-do.
  const so = row.spent > 0 ? `${usd(row.spent)} sent · ` : ''
  return { text: `${so}To do: ${usd(left)}${row.date ? '' : ` from ~${shortDate(spendable)}`}`, cls: 'todo' }
}

function pct(n: number, gross: number) {
  return gross > 0 ? `${((n / gross) * 100).toFixed(1)}%` : ''
}

/**
 * Category colours: the validated categorical palette (dark steps), in fixed order, with
 * slot 6 (green) skipped because green is reserved for "paid". Deductions and cash are
 * neutral greys. Checked with the dataviz validator against the card surface.
 */
export const CAT_COLOR: Record<string, string> = {
  deductions: '#6b7280',
  home: '#3987e5',
  car: '#d95926',
  sent: '#199e70',
  food: '#7cb342',
  childcare: '#199e70',
  gifts: '#e06fb0',
  personal: '#c98500',
  tech: '#2fb5c9',
  debt: '#d55181',
  emergency: '#e66767',
  other: '#7d848f',
  invest: '#9085e9',
  cash: '#a3aab6',
}

/**
 * One bar per line. LENGTH = share of gross pay. OUTLINE = the budget, SOLID = what has
 * gone out so far, ORANGE = spent beyond the budget. Completion is fill, not colour, so it
 * can't be mistaken for size.
 */
function BudgetBar({
  amount,
  gross,
  spent,
  showPaid,
  color,
}: {
  amount: number
  gross: number
  spent?: number
  showPaid: boolean
  color: string
}) {
  if (gross <= 0 || amount <= 0) return null
  const sp = showPaid ? (spent ?? 0) : 0
  const paid = Math.min(sp, amount)
  const over = Math.max(0, sp - amount)
  // ONE pill per budget: its outline is the budget (length = share of the base), filled from
  // the left as it is paid. Anything over budget is a hatched stub after it.
  const w = Math.max(2.5, (amount / gross) * 100)
  return (
    <div className="bbar" aria-hidden>
      <span className="bpill" style={{ width: `${Math.min(100, w)}%`, borderColor: color }}>
        {paid > 0 && <i style={{ width: `${(paid / amount) * 100}%`, background: color }} />}
      </span>
      {over > 0 && <span className="bbar-over" style={{ width: `max(${(over / gross) * 100}%, 4px)` }} />}
    </div>
  )
}

/** Where the gross goes: one thin segmented bar, each part in its category colour. */
function SplitBar({ parts, base }: { parts: { key: string; label: string; amount: number }[]; base: number }) {
  return (
    <div className="gsplit" role="img" aria-label={parts.map((p) => `${p.label} ${((p.amount / base) * 100).toFixed(0)}%`).join(', ')}>
      {parts
        .filter((p) => p.amount > 0)
        .map((p) => (
          <span
            key={p.key}
            title={`${p.label}: ${usd(p.amount)} (${((p.amount / base) * 100).toFixed(1)}%)`}
            style={{ flexBasis: `${(p.amount / base) * 100}%`, background: CAT_COLOR[p.key] ?? CAT_COLOR.other }}
          />
        ))}
    </div>
  )
}

type Chip = { text: string; cls: 'paid' | 'todo' | 'sched' | 'auto' | 'warn' | 'over' }

function lineChip(l: StatementLine, spendable: string): Chip | null {
  if (l.nonCash || l.amount <= 0) return null
  const spent = l.spent ?? 0
  if (l.accounts) {
    const by = (st: string) => l.accounts!.filter((r) => r.status === st).map((r) => r.name.replace(/ \(closed\)/, ''))
    if (by('todo').length) return { text: `To do · pay ${by('todo').join(', ')}`, cls: 'todo' }
    if (by('check').length) return { text: `⚠ Check ${by('check').join(' & ')}`, cls: 'warn' }
    if (by('paid').length === l.accounts.length) return { text: '✓ All paid', cls: 'paid' }
    if (l.accounts.every((r) => r.status === 'part' || r.status === 'auto' || r.status === 'paid')) {
      if (spent >= l.amount - 0.5) return { text: '✓ Paid', cls: 'paid' }
      if (l.info?.how === 'automatic') return { text: `Auto · ${l.info.when} — nothing to do`, cls: 'auto' }
    }
    return null
  }
  if (l.todo) return { text: `To do · ${l.todo}`, cls: 'todo' }
  if (spent > l.amount + 0.5) return { text: `Over by ${usd(spent - l.amount)} · ${usd(spent)} spent`, cls: 'over' }
  if (spent >= l.amount - 0.5) return { text: '✓ Paid', cls: 'paid' }
  if (l.scheduled) return { text: `◷ Scheduled ${nice(l.scheduled.date)} (${l.scheduled.by})`, cls: 'sched' }
  if (l.info?.unconfirmed) return { text: '⚠ Unconfirmed — may not be going out', cls: 'warn' }
  if (l.info?.how === 'automatic') {
    if (spent > 0) return { text: `Auto · ${usd(spent)} so far`, cls: 'auto' }
    if (l.info.day) {
      // The first draft day on or after the money is spendable.
      const sp = new Date(spendable + 'T12:00:00Z')
      const d = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + (sp.getUTCDate() > l.info.day ? 1 : 0), l.info.day, 12))
      return { text: `Auto · drafts ~${nice(d.toISOString().slice(0, 10))} — nothing to do`, cls: 'auto' }
    }
    return { text: `Auto · ${l.info.when} — nothing to do`, cls: 'auto' }
  }
  if (!l.info && !l.byHand) return spent > 0 ? { text: `${usd(spent)} so far`, cls: 'auto' } : null
  if (l.info?.when === 'done') return null
  const so = spent > 0 ? `${usd(spent)} done · ` : ''
  return { text: `To do · ${so}${usd(l.amount - spent)}${l.date ? '' : ` from ${nice(spendable)}`}`, cls: 'todo' }
}

/** Card minimums are estimates until the statement says; everything else is an exact amount. */
const ESTIMATED_MINIMUMS = ['platinum', 'brightway', 'credit_one', 'citi', 'capital_one', 'chase']

export interface HerCash {
  checkingStart: number
  in: number
  out: number
  checkingEnd: number
  savingsStart: number
  savingsEnd: number
}

export interface Maxing {
  year: number
  /** Month this card is through. */
  month: string
  /** Your rate: 5% of base pay, a month. The match is the same. */
  ratePct: number
  rateMonthly: number
  /** Your own TSP so far this year, by pay date (paychecks through this month). */
  yours: number
  /** Part of `yours` estimated (2026, before the plan's data). */
  estimatedPart: number
  /** The whole year as planned: deployed paychecks, then drill pay once you are home. */
  yearEnd: number
  /** Deployed paychecks left this year after this month. */
  checksLeft: number
  /** What each of those would need, to reach the elective limit. */
  perCheckToMax: number
  /** Half-month base pay, to turn that into a rate. */
  basePerCheck: number
  /** True once the plan has you home this year (the civilian 401(k) is path-dependent). */
  homeThisYear: boolean
  /** Yours since the orders began (31 Jul 2026) — it doesn't reset in January. */
  sinceOrders: number
}

/** Your rate, then the year's progress to each IRS limit, in dollars first. */
function MaxingBox({ m }: { m: Maxing }) {
  const L = limitsFor(m.year)
  const pct = (v: number, max: number) => (v / max) * 100
  const bar = (k: string, v: number, end: number, max: number, tip: string) => {
    const p = Math.min(100, pct(v, max))
    const pe = Math.min(100, pct(end, max))
    return (
      <div className="mx-row" key={k} title={tip}>
        <div className="mx-top">
          <span>{k}</span>
          <span className="mx-amt">
            {usd(v)} <span className="ln-dim">of {usd(max)} limit</span>
          </span>
        </div>
        <div className="mx-bar">
          <i className="mx-end" style={{ width: `${pe}%` }} />
          <i style={{ width: `${Math.max(p, v > 0 ? 0.6 : 0)}%` }} />
        </div>
        <div className="mx-sub ln-dim">
          {p.toFixed(1)}% of the limit used so far · {usd(end)} ({pe.toFixed(0)}%) by Dec as planned
        </div>
      </div>
    )
  }
  return (
    <div className="maxing">
      <div className="maxing-title">
        Retirement — {m.year}, through {m.month.slice(5) === '12' ? 'December' : new Date(`${m.month}-15`).toLocaleString('en-US', { month: 'long' })}
        {L.estimated ? ' (limits estimated until the IRS posts them)' : ''}
      </div>
      <div className="mx-facts">
        <span title="Your election. 5% is the most that earns the full BRS match (1% automatic + 4% matching).">
          Your rate <b>{m.ratePct}% of base pay</b> · {usd(m.rateMonthly)}/mo
        </span>
        <span title="The Army's BRS contributions: 1% automatic + 4% matching on your 5%. Traditional by default; they count toward the all-in limit, not yours.">
          Army match <b>{m.ratePct}%</b> · {usd(m.rateMonthly)}/mo
        </span>
        <span title="Your own contributions since the orders began on 31 Jul 2026. The yearly limits start over each January; this doesn't.">
          Since 31 Jul 2026 <b>{usd(m.sinceOrders)}</b> yours · {usd(m.sinceOrders * 2)} with the match
        </span>
      </div>
      {bar(
        'TSP / 401(k) — yours',
        m.yours,
        m.yearEnd,
        L.elective,
        `The elective limit: your TSP and any civilian 401(k) together, Roth or traditional, counted by the date paid (the 1 Jan paycheck is paid 31 Dec, so it counts in the year before).${m.estimatedPart > 0 ? ` Includes ~${usd(m.estimatedPart)} ESTIMATED before the plan's data — drills, the 4-week AT and 31 Jul – 1 Nov at 5% of base. Your LES shows the real year-to-date.` : ''}${m.homeThisYear ? ' After you are home: drill pay at 5%; a civilian 401(k) depends on the path and is not in this.' : ''}`,
      )}
      {bar(
        'TSP all-in — yours + the match',
        m.yours * 2,
        m.yearEnd * 2,
        L.additions,
        'The annual-additions limit: everything into the TSP. Traditional contributions from combat-zone tax-free pay can go above the elective limit, up to this. Roth contributions count against the elective limit.',
      )}
      {bar('IRA (Roth or traditional)', 0, 0, L.ira, `Contributions for ${m.year} count until 15 Apr ${m.year + 1}. Tax-free combat pay counts as compensation.`)}
      {m.checksLeft > 0 && (
        <div className="mx-note">
          To max the {usd(L.elective)} this year you would need {usd(m.perCheckToMax)} a paycheck for the {m.checksLeft} left — your 5% is {usd(m.rateMonthly / 2)}. Not in the plan; shown for scale.
        </div>
      )}
    </div>
  )
}

const LIGHT_TEXT: Record<string, string> = { green: 'on track', yellow: 'close', red: 'off', none: '' }

/** The month view's comparison strip: you, then six benchmarks — a number, a light, a hover. */
function BenchStrip({ b }: { b?: BenchRow }) {
  if (!b) return <div className="bstrip" aria-hidden />
  return (
    <div className="bstrip">
      <span className="bcell you" title={b.key === 'invest' ? 'Your share of gross, with the Army’s match' : 'Your share of gross'}>
        {b.you.toFixed(1)}%
      </span>
      {b.cells.map((c) => (
        <span
          key={c.key}
          className={`bcell light-${c.light}`}
          title={`${c.tip}${c.light !== 'none' ? ` — you are ${LIGHT_TEXT[c.light]}` : ''}`}
        >
          {c.light !== 'none' && <i className="bdot" />}
          {c.text}
        </span>
      ))}
    </div>
  )
}

function BenchHeader() {
  return (
    <div className="bench-head">
      <span />
      <div className="bstrip">
        {['You', 'Typical', 'Advisor', 'Robo', 'Ramsey', 'Kiyosaki', 'Plan'].map((h) => (
          <span key={h} className="bcell">
            {h}
          </span>
        ))}
      </div>
    </div>
  )
}

/** What is still to go out of checking this paycheck: budget not yet seen, plus the savings transfer. */
function stillToGo(st: PaycheckStatement): number {
  const out = [...st.spending.flatMap((x) => x.lines), ...st.investing.lines.filter((l) => l.key !== 'tsp' && l.key !== 'retirement')].filter(
    (l) => !l.nonCash && l.amount > 0,
  )
  const toSavings = Math.max(0, st.netCash.lines.find((l) => l.key === 'savings')?.amount ?? 0)
  return Math.round((out.reduce((t, l) => t + Math.max(0, l.amount - (l.spent ?? 0)), 0) + toSavings) * 100) / 100
}

/** Under a budget: what has already gone out, and what is left (or how far over). */
function OutLeft({ budget, out }: { budget: number; out: number }) {
  const left = Math.round((budget - out) * 100) / 100
  return (
    <span className="outleft">
      out {usd(out)} · {left >= 0 ? <>left <b>{usd(left)}</b></> : <b className="over">over {usd(-left)}</b>}
    </span>
  )
}

function Line({
  l,
  gross,
  spendable,
  showActuals,
  color,
  base,
  bench,
  compact = false,
}: {
  compact?: boolean
  l: StatementLine
  gross: number
  spendable: string
  showActuals: boolean
  color: string
  /** What every bar is a share of: gross pay, one scale for categories, lines and items. */
  base: number
  bench?: BenchRow
}) {
  const chip = showActuals || l.scheduled || l.todo || l.info ? lineChip(l, spendable) : null
  const todo = chip?.cls === 'todo'
  return (
    <div className={`ln${todo ? ' ln-todo' : ''}`}>
      <div className={bench ? 'bench-row' : undefined}>
      <div className="ln-top">
        <div className="ln-name">
          {l.label}
          {l.date && <span className="ln-dim"> · {nice(l.date)}</span>}
        </div>
        <div className={`ln-amt${l.nonCash ? ' ln-dim' : ''}`}>
          {l.nonCash ? `(${usd(l.amount)})` : usd(l.amount)}
          {!l.nonCash && <span className="ln-pct">{pct(l.amount, gross)}</span>}
          {showActuals && !l.nonCash && l.spent !== undefined && <OutLeft budget={l.amount} out={l.spent} />}
        </div>
      </div>
      {bench && <BenchStrip b={bench} />}
      </div>
      {/* Every line gets its pill: length = its share of gross (the same scale everywhere), fill = paid. */}
      {!l.nonCash && l.amount > 0 && (
        <BudgetBar amount={l.amount} gross={base} spent={l.spent} showPaid={showActuals} color={color} />
      )}
      {(() => {
        const detail = (
          <>
      {(l.info || l.note) && (
        <div className="ln-meta">
          {l.info && l.accounts && <span>From {l.info.from}</span>}
          {l.info && !l.accounts && (
            <span>
              {l.info.from} → {l.info.to}
            </span>
          )}
          {(l.note ?? l.info?.note) && <span>{l.note ?? l.info?.note}</span>}
        </div>
      )}
      {chip && <span className={`chip chip-${chip.cls}`}>{chip.text}</span>}
      {l.accounts && (() => {
        // Card minimums are to-dos, so they stay open. Bill parts and subscription items are
        // detail: folded behind a caret until you want them.
        const detail = l.accounts.every((r) => r.status === 'part' || r.status === 'auto')
        const list = (
        <ul className="accts">
          {l.accounts.map((r) => (
            <li key={r.key} className={`ar ar-${r.status}`}>
              <div className="ar-top">
                <span className="ar-name">
                  <span className="ar-ic">{r.status === 'paid' ? '✓' : r.status === 'todo' ? '●' : r.status === 'check' ? '⚠' : r.status === 'auto' ? '↻' : r.status === 'part' ? '·' : '○'}</span>
                  {r.name}
                </span>
                <span className="ar-amt">
                  {r.paid > 0 ? usd(r.paid) : ESTIMATED_MINIMUMS.includes(r.key) && r.status !== 'auto' ? `~${usd(r.minimum)}` : usd(r.minimum)}
                </span>
              </div>
              <BudgetBar
                amount={r.minimum}
                gross={base}
                spent={r.paid}
                showPaid={showActuals || r.status === 'paid'}
                color={color}
              />
              <div className="ar-text">{r.text}</div>
              {r.payAt && r.status !== 'paid' && r.status !== 'auto' && r.status !== 'part' && <div className="ar-where">→ {r.payAt}</div>}
            </li>
          ))}
        </ul>
        )
        if (!detail) return list
        const parts = l.accounts.every((r) => r.status === 'part')
        return (
          <details className="ar-more">
            <summary>
              {l.accounts.length} {parts && l.key.startsWith('phone') ? 'parts of the bill' : l.accounts.length === 1 ? 'item' : 'items'}
            </summary>
            {list}
          </details>
        )
      })()}
      {(l.short ?? 0) > 0 && <span className="chip chip-over">Short {usd(l.short!)}</span>}
      {(l.unfunded ?? 0) > 0 && <span className="chip chip-over">⚠ {usd(l.unfunded!)} over budget — not covered</span>}
      {l.txns.length > 0 && (
        <ul className="txns">
          {l.txns.map((t, k) => (
            <li key={k}>
              <span className="txn-date">{nice(t.date)}</span>
              <span className="txn-desc">
                {t.description}
                {t.status === 'pending' && <em> pending</em>}
              </span>
              <span className="txn-amt">{usd(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
          </>
        )
        // Month view: the line shows only its name, amount, strip and pill; the rest folds.
        if (!compact) return detail
        const has = !!(l.info || l.note || chip || l.accounts || l.txns.length || l.unfunded || l.short)
        return has ? (
          <details className="ar-more">
            <summary>details</summary>
            {detail}
          </details>
        ) : null
      })()}
    </div>
  )
}

function Section({
  sec,
  gross,
  spendable,
  showActuals,
  sign = '−',
  open = false,
  bar = true,
  bench,
  lineBench,
  compactLines = false,
  children,
}: {
  children?: React.ReactNode
  sec: StatementSection
  gross: number
  spendable: string
  showActuals: boolean
  sign?: string
  open?: boolean
  bar?: boolean
  /** Month view: the comparison strip for this category. */
  bench?: BenchRow
  /** Month view: a strip for each of the section's lines (Investing's three). */
  lineBench?: Record<string, BenchRow>
  /** Month view: lines show only name, amount and strip — their detail stays folded. */
  compactLines?: boolean
}) {
  const out = sec.lines.filter((l) => !l.nonCash && l.amount > 0 && l.spent !== undefined)
  const budget = out.reduce((s, l) => s + l.amount, 0)
  const spentAll = out.reduce((s, l) => s + (l.spent ?? 0), 0)
  const color = CAT_COLOR[sec.key] ?? CAT_COLOR.other!
  // Count the to-dos themselves: a line with two cards to pay is two, not one.
  const todos = sec.lines.reduce(
    (t, l) => t + (l.accounts ? l.accounts.filter((r) => r.status === 'todo').length : lineChip(l, spendable)?.cls === 'todo' ? 1 : 0),
    0,
  )
  return (
    <details className="sec" open={open}>
      <summary>
        <div className={bench !== undefined || lineBench ? 'bench-row' : undefined}>
        <div className="sec-top">
          <span className="sec-name">
            <i className="swatch-dot" style={{ background: color }} />
            {sec.label}
            {todos > 0 && <span className="sec-todo">{todos} to do</span>}
          </span>
          <span className="sec-amt">
            {sign}
            {usd(Math.abs(sec.total))}
            <span className="ln-pct">{pct(sec.total, gross)}</span>
            {showActuals && budget > 0 && <OutLeft budget={budget} out={spentAll} />}
          </span>
        </div>
        {(bench !== undefined || lineBench) && <BenchStrip b={bench} />}
        </div>
        {bar && sec.total > 0 && (
          <BudgetBar amount={budget || sec.total} gross={gross} spent={spentAll} showPaid={showActuals} color={color} />
        )}
      </summary>
      <div className="sec-body">
        {sec.lines.map((l) => (
          <Line key={l.key} l={l} gross={gross} spendable={spendable} showActuals={showActuals} color={color} base={gross} bench={lineBench?.[l.key]} compact={compactLines} />
        ))}
        {children}
      </div>
    </details>
  )
}

function Total({ label, amount, gross, note, strong }: { label: string; amount: number; gross: number; note?: string; strong?: boolean }) {
  return (
    <div className={`tot${strong ? ' tot-strong' : ''}`}>
      <div>
        <div className="tot-label">{label}</div>
        {note && <div className="tot-note">{note}</div>}
      </div>
      <div className={`tot-amt${amount < 0 ? ' neg' : ''}`}>
        {usd(amount)}
        <span className="ln-pct">{pct(amount, gross)}</span>
      </div>
    </div>
  )
}

function PaydayCard({
  st,
  tag,
  title,
  subtitle,
  showActuals,
  checkingAfter,
  checkingBefore,
  savings,
  short,
  spendable,
  live = false,
  wide = false,
  bench = false,
  maxing,
  mode = 'sam',
  hers,
  householdMonthly,
}: {
  /** The household's average monthly spending, for "months covered". */
  householdMonthly?: number
  /** Sommer's accounts over this card (Sommer and Combined): her own walk, and the liquidity test. */
  hers?: HerCash
  /** Whose card: yours (bank-anchored), Sommer's, or the household's. */
  mode?: 'sam' | 'sommer' | 'both'
  /** The paycheck your latest bank update falls in: "now" comes from the bank. */
  live?: boolean
  /** Always laid out across the full width (the month view). */
  wide?: boolean
  /** Show how the categories compare: typical, advisor rule, your target. */
  bench?: boolean
  /** Month view: progress this calendar year toward the TSP / 401(k) and IRA limits. */
  maxing?: Maxing
  st: PaycheckStatement
  tag: string
  title: string
  subtitle: string
  showActuals: boolean
  checkingAfter: number
  /** Checking at the start of the period: the previous card's end. */
  checkingBefore: number
  /** Savings (buffer) balance after this paycheck. */
  savings: number
  short: number
  spendable: string
}) {
  const g = st.gross.total
  const benchRows = bench ? benchmarkRows(st, mode === 'sam' ? 'sam' : 'household') : null
  // Net cash that ties to the walk: checking's change is end − start (bank-anchored), and any
  // gap from what the records explain is shown as its own line, never blended in.
  // Your take-home only: her pay (Combined) lands in her account, not yours.
  // Paid toward this paycheck's lines before its pay landed: already out of the start balance.
  const priorTxns = ACTUALS.filter((a) => a.payday === st.payday && a.beforeStart)
  const prior = r2(priorTxns.reduce((t, a) => t + a.amount, 0))
  const samPayIn = r2(st.takeHome - (st.gross.lines.find((l) => l.key === 'w_pay')?.amount ?? 0))
  const netCashTied = (() => {
    if (mode === 'sommer') return st.netCash
    const savingsLine = st.netCash.lines.find((l) => l.key === 'savings')
    const checking = r2(checkingAfter - checkingBefore)
    // Her savings (Combined) are not in your accounts: leave them out of the tie.
    const hers = st.netCash.lines.filter((l) => l.key.startsWith('w_')).reduce((t, l) => t + l.amount, 0)
    // Spending beyond a line's budget has already left checking but is not in the plan's
    // cash figure: its own line, so the unexplained gap is only what the bank alone shows.
    const overLines = [...st.spending.flatMap((x) => x.lines), ...st.investing.lines.filter((l) => l.key !== 'tsp' && l.key !== 'retirement')].filter(
      (l) => !l.nonCash && l.amount > 0 && (l.spent ?? 0) > l.amount + 0.005,
    )
    const over = r2(overLines.reduce((t, l) => t + (l.spent! - l.amount), 0))
    // DFAS rarely pays the modelled cent: the difference is in checking, so it gets its own line.
    const deposit = live ? depositFor(st.payday) : null
    const payDiff = deposit != null ? r2(deposit - samPayIn) : 0
    const gap = r2(st.netCash.total - checking - (savingsLine?.amount ?? 0) - hers - over + payDiff + prior)
    const lines: StatementLine[] = [
      { key: 'checking', label: `Change to checking (${usd(checkingBefore)} → ${usd(checkingAfter)})`, amount: checking, txns: [] },
      ...st.netCash.lines.filter((l) => l.key !== 'checking'),
    ]
    if (over > 0.005) {
      lines.push({
        key: 'over_budget',
        label: `Spent over budget so far — ${overLines.map((l) => `${l.label.split(' — ')[0]} ${usd(l.spent! - l.amount)}`).join(', ')}`,
        amount: over,
        txns: [],
        note: 'Already gone from checking but beyond what the plan set aside, so the plan’s cash figure is this much higher than the bank’s.',
      })
    }
    if (prior > 0.005) {
      lines.push({
        key: 'before_start',
        label: `Paid before this pay landed — ${priorTxns.map((a) => `${a.description} ${usd(a.amount)}`).join(', ')}`,
        amount: -prior,
        txns: [],
        note: 'Counted in this paycheck’s budget, but it left checking before the start balance.',
      })
    }
    if (Math.abs(payDiff) > 0.005) {
      lines.push({
        key: 'pay_diff',
        label: `DFAS paid ${usd(deposit!)} — ${usd(Math.abs(payDiff))} ${payDiff > 0 ? 'more' : 'less'} than the model's ${usd(samPayIn)}`,
        amount: -payDiff,
        txns: [],
        note: 'The deposit on the statement against the plan’s estimate of this paycheck.',
      })
    }
    if (Math.abs(gap) > 0.005) {
      lines.push({
        key: 'unexplained',
        label:
          gap < 0
            ? `Bank shows ${usd(-gap)} more than the records explain — not yet explained`
            : `Bank shows ${usd(gap)} less than the records explain — not yet explained`,
        amount: gap,
        txns: [],
        note: 'Usually a charge that has not posted yet, or one the records do not have. Send a screenshot and it gets matched.',
      })
    }
    return { ...st.netCash, lines }
  })()
  const bx = (k: string) => (benchRows ? (benchRows.find((r) => r.key === k) ?? undefined) : undefined)
  return (
    <article className={`pcard${wide ? ' pcard-wide' : ''}${bench ? ' pcard-bench' : ''}`}>
      <header className="pcard-head">
        <div>
          <div className="pcard-tag">{tag}</div>
          <div className="pcard-title">{title}</div>
          <div className="pcard-sub">{subtitle}</div>
        </div>
        <div className="pcard-gross">
          <div className="pcard-big">{usd(g)}</div>
          <div className="pcard-sub">{mode === 'sommer' ? 'her take-home + what you send' : mode === 'both' ? `household in · take-home ${usd(st.takeHome)}` : `gross · take-home ${usd(st.takeHome)}`}</div>
          {!wide && (
            <label className="wide-toggle">
              <input type="checkbox" /> <span>⤢ Expand across</span>
            </label>
          )}
        </div>
      </header>

      {(() => {
        const parts = [
          { key: 'deductions', label: 'Deductions', amount: st.deductions.total },
          ...st.spending.map((x) => ({ key: x.key, label: x.label, amount: x.total })),
          { key: 'invest', label: 'Investing', amount: st.investing.total },
          { key: 'cash', label: 'Kept as cash', amount: Math.max(0, st.netCash.total) },
        ]
        const base = Math.max(g, parts.reduce((t, p) => t + Math.max(0, p.amount), 0))
        return (
          <div className="splitwrap">
            <div className="split-title">Where the gross goes</div>
            <SplitBar parts={parts} base={base} />
            <div className="split-legend">
              {parts
                .filter((p) => p.amount > 0)
                .map((p) => (
                  <span key={p.key}>
                    <i className="swatch-dot" style={{ background: CAT_COLOR[p.key] ?? CAT_COLOR.other }} />
                    {p.label} {((p.amount / base) * 100).toFixed(0)}%
                  </span>
                ))}
            </div>
          </div>
        )
      })()}
      <div className="pcard-body">
      <div className="pcol">
      {bench && <BenchHeader />}
      <Section sec={st.gross} gross={g} spendable={spendable} showActuals={false} sign="" bar={false} />
      <Section sec={st.deductions} gross={g} spendable={spendable} showActuals={false} bar={false} bench={bx('deductions')} />
      <Total label="Net income" amount={st.netIncome} gross={g} strong />
      {st.spending.map((sec) => (
        <Section key={sec.key} sec={sec} gross={g} spendable={spendable} showActuals={showActuals} bench={bx(sec.key)} />
      ))}
      <Total label="Free cash flow" amount={st.freeCashFlow} gross={g} note={mode === 'sam' ? 'After home, car, Wife & Kids, personal and debt' : 'After every spending category'} strong />
      </div>
      <div className="pcol">
      <Section
        sec={st.investing}
        gross={g}
        spendable={spendable}
        showActuals={showActuals}
        lineBench={benchRows ? { retirement: bx('invest')!, brokerage: bx('brokerage')!, business: bx('business')! } : undefined}
        open={!!bench}
        compactLines={!!bench}
      >
        {maxing && <MaxingBox m={maxing} />}
      </Section>

      <Section sec={netCashTied} gross={g} spendable={spendable} showActuals={false} sign={st.netCash.total < 0 ? '−' : '+'} bar={false} bench={bx('cash')}>
      {mode !== 'sommer' && (() => {
        const d = (k: string) => st.netCash.lines.find((l) => l.key === k)?.amount ?? 0
        // The cash walk for checking: where it starts, what comes in, what has gone, what is
        // still to go, and where it ends. On the live paycheck, "now" is the bank's own number.
        const end = checkingAfter
        const start = checkingBefore
        const deposit = live ? depositFor(st.payday) : null
        const payIn = deposit ?? samPayIn
        const plannedOut = r2(start + payIn - end)
        const out = [...st.spending.flatMap((x) => x.lines), ...st.investing.lines.filter((l) => l.key !== 'tsp' && l.key !== 'retirement')].filter(
          (l) => !l.nonCash && l.amount > 0,
        )
        const gone = r2(out.reduce((t, l) => t + (l.spent ?? 0), 0) - prior)
        const remaining = stillToGo(st)
        const bankNow = live ? ACTUALS_AS_OF.availableBalance : null
        const bankEnd = bankNow != null ? r2(bankNow - remaining) : null
        const sStart = r2(savings - d('savings'))
        const other = st.netCash.lines.find((l) => l.key === 'other')
        const Row = ({ k, v, sign, strong, note, cls }: { k: string; v: number; sign?: string; strong?: boolean; note?: string; cls?: string }) => (
          <tr className={`${strong ? 'cw-strong' : ''} ${cls ?? ''}`}>
            <td>
              {k}
              {note && <div className="cw-note">{note}</div>}
            </td>
            <td className={v < 0 ? 'neg' : ''}>
              {sign}
              {sign ? usd(Math.abs(v)) : usd(v)}
            </td>
          </tr>
        )
        return (
          <div className="cashwalk">
            <div className="cw-box">
              <div className="cw-title">{CHECKING}</div>
              <table>
                <tbody>
                  <Row k="Start — before this pay lands" v={start} />
                  <Row
                    k="Pay in"
                    v={payIn}
                    sign="+ "
                    note={deposit != null && Math.abs(deposit - samPayIn) > 0.005 ? `The deposit; the model had ${usd(samPayIn)}.` : undefined}
                  />
                  {bankNow != null ? (
                    <>
                      <Row k="Gone out so far" v={gone} sign="− " />
                      <Row
                        k={`Now — bank, ${nice(ACTUALS_AS_OF.date)} ${ACTUALS_AS_OF.time}`}
                        v={bankNow}
                        strong
                        note={`The plan expected ${usd(r2(start + payIn - gone))} by now.`}
                      />
                      <Row k="Still to go out" v={remaining} sign="− " note="Budgeted lines not yet seen, and the savings transfer." />
                      <Row k="End — est." v={bankEnd!} strong cls={bankEnd! < 0 ? 'cw-bad' : 'cw-end'} />
                    </>
                  ) : (
                    <>
                      <Row k="Going out" v={plannedOut} sign="− " />
                      <Row k="End — est." v={end} strong cls={end < 0 ? 'cw-bad' : 'cw-end'} />
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="cw-box">
              <div className="cw-title">{SAVINGS}</div>
              <table>
                <tbody>
                  <Row k="Start" v={sStart} />
                  <Row k={d('savings') < 0 ? 'Drawn' : 'In'} v={d('savings')} sign={d('savings') < 0 ? '− ' : '+ '} />
                  <Row k="End — est." v={savings} strong cls="cw-end" />
                </tbody>
              </table>
              {other && (
                <p className="cw-note" style={{ marginTop: 8 }}>
                  Your other account: {other.amount < 0 ? '−' : '+'}
                  {usd(Math.abs(other.amount))}, moved into checking.
                </p>
              )}
            </div>
          </div>
        )
      })()}
      {hers && (() => {
        const Row = ({ k, v, sign, strong, cls, note }: { k: string; v: number; sign?: string; strong?: boolean; cls?: string; note?: string }) => (
          <tr className={`${strong ? 'cw-strong' : ''} ${cls ?? ''}`}>
            <td>
              {k}
              {note && <div className="cw-note">{note}</div>}
            </td>
            <td className={v < 0 ? 'neg' : ''}>{sign ? `${sign}${usd(Math.abs(v))}` : usd(v)}</td>
          </tr>
        )
        // The liquidity test: every account at the end of this card, and whether the household
        // as a whole stays above water when one account dips.
        const accounts = [
          ...(mode === 'both'
            ? [
                { name: `Sam — ${CHECKING}`, v: checkingAfter },
                { name: `Sam — ${SAVINGS}`, v: savings },
              ]
            : []),
          { name: 'Sommer — checking', v: hers.checkingEnd },
          { name: 'Sommer — savings', v: hers.savingsEnd },
        ]
        const total = r2(accounts.reduce((t, a) => t + a.v, 0))
        const monthlyOut = householdMonthly ?? r2(st.spending.reduce((t, x) => t + x.total, 0) * (wide ? 1 : 2))
        const months = monthlyOut > 0 ? total / monthlyOut : 0
        const negative = accounts.filter((a) => a.v < 0)
        // Red: the household as a whole is short. Yellow: one account dips, the others cover it.
        const light = total < 0 ? 'red' : negative.length > 0 ? 'yellow' : 'green'
        return (
          <>
            <div className="cashwalk">
              <div className="cw-box">
                <div className="cw-title">Sommer — checking</div>
                <table>
                  <tbody>
                    <Row k="Start" v={hers.checkingStart} note={hers.checkingStart === HER_CHECKING_START ? 'Starting balance not known — assumed $0.' : undefined} />
                    <Row k="Pay + what you send" v={hers.in} sign="+ " />
                    <Row k="Bills, nanny, fun & her savings transfer" v={hers.out} sign="− " />
                    <Row k="End — est." v={hers.checkingEnd} strong cls={hers.checkingEnd < 0 ? 'cw-bad' : 'cw-end'} />
                  </tbody>
                </table>
              </div>
              <div className="cw-box">
                <div className="cw-title">Sommer — savings</div>
                <table>
                  <tbody>
                    <Row k="Start" v={hers.savingsStart} />
                    <Row k="In" v={r2(hers.savingsEnd - hers.savingsStart)} sign="+ " />
                    <Row k="End — est." v={hers.savingsEnd} strong cls="cw-end" />
                  </tbody>
                </table>
              </div>
            </div>
            {mode === 'both' && (
              <div className={`liquidity lq-${light}`}>
                <div className="cw-title">
                  <i className="bdot" /> Household cash — the liquidity test
                </div>
                <table>
                  <tbody>
                    {accounts.map((a) => (
                      <Row key={a.name} k={a.name} v={a.v} cls={a.v < 0 ? 'cw-bad' : ''} />
                    ))}
                    <Row k="All four, end of this card" v={total} strong cls={total < 0 ? 'cw-bad' : 'cw-end'} />
                  </tbody>
                </table>
                <p className="cw-note">
                  {total < 0
                    ? `Short ${usd(-total)} as a household — no account can cover it.`
                    : negative.length
                      ? `${negative.map((a) => a.name).join(' and ')} below zero — covered by the household's other cash (${usd(total)} in all). Move it before the bill hits.`
                      : `All accounts positive.`}{' '}
                  {usd(total)} is {months.toFixed(1)} months of the household's spending (about {usd(monthlyOut)} a month on average); the usual target is 3–6.
                </p>
              </div>
            )}
          </>
        )
      })()}
      </Section>
      <Section sec={st.balanceSheet} gross={g} spendable={spendable} showActuals={false} sign="+" bar={false} />
      <Total label="Net worth change (approx.)" amount={st.balanceSheet.total} gross={g} strong />
      {short > 0 && <div className="chip chip-over" style={{ marginTop: 8 }}>{usd(short)} of bills can&rsquo;t be covered by this paycheck</div>}
      </div>
      </div>
    </article>
  )
}

const BENCH_CHIP: Record<BenchStatus, { cls: string; text: string }> = {
  on: { cls: 'paid', text: '✓ On target' },
  over: { cls: 'over', text: 'Over' },
  under: { cls: 'warn', text: 'Under' },
  fixed: { cls: 'auto', text: 'Fixed' },
  info: { cls: 'auto', text: '—' },
}


const r2 = (n: number) => Math.round(n * 100) / 100

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function PaydayFocus({
  allocations,
  today = todayInTexas(),
  count = 6,
}: {
  allocations: Allocation[]
  today?: string
  count?: number
}) {
  if (allocations.length === 0) return null
  const [ci] = currentAndNext(allocations, today)
  const asOf = ACTUALS_AS_OF
  const seen = new Set(ACTUALS.map((x) => x.payday))
  const latestSeen = [...seen].sort().at(-1)
  // Year-to-date TSP: the plan's paychecks, plus 2026's deployed paychecks before the plan's
  // data (estimated at the same 5% of base).
  const tspOf = (a: Allocation) => a.paycheck.deductions.find((d) => d.key === 'tsp')?.amount ?? 0
  // 2026 before the plan's data, all ESTIMATES at 5% of base pay until your LES gives the
  // real year-to-date: drills (about one weekend — 4 periods — a month, six months), the
  // 4-week annual training, Jul 31 (the first day on orders), then the Aug 15 – Nov 1 paychecks.
  const base30 = monthlyBasicPay() / 30
  const PRE_PLAN_2026 = ['2026-08-15', '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15', '2026-11-01'] as const
  const prePlan = r2(
    PRE_PLAN_2026.reduce((t, d) => t + (projectPaycheck(d).deductions.find((x) => x.key === 'tsp')?.amount ?? 0), 0) +
      0.05 * base30 * (6 * 4 /* drills */ + 28 /* annual training */ + 1 /* 31 Jul */),
  )
  // From 31 Jul on orders, before the plan's data: the Aug 15 – Nov 1 paychecks and 31 Jul.
  const sinceOrdersBeforePlan = r2(
    PRE_PLAN_2026.reduce((t, d) => t + (projectPaycheck(d).deductions.find((x) => x.key === 'tsp')?.amount ?? 0), 0) + 0.05 * base30,
  )
  const maxingThrough = (month: string): Maxing => {
    const year = Number(month.slice(0, 4))
    const inYear = allocations.filter((a) => tspYear(a.paycheck.scheduledDate) === year)
    const sumOf = (xs: Allocation[]) => xs.reduce((t, a) => t + tspOf(a), 0)
    const est = year === 2026 ? prePlan : 0
    // Through this month: paychecks dated in it or before. A 1 Jan check paid 31 Dec counts
    // in December's card.
    const through = inYear.filter((a) => a.paycheck.scheduledDate.slice(0, 7) <= month || tspYear(a.paycheck.scheduledDate) < Number(a.paycheck.scheduledDate.slice(0, 4)) && month.endsWith('-12'))
    const yours = r2(sumOf(through) + est)
    // After the plan's last paycheck: drill weekends at 5% of drill pay.
    const lastPay = allocations.at(-1)!.paycheck.scheduledDate
    const lastMonth = Number(lastPay.slice(5, 7))
    const homeThisYear = Number(lastPay.slice(0, 4)) === year
    const drillTsp = homeThisYear ? 0.05 * PATH_ASSUMPTIONS.drillMonthly * (12 - lastMonth) : 0
    const yearEnd = r2(sumOf(inYear) + est + drillTsp)
    const left = inYear.filter((a) => !through.includes(a))
    const L = limitsFor(year)
    const basePerCheck = r2(monthlyBasicPay() / 2)
    const sinceOrders = r2(sinceOrdersBeforePlan + allocations.filter((a) => a.paycheck.scheduledDate.slice(0, 7) <= month).reduce((t, a) => t + tspOf(a), 0))
    return {
      year,
      month,
      ratePct: 5,
      rateMonthly: r2(monthlyBasicPay() * 0.05),
      yours,
      estimatedPart: est,
      yearEnd,
      checksLeft: left.length,
      perCheckToMax: left.length ? r2(Math.max(0, L.elective - yours) / left.length) : 0,
      basePerCheck,
      homeThisYear,
      sinceOrders,
    }
  }
  // Savings balance after each paycheck: what the save lines put in, less emergency draws.
  const saveKeys = (BUCKETS.find((b) => b.key === 'save')?.keys ?? []) as readonly string[]
  const savingsAfter: number[] = []
  let bal = 0
  for (const x of allocations) {
    bal += x.lines.filter((l) => saveKeys.includes(l.key)).reduce((s, l) => s + l.allocated, 0)
    bal -= (x.draws ?? []).reduce((s, d) => s + d.amount, 0)
    savingsAfter.push(Math.round(Math.max(0, bal) * 100) / 100)
  }

  // The months the next `count` paychecks fall in, each with both of its paychecks.
  const months: string[] = []
  for (const a of allocations.slice(ci, ci + count)) {
    const m = a.paycheck.scheduledDate.slice(0, 7)
    if (!months.includes(m)) months.push(m)
  }
  const idx = (m: string, day: '01' | '15') => allocations.findIndex((a) => a.paycheck.scheduledDate === `${m}-${day}`)

  // Tie the cards to the bank: the live paycheck ends at (bank now − still to go), and every
  // later paycheck starts from that, not from the plan's own running figure.
  const liveIdx = allocations.findIndex((x) => x.paycheck.scheduledDate === latestSeen)
  const modelAfter = (i: number) => {
    const next = allocations[i + 1]
    return (next ? next.openingBuffer : allocations[i]!.remainder) + NOV1.checkingAfter
  }
  const bankOffset =
    liveIdx >= 0
      ? Math.round(
          (ACTUALS_AS_OF.availableBalance -
            stillToGo(paycheckStatement(allocations[liveIdx]!, allocations[liveIdx + 1])) -
            modelAfter(liveIdx)) *
            100,
        ) / 100
      : 0

  const endOf = (i: number) => Math.round((modelAfter(i) + (liveIdx >= 0 && i >= liveIdx ? bankOffset : 0)) * 100) / 100

  // Sommer's accounts, paycheck by paycheck from 1 Nov: her checking takes her pay and what
  // you send and pays everything out, so it holds its start; her savings build.
  const herOrder = [-1, ...allocations.map((_, i) => i)]
  const herStmt = (i: number) => sommerStatement(i < 0 ? nov1Statement() : paycheckStatement(allocations[i]!, allocations[i + 1]))
  const herSavingsAfter = new Map<number, number>()
  {
    let cum = HER_SAVINGS_START
    for (const i of herOrder) {
      cum = r2(cum + herStmt(i).netCash.total)
      herSavingsAfter.set(i, cum)
    }
  }
  // The household's average month, for the "months covered" figure.
  const householdMonthly = (() => {
    const all = allocations.map((a, i) => combinedStatement(paycheckStatement(a, allocations[i + 1])))
    return r2((all.reduce((t, x) => t + x.spending.reduce((u, y) => u + y.total, 0), 0) / all.length) * 2)
  })()
  const herCash = (is: number[]): HerCash => {
    const sts = is.map(herStmt)
    const inn = r2(sts.reduce((t, x) => t + x.gross.total, 0))
    const saved = r2(sts.reduce((t, x) => t + x.netCash.total, 0))
    const first = herOrder.indexOf(is[0]!)
    const savingsStart = first > 0 ? herSavingsAfter.get(herOrder[first - 1]!)! : HER_SAVINGS_START
    return {
      checkingStart: HER_CHECKING_START,
      in: inn,
      out: inn,
      checkingEnd: HER_CHECKING_START,
      savingsStart,
      savingsEnd: herSavingsAfter.get(is[is.length - 1]!)!,
    }
  }

  const cardFor = (i: number) => {
    const a = allocations[i]!
    const next = allocations[i + 1]
    const offset = i - ci
    return {
      i,
      st: paycheckStatement(a, next),
      tag: offset === 0 ? 'Now' : offset === 1 ? 'Next' : offset < 0 ? 'Done' : `+${offset} paychecks`,
      title: nice(a.paycheck.scheduledDate),
      subtitle: `Spendable ~${nice(spendableFrom(a.paycheck.payDate))}${a.paycheck.czte ? ' · tax-free' : ' · taxed'}`,
      showActuals: seen.has(a.paycheck.scheduledDate),
      live: a.paycheck.scheduledDate === latestSeen,
      // The plan starts from $0; the real account came into it with what the 1 Nov paycheck left.
      checkingAfter: endOf(i),
      checkingBefore: i === 0 ? NOV1.checkingAfter : endOf(i - 1),
      savings: savingsAfter[i] ?? 0,
      short: a.lines.reduce((s, l) => s + l.shortfall, 0),
      spendable: spendableFrom(a.paycheck.payDate),
    }
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <h2 style={{ marginTop: 8 }}>Paychecks by month</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Paid-so-far as of your last update: <strong>{nice(asOf.date)}, {asOf.time}</strong> ({asOf.source}
        {asOf.availableBalance != null && <>; {usd(asOf.availableBalance)} available then</>}). The 1st and the
        15th sit side by side; tick <em>One-month view</em> to see the month summed. Tap a category to open it.{' '}
        <strong className="todo-label">Highlighted</strong> lines are yours to do.
      </p>
      <div className="legend-row">
        <span><i className="lg lg-outline" /> Bar length = share of gross pay, the same scale everywhere (outline = budget)</span>
        <span><i className="lg lg-solid" /> Filled = already gone out</span>
        <span><i className="lg lg-over" /> Orange = spent over budget</span>
      </div>
      <WhoSwitch>
      {months.map((m) => {
        const cards: (ReturnType<typeof cardFor> | null)[] = [idx(m, '01'), idx(m, '15')].map((i) => (i >= 0 ? cardFor(i) : null))
        // Before the plan: the 1 Nov paycheck, rebuilt from the statement and screenshots.
        if (m === NOV1.payday.slice(0, 7) && !cards[0]) {
          cards[0] = {
            i: -1,
            st: nov1Statement(),
            tag: 'Done · rebuilt from your bank statement',
            title: nice(NOV1.payday),
            subtitle: 'Spendable ~Wed 28 Oct · tax-free',
            showActuals: true,
            live: false,
            checkingAfter: NOV1.checkingAfter,
            checkingBefore: NOV1.checkingBefore,
            savings: 0,
            short: 0,
            spendable: '2026-10-28',
          }
        }
        const present = cards.filter((c): c is NonNullable<typeof c> => c !== null)
        const [y, mo] = m.split('-').map(Number)
        const label = `${MONTH_NAME[mo! - 1]} ${y}`
        const last = present[present.length - 1]!
        const combined = combineStatements(present.map((c) => c.st))
        return (
          <section className="paymonth" key={m}>
            <div className="paymonth-head">
              <h3>{label}</h3>
              {present.length > 1 && (
                <label className="paymonth-toggle">
                  <input type="checkbox" /> One-month view
                </label>
              )}
            </div>
            {(['sommer', 'both'] as const).map((w) => {
              const make = w === 'sommer' ? sommerStatement : combinedStatement
              const sub = w === 'sommer' ? 'Her pay, what you send, her bills' : 'Your paycheck and hers, as one household'
              return (
                <div className={`who-block who-${w}`} key={w}>
                  <div className="pgrid split">
                    {cards.map((c, k) =>
                      c ? (
                        <PaydayCard key={c.i} {...c} mode={w} st={make(c.st)} subtitle={sub} showActuals={false} live={false} hers={herCash([c.i])} householdMonthly={householdMonthly} />
                      ) : (
                        <div key={`empty-${k}`} className="pcard pcard-empty">
                          {k === 0 ? '1st' : '15th'} paycheck — before this plan started.
                        </div>
                      ),
                    )}
                  </div>
                  {present.length > 1 && (
                    <div className="pgrid combined">
                      <PaydayCard
                        wide
                        bench
                        mode={w}
                        st={combineStatements(present.map((c) => make(c.st)))}
                        tag="Month"
                        title={`${label} — 1st + 15th`}
                        subtitle={sub}
                        showActuals={false}
                        checkingAfter={last.checkingAfter}
                        checkingBefore={present[0]!.checkingBefore}
                        maxing={w === 'both' ? maxingThrough(m) : undefined}
                        hers={herCash(present.map((c) => c.i))}
                        householdMonthly={householdMonthly}
                        savings={last.savings}
                        short={0}
                        spendable={present[0]!.spendable}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="who-block who-sam">
            <div className="pgrid split">
              {cards.map((c, k) =>
                c ? (
                  <PaydayCard key={c.i} {...c} />
                ) : (
                  <div key={`empty-${k}`} className="pcard pcard-empty">
                    {k === 0 ? '1st' : '15th'} paycheck — before this plan started.
                  </div>
                ),
              )}
            </div>
            {present.length > 1 && (
              <div className="pgrid combined">
                <PaydayCard
                  wide
                  bench
                  st={combined}
                  tag="Month"
                  title={`${label} — 1st + 15th`}
                  subtitle={present.map((c) => c.title).join(' + ')}
                  showActuals={present.some((c) => c.showActuals)}
                  checkingAfter={last.checkingAfter}
                  checkingBefore={present[0]!.checkingBefore}
                  maxing={maxingThrough(m)}
                  savings={last.savings}
                  short={present.reduce((s, c) => s + c.short, 0)}
                  spendable={present[0]!.spendable}
                />
              </div>
            )}
            </div>
          </section>
        )
      })}
      </WhoSwitch>
    </section>
  )
}
