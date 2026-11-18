import type { Allocation } from '@/core/money/allocation'
import { EARLY_PAY_BUSINESS_DAYS } from '@/core/money/statements'
import { BUCKETS } from '@/core/money/briefing'
import { ACTUALS, ACTUALS_AS_OF, actualsFor, spentOn, type Actual } from '@/core/money/actuals'
import { PAYMENT_INFO, scheduledFor, CHECKING, SAVINGS, type PaymentInfo, type Scheduled } from '@/core/money/execution'
import { combineStatements, paycheckStatement, type PaycheckStatement, type StatementLine, type StatementSection } from '@/core/money/statement'

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
  home: 'Sent home',
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

function lineStatus(l: StatementLine, spendable: string): { text: string; cls: string } {
  if (l.nonCash || l.amount <= 0) return { text: '', cls: 'muted' }
  const spent = l.spent ?? 0
  if (l.todo) return { text: `To do: ${l.todo}`, cls: 'todo' }
  if (spent > l.amount + 0.5) return { text: `${usd(spent)} spent — over by ${usd(spent - l.amount)}`, cls: 'warn' }
  if (spent >= l.amount - 0.5) return { text: '✓ paid', cls: 'good' }
  if (l.scheduled) return { text: `Scheduled ${nice(l.scheduled.date)} (${l.scheduled.by})`, cls: 'sched' }
  if (l.info?.unconfirmed) return { text: 'Unconfirmed: may not be going out. Check.', cls: 'warn' }
  if (l.info?.how === 'automatic') {
    return { text: spent > 0 ? `${usd(spent)} so far · auto, ${l.info.when}` : `Auto · ${l.info.when}`, cls: 'muted' }
  }
  if (!l.info && !l.byHand) return { text: spent > 0 ? `${usd(spent)} so far` : '', cls: 'muted' }
  if (l.info?.when === 'done') return { text: '', cls: 'muted' }
  const so = spent > 0 ? `${usd(spent)} done · ` : ''
  return { text: `${so}To do: ${usd(l.amount - spent)}${l.date ? '' : ` from ~${nice(spendable)}`}`, cls: 'todo' }
}

function Line({ l, gross, spendable, showActuals }: { l: StatementLine; gross: number; spendable: string; showActuals: boolean }) {
  const st = lineStatus(l, spendable)
  return (
    <div className="payrow payline">
      <span className="payline-name">
        <span className={st.cls === 'todo' ? 'todo-label' : undefined}>{l.label}</span>
        {l.date && <span className="muted"> · {nice(l.date)}</span>}
        {l.info && (
          <span className="payline-acct">
            {l.info.from} → {l.info.to}
          </span>
        )}
        {(l.note || l.info?.note) && <span className="payline-acct">{l.note ?? l.info?.note}</span>}
        {st.text && <span className={`payline-status ${st.cls}`}>{st.text}</span>}
        {l.txns.map((t, k) => (
          <span className="payline-txn" key={k}>
            {nice(t.date)} · {t.description} · {usd(t.amount)}
            {t.status === 'pending' ? ' · pending' : ''}
          </span>
        ))}
        {(l.short ?? 0) > 0 && <span className="payline-status bad">short {usd(l.short!)}</span>}
      </span>
      <span className="paybar-cell">
        {showActuals && !l.nonCash && l.amount > 0 && (l.spent ?? 0) >= 0 && l.spent !== undefined && (
          <Progress budget={l.amount} spent={l.spent} />
        )}
      </span>
      <span className="paypct">{l.nonCash ? '' : pct(l.amount, gross)}</span>
      <span className={`payamt ${l.nonCash ? 'muted' : ''}`}>
        {l.nonCash ? '(' : ''}
        {usd(l.amount)}
        {l.nonCash ? ')' : ''}
      </span>
    </div>
  )
}

function Section({
  sec,
  gross,
  spendable,
  showActuals,
  sign = '−',
  open = true,
}: {
  sec: StatementSection
  gross: number
  spendable: string
  showActuals: boolean
  sign?: string
  open?: boolean
}) {
  const out = sec.lines.filter((l) => !l.nonCash && l.amount > 0 && l.spent !== undefined)
  const budget = out.reduce((s, l) => s + l.amount, 0)
  const spent = out.reduce((s, l) => s + Math.min(l.spent ?? 0, l.amount), 0)
  return (
    <details className="paycat" open={open}>
      <summary className="payrow">
        <span className="paycat-name">{sec.label}</span>
        <span className="paybar-cell">{showActuals && budget > 0 && <Progress budget={budget} spent={spent} />}</span>
        <span className="paypct">{pct(sec.total, gross)}</span>
        <span className="payamt">
          {sign}
          {usd(Math.abs(sec.total))}
        </span>
      </summary>
      {sec.lines.map((l) => (
        <Line key={l.key} l={l} gross={gross} spendable={spendable} showActuals={showActuals} />
      ))}
    </details>
  )
}

