import type { Allocation } from '@/core/money/allocation'
import { EARLY_PAY_BUSINESS_DAYS } from '@/core/money/statements'
import { BUCKETS } from '@/core/money/briefing'
import { ACTUALS, ACTUALS_AS_OF, actualsFor, spentOn, type Actual } from '@/core/money/actuals'
import { PAYMENT_INFO, scheduledFor, CHECKING, SAVINGS, type PaymentInfo, type Scheduled } from '@/core/money/execution'
import { nov1Statement, NOV1 } from '@/core/money/reconstruct'
import { combineStatements, paycheckStatement, type PaycheckStatement, type StatementLine, type StatementSection } from '@/core/money/statement'
import { benchmarkRows, type BenchRow, type BenchStatus } from '@/core/money/benchmarks'

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

/** What is still to go out of checking this paycheck: budget not yet seen, plus the savings transfer. */
function stillToGo(st: PaycheckStatement): number {
  const out = [...st.spending.flatMap((x) => x.lines), ...st.investing.lines.filter((l) => l.key !== 'tsp')].filter(
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
}: {
  l: StatementLine
  gross: number
  spendable: string
  showActuals: boolean
  color: string
  /** What every bar is a share of: gross pay, one scale for categories, lines and items. */
  base: number
}) {
  const chip = showActuals || l.scheduled || l.todo || l.info ? lineChip(l, spendable) : null
  const todo = chip?.cls === 'todo'
  return (
    <div className={`ln${todo ? ' ln-todo' : ''}`}>
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
      {/* Every line gets its pill: length = its share of gross (the same scale everywhere), fill = paid. */}
      {!l.nonCash && l.amount > 0 && (
        <BudgetBar amount={l.amount} gross={base} spent={l.spent} showPaid={showActuals} color={color} />
      )}
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
                <span className="ar-amt">{r.paid > 0 ? usd(r.paid) : r.status === 'auto' || r.status === 'part' ? usd(r.minimum) : `~${usd(r.minimum)}`}</span>
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
              {l.accounts.length} {parts ? 'parts of the bill' : l.accounts.length === 1 ? 'item' : 'items'}
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
}: {
  sec: StatementSection
  gross: number
  spendable: string
  showActuals: boolean
  sign?: string
  open?: boolean
  bar?: boolean
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
        {bar && sec.total > 0 && (
          <BudgetBar amount={budget || sec.total} gross={gross} spent={spentAll} showPaid={showActuals} color={color} />
        )}
      </summary>
      <div className="sec-body">
        {sec.lines.map((l) => (
          <Line key={l.key} l={l} gross={gross} spendable={spendable} showActuals={showActuals} color={color} base={gross} />
        ))}
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
}: {
  /** The paycheck your latest bank update falls in: "now" comes from the bank. */
  live?: boolean
  /** Always laid out across the full width (the month view). */
  wide?: boolean
  /** Show how the categories compare: typical, advisor rule, your target. */
  bench?: boolean
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
          <div className="pcard-sub">gross · take-home {usd(st.takeHome)}</div>
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
      {bench && <MonthTable st={st} />}
      {!bench && (
      <div className="pcard-body">
      <div className="pcol">
      <Section sec={st.gross} gross={g} spendable={spendable} showActuals={false} sign="" bar={false} />
      <Section sec={st.deductions} gross={g} spendable={spendable} showActuals={false} bar={false} />
      <Total label="Net income" amount={st.netIncome} gross={g} strong />
      {st.spending.map((sec) => (
        <Section key={sec.key} sec={sec} gross={g} spendable={spendable} showActuals={showActuals} />
      ))}
      <Total label="Free cash flow" amount={st.freeCashFlow} gross={g} note="After home, car, Wife & Kids, personal and debt" strong />
      </div>
      <div className="pcol">
      <Section sec={st.investing} gross={g} spendable={spendable} showActuals={showActuals} />
      <Section sec={st.netCash} gross={g} spendable={spendable} showActuals={false} sign={st.netCash.total < 0 ? '−' : '+'} bar={false} />
      {(() => {
        const d = (k: string) => st.netCash.lines.find((l) => l.key === k)?.amount ?? 0
        // The cash walk for checking: where it starts, what comes in, what has gone, what is
        // still to go, and where it ends. On the live paycheck, "now" is the bank's own number.
        const end = checkingAfter
        const start = checkingBefore
        const plannedOut = r2(start + st.takeHome - end)
        const out = [...st.spending.flatMap((x) => x.lines), ...st.investing.lines.filter((l) => l.key !== 'tsp')].filter(
          (l) => !l.nonCash && l.amount > 0,
        )
        const gone = r2(out.reduce((t, l) => t + (l.spent ?? 0), 0))
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
                  <Row k="Pay in" v={st.takeHome} sign="+ " />
                  {bankNow != null ? (
                    <>
                      <Row k="Gone out so far" v={gone} sign="− " />
                      <Row
                        k={`Now — bank, ${nice(ACTUALS_AS_OF.date)} ${ACTUALS_AS_OF.time}`}
                        v={bankNow}
                        strong
                        note={`The plan expected ${usd(r2(start + st.takeHome - gone))} by now.`}
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
      <Section sec={st.balanceSheet} gross={g} spendable={spendable} showActuals={false} sign="+" bar={false} />
      <Total label="Net worth change (approx.)" amount={st.balanceSheet.total} gross={g} strong />
      {short > 0 && <div className="chip chip-over" style={{ marginTop: 8 }}>{usd(short)} of bills can&rsquo;t be covered by this paycheck</div>}
      </div>
      </div>
      )}
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

/**
 * The one-month view: ONE table. Each category is a row across the full width — your
 * dollars and share on the left, then typical, the advisor rule, the robo, Ramsey,
 * Kiyosaki, the plan target and status. Tap a category to open its lines beneath it.
 */
function MonthTable({ st }: { st: PaycheckStatement }) {
  const g = st.gross.total
  const bench = benchmarkRows(st)
  const b = (k: string) => bench.find((r) => r.key === k)
  const sec = (k: string) => st.spending.find((x) => x.key === k)
  const isNth = (l: StatementLine) => l.key === 'nth_investments' || /Nth/.test(l.label)
  const tsp = st.investing.lines.filter((l) => !isNth(l))
  const nth = st.investing.lines.filter(isNth)
  const cash = (ls: StatementLine[]) => ls.filter((l) => !l.nonCash).reduce((t, l) => t + l.amount, 0)

  type Row =
    | { kind: 'group'; key: string; label: string; amount: number; sign: string; lines: StatementLine[]; bench?: BenchRow }
    | { kind: 'total'; label: string; amount: number }
  const rows: Row[] = [
    { kind: 'group', key: 'gross', label: 'Gross income', amount: g, sign: '', lines: st.gross.lines },
    { kind: 'group', key: 'deductions', label: 'Deduction expenses', amount: st.deductions.total, sign: '−', lines: st.deductions.lines, bench: b('deductions') },
    { kind: 'total', label: 'Net income', amount: st.netIncome },
    ...st.spending.map(
      (x): Row => ({ kind: 'group', key: x.key, label: x.label, amount: x.total, sign: '−', lines: x.lines, bench: b(x.key) }),
    ),
    { kind: 'total', label: 'Free cash flow', amount: st.freeCashFlow },
    { kind: 'group', key: 'invest', label: 'Investing (TSP)', amount: cash(tsp), sign: '−', lines: tsp, bench: b('invest') },
    ...(nth.length ? [{ kind: 'group' as const, key: 'business', label: 'Nth — your business', amount: cash(nth), sign: '−', lines: nth, bench: b('business') }] : []),
    { kind: 'group', key: 'cash', label: 'Net cash', amount: st.netCash.total, sign: st.netCash.total < 0 ? '−' : '+', lines: st.netCash.lines, bench: b('cash') },
    { kind: 'group', key: 'bs', label: 'Balance sheet impact', amount: st.balanceSheet.total, sign: '+', lines: st.balanceSheet.lines },
    { kind: 'total', label: 'Net worth change (approx.)', amount: st.balanceSheet.total },
  ]
  const pctOf = (n: number) => `${((n / g) * 100).toFixed(1)}%`
  const voice = (v?: { pct: number; why: string }, status?: BenchStatus) =>
    v ? (
      <>
        <div className="v-pct">
          {v.pct}%
          {status && status !== 'info' && <span className={`chip chip-${BENCH_CHIP[status].cls} v-chip`}>{BENCH_CHIP[status].text}</span>}
        </div>
        <div className="v-why">{v.why}</div>
      </>
    ) : null

  return (
    <div className="tablewrap mt-wrap">
      <table className="monthtable">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">This month</th>
            <th className="num">% gross</th>
            <th>Typical, age 25–34</th>
            <th>Advisor rule</th>
            <th>Robo, tuned to you</th>
            <th>Dave Ramsey</th>
            <th>Robert Kiyosaki</th>
            <th>Plan target</th>
            <th>Status vs plan</th>
          </tr>
        </thead>
        {rows.map((r, i) => {
          if (r.kind === 'total') {
            return (
              <tbody key={`t${i}`} className="mt-total">
                <tr>
                  <td>{r.label}</td>
                  <td className={`num${r.amount < 0 ? ' neg' : ''}`}>{usd(r.amount)}</td>
                  <td className="num">{pctOf(r.amount)}</td>
                  <td colSpan={7} />
                </tr>
              </tbody>
            )
          }
          const bx = r.bench
          return (
            <tbody key={r.key} className="mt-grp">
              <tr className="mt-head">
                <td>
                  <label className="mt-name">
                    <input type="checkbox" className="mt-tog" />
                    <i className="swatch-dot" style={{ background: CAT_COLOR[r.key] ?? CAT_COLOR.other }} />
                    {r.label}
                  </label>
                </td>
                <td className="num b-you">
                  {r.sign}
                  {usd(Math.abs(r.amount))}
                </td>
                <td className="num b-you">
                  {bx ? `${bx.you.toFixed(1)}%` : pctOf(r.amount)}
                  {bx?.key === 'invest' && <div className="v-why">incl. match</div>}
                </td>
                <td>{bx?.typical}</td>
                <td>{bx?.advisor}</td>
                <td>{voice(bx?.robo, bx?.robo.status)}</td>
                <td>{voice(bx?.ramsey)}</td>
                <td>{voice(bx?.kiyosaki)}</td>
                <td>{bx?.target}</td>
                <td>
                  {bx && (
                    <>
                      <span className={`chip chip-${BENCH_CHIP[bx.status].cls}`} style={{ marginTop: 0 }}>
                        {BENCH_CHIP[bx.status].text}
                      </span>
                      {bx.verdict && <div className="b-verdict">{bx.verdict}</div>}
                    </>
                  )}
                </td>
              </tr>
              {r.lines.map((l) => (
                <tr key={l.key} className="mt-line">
                  <td>
                    {l.label}
                    {l.date && <span className="ln-dim"> · {nice(l.date)}</span>}
                  </td>
                  <td className={`num${l.nonCash ? ' ln-dim' : ''}`}>{l.nonCash ? `(${usd(l.amount)})` : usd(l.amount)}</td>
                  <td className="num ln-dim">{pctOf(l.amount)}</td>
                  <td colSpan={7} className="mt-meta">
                    {l.info && `${l.info.from} → ${l.info.to}`}
                    {(l.spent ?? 0) > 0 && !l.nonCash && <span> · {usd(l.spent!)} gone out</span>}
                    {(l.unfunded ?? 0) > 0 && <span className="neg"> · ⚠ {usd(l.unfunded!)} over budget</span>}
                    {l.accounts && <span> · {l.accounts.map((a) => a.name).join(', ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          )
        })}
        <tbody className="mt-total">
          <tr>
            <td>Allocations</td>
            <td />
            <td className="num">{bench.reduce((t, r) => t + r.you, 0).toFixed(0)}%</td>
            <td colSpan={2} className="v-why">Yours counts the Army’s match, so it tops 100%.</td>
            <td>{bench.reduce((t, r) => t + r.robo.pct, 0)}%</td>
            <td>{bench.reduce((t, r) => t + r.ramsey.pct, 0)}%</td>
            <td>{bench.reduce((t, r) => t + r.kiyosaki.pct, 0)}%</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      <p className="b-note">
        <strong>Robo</strong>: what an automated planner would set from your profile alone — not from this plan: deployed and
        tax-free to July, a household to run, ~$18k of card-rate debt, little cash, and an uncertain income from August. Match
        first, runway second, highest-rate debt third, then investing. <strong>Ramsey</strong> and <strong>Kiyosaki</strong>:
        paraphrased from their published advice and applied to you — not quotes. Each of the three sums to 100% of gross.
        Typical: US households with a head aged 25–34, approximate (BLS Consumer Expenditure Survey, Fed debt-service ratio,
        Vanguard How America Saves); your gross includes untaxed BAH and BAS, so every share reads a little low. Tap a category
        to see its lines; the 1st and 15th cards have every transaction.
      </p>
    </div>
  )
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
                  savings={last.savings}
                  short={present.reduce((s, c) => s + c.short, 0)}
                  spendable={present[0]!.spendable}
                />
              </div>
            )}
          </section>
        )
      })}
    </section>
  )
}
