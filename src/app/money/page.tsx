import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, balanceClearedOn, summarize } from '@/core/money/allocation'
import { OBLIGATIONS, CAR_LOAN_BALANCE, MORTGAGE_ARREARS_BALANCE } from '@/core/money/obligations'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import { Figure, Legend, StackedBars, TableView, Timeline, Sparkline, seriesColor } from '@/components/viz'

export const dynamic = 'force-dynamic'

const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const HORIZON_START = '2026-08-15'
const HORIZON_END = '2027-08-01'

/** Fixed colour per obligation — by entity, never by rank, so a filter never repaints. */
const COLOR: Record<string, string> = {
  mortgage_current: seriesColor(0),
  car_payoff: seriesColor(1),
  childcare: seriesColor(2),
  living: seriesColor(3),
  nth_investments: seriesColor(4),
  debt_paydown: seriesColor(5),
  emergency_fund: 'var(--series-rest)',
  mortgage_arrears: 'var(--accent)',
}

export default function MoneyPage() {
  const paychecks = projectPaychecks(HORIZON_START, HORIZON_END)
  const allocations = allocateAll(paychecks, OBLIGATIONS)
  const summary = summarize(allocations)
  const cleared = balanceClearedOn(allocations, OBLIGATIONS)

  const columns = allocations.slice(0, 12).map((a) => ({
    label: a.paycheck.payDate.slice(5),
    sublabel: a.paycheck.czte ? 'CZTE' : '',
    segments: a.lines
      .filter((l) => l.allocated > 0)
      .map((l) => ({
        key: l.key,
        label: l.label,
        value: l.allocated,
        color: COLOR[l.key] ?? 'var(--series-rest)',
      })),
    shortfall: a.lines
      .filter((l) => l.kind !== 'arrears_catchup')
      .reduce((s, l) => s + l.shortfall, 0),
  }))

  const arrearsCurve = allocations.reduce<{ label: string; value: number }[]>((acc, a) => {
    const paid = a.lines.find((l) => l.key === 'mortgage_arrears')?.allocated ?? 0
    const prev = acc[acc.length - 1]?.value ?? MORTGAGE_ARREARS_BALANCE
    acc.push({ label: a.paycheck.payDate, value: Math.max(0, Math.round(prev - paid)) })
    return acc
  }, [])

  const legendItems = OBLIGATIONS.map((o) => ({
    label: o.label.split(' — ')[0] ?? o.label,
    color: COLOR[o.key] ?? 'var(--series-rest)',
  }))

  return (
    <>
      <h1>Money</h1>
      <p className="sub">
        {HORIZON_START} → {HORIZON_END}. Deploy {TIMELINE.deploymentStart}, CZTE from{' '}
        {TIMELINE.czteStart}, expected return {TIMELINE.expectedReturn}.
      </p>

      <div className="cards">
        <Card k="Net income" v={usd0(summary.totalNet)} />
        <Card
          k="Unmet obligations"
          v={usd0(summary.bindingShortfall)}
          tone={summary.bindingShortfall > 0 ? 'bad' : 'good'}
          sub={`${summary.bindingShortPaydays.length} of ${summary.paychecks} paydays`}
        />
        <Card
          k="Car paid off"
          v={cleared.car_payoff?.clearedOn ?? '—'}
          tone="good"
          sub={`${usd0(CAR_LOAN_BALANCE)} balance`}
        />
        <Card
          k="Arrears cured"
          v={cleared.mortgage_arrears?.clearedOn ?? 'not within horizon'}
          tone={cleared.mortgage_arrears?.clearedOn ? 'good' : 'bad'}
          sub={`${usd0(MORTGAGE_ARREARS_BALANCE)} behind`}
        />
      </div>

      <div className="note">
        <strong>The catch-up is the pressure gauge.</strong> The arrears line is paid{' '}
        <em>last</em>, so it absorbs whatever survives every other obligation. Its clearance
        date is a measurement of your real slack, not a target you picked. Its unmet ask is
        excluded from the shortfall figure above — otherwise the headline would read like a
        crisis while every actual bill was covered.
      </div>

      <h2>Where each paycheck goes</h2>
      <Figure
        title="Allocation per payday — first 12"
        caption={
          <>
            Stacked by obligation in payment order, bottom to top. The hatched red cap is
            money owed that the payday could not cover, excluding the arrears gauge. Columns
            marked CZTE carry no federal income tax.
          </>
        }
      >
        <StackedBars columns={columns} height={280} format={(n) => usd0(n)} />
        <Legend items={legendItems} />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Payday</th>
                <th>Net</th>
                {OBLIGATIONS.map((o) => (
                  <th key={o.key}>{o.label.split(' — ')[0]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.paycheck.scheduledDate}>
                  <td>{a.paycheck.payDate}</td>
                  <td>{usd(a.paycheck.net)}</td>
                  {OBLIGATIONS.map((o) => {
                    const l = a.lines.find((x) => x.key === o.key)
                    return (
                      <td key={o.key} className={l && l.shortfall > 0 ? 'bad' : ''}>
                        {l ? usd(l.allocated) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>Arrears burn-down</h2>
      <Figure
        title="Mortgage arrears remaining"
        caption={`Starts at ${usd0(MORTGAGE_ARREARS_BALANCE)} — four months behind. Falls only as fast as the paydays allow, because this line is paid last.`}
      >
        <Sparkline points={arrearsCurve} format={(n) => usd0(n)} color="var(--accent)" />
      </Figure>

      <h2>Entitlements</h2>
      <Figure
        title="What is running when"
        caption="Hatched bars are dates or amounts I estimated rather than ones you confirmed. BAS and the tax rates are still estimates; everything else you confirmed on 2026-08-05."
      >
        <Timeline
          from="2026-07-31"
          to={TIMELINE.expectedReturn}
          today="2026-08-05"
          bars={ENTITLEMENTS.map((e, i) => ({
            key: e.key,
            label: e.label.split(' — ')[0] ?? e.key,
            start: e.activeFrom ?? '2026-07-31',
            end: e.activeTo ?? TIMELINE.expectedReturn,
            color: seriesColor(i),
            estimated: e.confidence !== 'high',
            note: e.note,
          }))}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Entitlement</th>
                <th>Monthly</th>
                <th>Taxable</th>
                <th>From</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {ENTITLEMENTS.map((e) => (
                <tr key={e.key}>
                  <td>{e.label}</td>
                  <td>{usd0(e.monthlyAmount)}</td>
                  <td className="muted">{e.taxable ? 'yes' : 'no'}</td>
                  <td className="muted">{e.activeFrom ?? 'now'}</td>
                  <td className={e.confidence === 'high' ? 'good' : 'warn'}>{e.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <p className="muted" style={{ fontSize: 12.5 }}>
        Federal tax modelled as a flat {(TAX.effectiveFederalRate * 100).toFixed(0)}% effective
        rate outside CZTE; FICA {(TAX.ficaRate * 100).toFixed(2)}% on base pay throughout. Rates
        live in <code>src/core/money/rates.ts</code>, obligations in{' '}
        <code>src/core/money/obligations.ts</code>.
      </p>
    </>
  )
}

function Card({
  k,
  v,
  sub,
  tone,
}: {
  k: string
  v: string
  sub?: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <div className="panel card">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
      {sub && (
        <div className="muted" style={{ fontSize: 12 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