function Total({ label, amount, gross, note }: { label: string; amount: number; gross: number; note?: string }) {
  return (
    <div className="payrow paytotal">
      <span>
        {label}
        {note && <span className="payline-acct">{note}</span>}
      </span>
      <span />
      <span className="paypct">{pct(amount, gross)}</span>
      <span className={`payamt ${amount < 0 ? 'bad' : ''}`}>{usd(amount)}</span>
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
  savings,
  short,
  spendable,
}: {
  st: PaycheckStatement
  tag: string
  title: string
  subtitle: string
  showActuals: boolean
  checkingAfter: number
  /** Savings (buffer) balance after this paycheck. */
  savings: number
  short: number
  spendable: string
}) {
  const g = st.gross.total
  return (
    <div className="panel payday">
      <div className="payday-head">
        <div>
          <div className="muted payday-tag">{tag}</div>
          <div className="payday-title">{title}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {subtitle} · take-home {usd(st.takeHome)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="payday-title">{usd(g)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>gross</div>
        </div>
      </div>

      <div className="payrow payhdr">
        <span />
        <span />
        <span className="paypct">% gross</span>
        <span className="payamt">$</span>
      </div>
      <Section sec={st.gross} gross={g} spendable={spendable} showActuals={false} sign="" open={false} />
      <Section sec={st.deductions} gross={g} spendable={spendable} showActuals={false} open={false} />
      <Total label="Net income" amount={st.netIncome} gross={g} />
      {st.spending.map((sec) => (
        <Section key={sec.key} sec={sec} gross={g} spendable={spendable} showActuals={showActuals} />
      ))}
      <Total label="Free cash flow" amount={st.freeCashFlow} gross={g} note="Net income less home, car, sent home, personal and debt." />
      <Section sec={st.investing} gross={g} spendable={spendable} showActuals={showActuals} />
      <Section sec={st.netCash} gross={g} spendable={spendable} showActuals={false} sign={st.netCash.total < 0 ? '−' : '+'} />
      <div className="payline-acct" style={{ marginLeft: 14 }}>
        After this paycheck: {CHECKING} {usd(checkingAfter)} · {SAVINGS} {usd(savings)}
        {checkingAfter > 1 ? ' — checking is held for tighter paydays ahead, not spare.' : ''}
      </div>
      <Section sec={st.balanceSheet} gross={g} spendable={spendable} showActuals={false} sign="+" open={false} />
      <Total label="Net worth change (approx.)" amount={st.balanceSheet.total} gross={g} />
      {short > 0 && (
        <div className="bad" style={{ fontSize: 12.5, marginTop: 6 }}>
          {usd(short)} of bills can&rsquo;t be covered by this paycheck.
        </div>
      )}
    </div>
  )
}

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
      checkingAfter: next ? next.openingBuffer : a.remainder,
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
        15th sit side by side; tick <em>One-month view</em> to see the month summed. Tap a category to fold it.{' '}
        <strong className="todo-label">Bold blue</strong> lines are yours to do.
      </p>
      {months.map((m) => {
        const cards = [idx(m, '01'), idx(m, '15')].map((i) => (i >= 0 ? cardFor(i) : null))
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
            <div className="paydays split">
              {cards.map((c, k) =>
                c ? (
                  <PaydayCard key={c.i} {...c} />
                ) : (
                  <div key={`empty-${k}`} className="panel payday payday-empty muted">
                    {k === 0 ? '1st' : '15th'} paycheck — before this plan started.
                  </div>
                ),
              )}
            </div>
            {present.length > 1 && (
              <div className="paydays combined">
                <PaydayCard
                  st={combined}
                  tag="Month"
                  title={`${label} — 1st + 15th`}
                  subtitle={present.map((c) => c.title).join(' + ')}
                  showActuals={present.some((c) => c.showActuals)}
                  checkingAfter={last.checkingAfter}
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
