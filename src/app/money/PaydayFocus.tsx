import type { Allocation } from '@/core/money/allocation'
import { EARLY_PAY_BUSINESS_DAYS } from '@/core/money/statements'

/**
 * The two paychecks that matter today: the one you are spending now and the next one.
 * Shown open at the top of the Money page — everything else is detail.
 *
 * "Current" is the most recent paycheck that is already spendable. Pay lands about two
 * business days before its official date, so a paycheck counts as current from then.
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

function PaydayCard({ a, tag }: { a: Allocation; tag: string }) {
  const lines = a.lines.filter((l) => l.allocated > 0 || l.shortfall > 0)
  const oneOffs = a.oneOffs ?? []
  const short = lines.reduce((s, l) => s + l.shortfall, 0)
  const opening = a.openingBuffer ?? 0
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{tag}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{nice(a.paycheck.scheduledDate)} paycheck</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Spendable from about {nice(spendableFrom(a.paycheck.payDate))}
            {a.paycheck.czte ? ' · tax-free (CZTE)' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{usd(a.paycheck.net)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {opening > 0 ? `+ ${usd(opening)} carried in` : 'take-home'}
          </div>
        </div>
      </div>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <tbody>
            {oneOffs.map((o) => (
              <tr key={`o-${o.key}`}>
                <td style={{ whiteSpace: 'normal' }}>{o.label}</td>
                <td className={o.amount < 0 ? 'bad' : 'good'}>{usd(o.amount)}</td>
              </tr>
            ))}
            {lines.map((l) => (
              <tr key={l.key}>
                <td style={{ whiteSpace: 'normal' }}>
                  {l.label}
                  {l.execution === 'manual' && <span className="muted"> · by hand</span>}
                </td>
                <td>
                  {usd(l.allocated)}
                  {l.shortfall > 0 && <div className="bad" style={{ fontSize: 12 }}>short {usd(l.shortfall)}</div>}
                </td>
              </tr>
            ))}
            <tr>
              <td><strong>Left after this paycheck</strong></td>
              <td><strong className={a.remainder > 0 ? 'good' : 'muted'}>{usd(a.remainder)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      {short > 0 && (
        <div className="bad" style={{ fontSize: 12.5, marginTop: 6 }}>
          {usd(short)} of bills can&rsquo;t be covered by this paycheck.
        </div>
      )}
    </div>
  )
}

export function PaydayFocus({ allocations, today = todayInTexas() }: { allocations: Allocation[]; today?: string }) {
  if (allocations.length === 0) return null
  const [ci, ni] = currentAndNext(allocations, today)
  return (
    <section style={{ marginBottom: 18 }}>
      <h2 style={{ marginTop: 8 }}>This paycheck and the next</h2>
      <div className="grid2">
        <PaydayCard a={allocations[ci]!} tag="Now" />
        {ni !== null && <PaydayCard a={allocations[ni]!} tag="Next" />}
      </div>
    </section>
  )
}
