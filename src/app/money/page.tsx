import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, balanceClearedOn, paydayActions, summarize } from '@/core/money/allocation'
import { OBLIGATIONS, CAR_LOAN_BALANCE, MORTGAGE_ARREARS_BALANCE } from '@/core/money/obligations'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import {
  Figure,
  GroupedBars,
  Legend,
  StackedBars,
  TableView,
  Timeline,
  Sparkline,
  seriesColor,
} from '@/components/viz'

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
  living_home: seriesColor(3),
  living_deployed: seriesColor(3),
  support_home: seriesColor(4),
  support_home_deployed: seriesColor(4),
  nth_investments: seriesColor(5),
  debt_paydown: 'var(--series-rest)',
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
      .filter((l) => l.allocated > 0 || (l.kind !== 'arrears_catchup' && l.shortfall > 0))
      .map((l) => ({
        key: l.key,
        label: l.label,
        value: l.allocated,
        // The gauge asks for more than it can get by design; that is not a cut.
        ...(l.kind !== 'arrears_catchup' && l.shortfall > 0 ? { unmet: l.shortfall } : {}),
        color: COLOR[l.key] ?? 'var(--series-rest)',
      })),
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

      <h2>In against out, per pay period</h2>
      <Figure
        title="Net income vs committed expenses"
        caption={
          <>
            Both bars are dollars on one axis, so where they cross means what it looks
            like it means. <strong>Expenses exclude the arrears catch-up</strong> — that
            line absorbs whatever is left by design, so including it would make every
            period look exactly break-even and tell you nothing. The gap between the bars
            IS what goes at the arrears.
          </>
        }
      >
        <GroupedBars
          height={280}
          format={(n) => usd0(n)}
          columns={allocations.slice(0, 12).map((a) => {
            const committed = a.lines
              .filter((l) => l.kind !== 'arrears_catchup')
              .reduce((s, l) => s + l.requested, 0)
            return {
              label: a.paycheck.payDate.slice(5),
              sublabel: a.paycheck.czte ? 'CZTE' : '',
              bars: [
                { key: 'in', label: 'Net in', value: a.paycheck.net, color: seriesColor(2) },
                { key: 'out', label: 'Committed out', value: committed, color: seriesColor(1) },
              ],
            }
          })}
        />
        <Legend
          items={[
            { label: 'Net income', color: seriesColor(2) },
            { label: 'Committed expenses', color: seriesColor(1) },
          ]}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Payday</th>
                <th>Gross</th>
                <th>Tax</th>
                <th>Deducted</th>
                <th>Net in</th>
                <th>Committed out</th>
                <th>Difference</th>
                <th>To arrears</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => {
                const committed = a.lines
                  .filter((l) => l.kind !== 'arrears_catchup')
                  .reduce((s, l) => s + l.requested, 0)
                const diff = a.paycheck.net - committed
                const toArrears =
                  a.lines.find((l) => l.kind === 'arrears_catchup')?.allocated ?? 0
                return (
                  <tr key={`io-${a.paycheck.scheduledDate}`}>
                    <td>{a.paycheck.payDate}</td>
                    <td className="muted">{usd(a.paycheck.gross)}</td>
                    <td className="muted">
                      {usd(a.paycheck.federalTax + a.paycheck.fica)}
                    </td>
                    <td className="muted">
                      {a.paycheck.deductionsTotal > 0 ? usd(a.paycheck.deductionsTotal) : '—'}
                    </td>
                    <td>{usd(a.paycheck.net)}</td>
                    <td>{usd(committed)}</td>
                    <td className={diff >= 0 ? 'good' : 'bad'}>{usd(diff)}</td>
                    <td className="muted">{usd(toArrears)}</td>
                    <td className={a.remainder > 0 ? 'good' : 'muted'}>{usd(a.remainder)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>What each paycheck is made of</h2>
      <Figure
        title="Net pay by entitlement, first 12 paydays"
        caption={
          <>
            The <strong>solid stack is net</strong> — what actually lands. The dashed block
            on top is everything withheld: tax, FICA, and the DFAC meal collection once
            you are in theatre. So the full bar height is gross. Watch it collapse at
            the CZTE boundary: federal income tax goes to zero while FICA keeps coming out
            of base pay, which is why the bar barely moves but net jumps{' '}
            {usd0(
              (allocations.find((a) => a.paycheck.czte)?.paycheck.net ?? 0) -
                (allocations.find((a) => !a.paycheck.czte)?.paycheck.net ?? 0),
            )}
            .
          </>
        }
      >
        <StackedBars
          height={280}
          format={(n) => usd0(n)}
          columns={allocations.slice(0, 12).map((a) => ({
            label: a.paycheck.payDate.slice(5),
            sublabel: `${a.paycheck.czte ? 'CZTE ' : ''}${usd0(a.paycheck.net)}`,
            segments: [
              ...a.paycheck.lines.map((l, i) => ({
                key: l.key,
                label: l.label,
                value: l.amount,
                color: seriesColor(i),
              })),
              {
                key: 'withheld',
                label:
                  `Withheld: fed ${usd0(a.paycheck.federalTax)} + FICA ${usd0(a.paycheck.fica)}` +
                  (a.paycheck.deductionsTotal > 0
                    ? ` + ${a.paycheck.deductions.map((d) => `${d.label} ${usd0(d.amount)}`).join(', ')}`
                    : ''),
                value:
                  a.paycheck.federalTax + a.paycheck.fica + a.paycheck.deductionsTotal,
                color: 'var(--series-rest)',
                hatched: true,
              },
            ],
          }))}
        />
        <Legend
          items={[
            ...ENTITLEMENTS.map((e, i) => ({
              label: e.label.split(' — ')[0] ?? e.key,
              color: seriesColor(i),
            })),
            { label: 'Withheld — tax, FICA, meal collection', color: 'var(--series-rest)' },
          ]}
        />
      </Figure>

      <h2>Where each paycheck goes</h2>
      <Figure
        title="Allocation per payday — first 12"
        caption={
          <>
            Stacked by obligation in payment order, bottom to top. A dashed, faded block
            sits directly above its own solid one and in its own colour: that is the part of{' '}
            <em>that specific line</em> the payday could not cover, so you can see what is
            being curtailed rather than only that something was. The arrears gauge is
            excluded — it asks for more than it can get by design. Columns marked CZTE carry
            no federal income tax.
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
                <th>Earned</th>
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
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {a.paycheck.lines
                      .map((l) => `${l.key} ${usd0(l.amount)}`)
                      .join(' · ')}
                  </td>
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

      <h2>What you have to actually do, per payday</h2>
      <p className="sub">
        Escrow and autopay are excluded — they are real money but not real tasks, and
        putting them on a list trains you to skim it. These are the transfers that only
        happen if you make them happen.
      </p>
      {allocations.slice(0, 6).map((a) => {
        const actions = paydayActions(a)
        const automatic = a.lines.filter((l) => l.execution === 'automatic' && l.allocated > 0)
        return (
          <div className="panel" key={`act-${a.paycheck.scheduledDate}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>{a.paycheck.payDate}</strong>
              <span className="muted">
                {usd(a.paycheck.net)} in · {actions.length} action(s) ·{' '}
                {usd(actions.reduce((s, x) => s + x.amount, 0))} to move by hand
              </span>
            </div>
            <div className="scroll">
              <table>
                <tbody>
                  {actions.map((action) => (
                    <tr key={action.key}>
                      <td style={{ width: 24 }}>☐</td>
                      <td style={{ whiteSpace: 'normal' }}>
                        <strong>{action.label}</strong>
                        {action.howTo && (
                          <div className="muted" style={{ fontSize: 12.5 }}>
                            {action.howTo}
                          </div>
                        )}
                      </td>
                      <td>{usd(action.amount)}</td>
                      <td className={action.partial ? 'bad' : 'muted'}>
                        {action.partial ? `short ${usd(action.shortfall)}` : ''}
                      </td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
                    <tr>
                      <td className="muted">Nothing to do by hand on this payday.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {automatic.length > 0 && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Automatic: {automatic.map((l) => `${l.label} ${usd(l.allocated)}`).join(' · ')}
              </div>
            )}
          </div>
        )
      })}

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
