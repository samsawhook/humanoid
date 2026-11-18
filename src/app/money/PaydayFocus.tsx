import type { Allocation } from '@/core/money/allocation'
import { EARLY_PAY_BUSINESS_DAYS } from '@/core/money/statements'
import { BUCKETS } from '@/core/money/briefing'
import { ACTUALS, ACTUALS_AS_OF, spentOn } from '@/core/money/actuals'

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
  /** Positive = money out. Negative = money in (a one-off arriving, a spending trim). */
  budget: number
  spent: number
  short: number
  byHand: boolean
  date?: string
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
  })
  const groups: Group[] = []
  const used = new Set<string>()
  for (const b of BUCKETS) {
    const mine = lines.filter(
      (l) => !used.has(l.key) && ((b.keys as readonly string[]).includes(l.key) || (b.keys as readonly string[]).includes(l.capGroup ?? '')),
    )
    mine.forEach((l) => used.add(l.key))
    if (mine.length) groups.push({ key: b.key, label: LABELS[b.key] ?? b.label, rows: mine.map(toRow) })
  }
  const other = lines.filter((l) => !used.has(l.key))
  if (other.length) groups.push({ key: 'other', label: 'Other', rows: other.map(toRow) })
  // Money in or out between this payday and the next. The allocator books it into the
  // next paycheck's opening balance; it is shown here, in the period it was spent.
  const between = next?.oneOffs ?? []
  if (between.length) {
    groups.push({
      key: 'between',
      label: 'Between paydays',
      rows: between.map((o) => ({
        key: o.key,
        label: o.label,
        budget: -o.amount,
        spent: spentOn(payday, o.key),
        short: 0,
        byHand: false,
        date: o.date,
      })),
    })
  }
  return groups
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

function status(row: Row): { text: string; cls: string } {
  if (row.budget <= 0) return { text: '', cls: 'muted' }
  if (row.spent >= row.budget - 0.5) return { text: '✓ paid', cls: 'good' }
  if (row.spent > 0) return { text: `${usd(row.spent)} so far`, cls: 'warn' }
  return { text: 'not seen yet', cls: 'muted' }
}

function PaydayCard({
  a,
  next,
  tag,
  showActuals,
}: {
  a: Allocation
  next?: Allocation
  tag: string
  showActuals: boolean
}) {
  const groups = groupsFor(a, next)
  const opening = a.openingBuffer ?? 0
  const carriedOut = next ? next.openingBuffer : a.remainder
  const short = a.lines.reduce((s, l) => s + l.shortfall, 0)
  const outRows = groups.flatMap((g) => g.rows).filter((r) => r.budget > 0)
  const budgeted = outRows.reduce((s, r) => s + r.budget, 0)
  const spent = outRows.reduce((s, r) => s + Math.min(r.spent, r.budget), 0)
  return (
    <div className="panel payday">
      <div className="payday-head">
        <div>
          <div className="muted payday-tag">{tag}</div>
          <div className="payday-title">{nice(a.paycheck.scheduledDate)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Spendable ~{nice(spendableFrom(a.paycheck.payDate))}
            {a.paycheck.czte ? ' · tax-free' : ' · taxed'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="payday-title">{usd(a.paycheck.net)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {opening !== 0 ? `${opening > 0 ? '+' : '−'} ${usd(Math.abs(opening))} carried in` : 'take-home'}
          </div>
        </div>
      </div>

      {showActuals && budgeted > 0 && (
        <div className="muted payday-progress">
          <Progress budget={budgeted} spent={spent} />
          <span>
            {usd(spent)} of {usd(budgeted)} gone out
          </span>
        </div>
      )}

      {groups.map((g) => {
        const gBudget = g.rows.reduce((s, r) => s + r.budget, 0)
        const gOut = g.rows.filter((r) => r.budget > 0)
        const gSpent = gOut.reduce((s, r) => s + Math.min(r.spent, r.budget), 0)
        const gOutTotal = gOut.reduce((s, r) => s + r.budget, 0)
        const gShort = g.rows.reduce((s, r) => s + r.short, 0)
        return (
          <details key={g.key} className="paycat" open>
            <summary className="payrow">
              <span className="paycat-name">{g.label}</span>
              <span className="paybar-cell">{showActuals && <Progress budget={gOutTotal} spent={gSpent} />}</span>
              <span className={`payamt ${gBudget < 0 ? 'good' : ''}`}>
                {gBudget < 0 ? '+' : '−'}
                {usd(Math.abs(gBudget))}
              </span>
            </summary>
            {g.rows.map((r) => {
              const st = status(r)
              return (
                <div className="payrow payline" key={r.key}>
                  <span className="payline-name">
                    {r.label}
                    {r.date && <span className="muted"> · {nice(r.date)}</span>}
                    {r.byHand && <span className="muted"> · by hand</span>}
                    {showActuals && st.text && <span className={`payline-status ${st.cls}`}>{st.text}</span>}
                    {r.short > 0 && <span className="payline-status bad">short {usd(r.short)}</span>}
                  </span>
                  <span className="paybar-cell">
                    {showActuals && r.budget > 0 && <Progress budget={r.budget} spent={r.spent} />}
                  </span>
                  <span className={`payamt ${r.budget < 0 ? 'good' : ''}`}>
                    {r.budget < 0 ? '+' : ''}
                    {usd(Math.abs(r.budget))}
                  </span>
                </div>
              )
            })}
            {gShort > 0 && <div className="bad payline-status">short {usd(gShort)} in this group</div>}
          </details>
        )
      })}

      <div className="payday-foot">
        <span>
          <strong>Carried to the next paycheck</strong>
          {carriedOut > 1 && (
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              Held for tighter paydays ahead, not spare.
            </span>
          )}
        </span>
        <strong className={carriedOut > 0 ? 'good' : 'muted'}>{usd(carriedOut)}</strong>
      </div>
      {short > 0 && (
        <div className="bad" style={{ fontSize: 12.5, marginTop: 6 }}>
          {usd(short)} of bills can&rsquo;t be covered by this paycheck.
        </div>
      )}
    </div>
  )
}

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
  const shown = allocations.slice(ci, ci + count)
  const asOf = ACTUALS_AS_OF
  const seen = new Set(ACTUALS.map((x) => x.payday))
  return (
    <section style={{ marginBottom: 18 }}>
      <h2 style={{ marginTop: 8 }}>The next {shown.length} paychecks</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Paid-so-far as of your last update: <strong>{nice(asOf.date)}, {asOf.time}</strong> ({asOf.source}
        {asOf.availableBalance != null && <>; {usd(asOf.availableBalance)} available then</>}). Tap a
        category to fold it away.
      </p>
      <div className="paydays">
        {shown.map((a, i) => (
          <PaydayCard
            key={a.paycheck.scheduledDate}
            a={a}
            next={allocations[ci + i + 1]}
            tag={i === 0 ? 'Now' : i === 1 ? 'Next' : `+${i} paychecks`}
            showActuals={seen.has(a.paycheck.scheduledDate)}
          />
        ))}
      </div>
    </section>
  )
}
