import { projectPaychecks } from '@/core/money/paychecks'
import {
  allocateAll,
  balanceClearedOn,
  paydayActions,
  steadyMonthlySlack,
  summarize,
} from '@/core/money/allocation'
import {
  OBLIGATIONS,
  CAR_LOAN_BALANCE,
  CLOSED_DEBT_BALANCE,
  MORTGAGE_ARREARS_BALANCE,
  OPEN_DEBT_BALANCE,
  AGREEMENT_MONTHLY,
  ONE_OFFS,
  LATE_PAYMENTS_BALANCE,
  OPEN_CARD_MINIMUMS,
  CLOSED_CARD_MINIMUMS,
  MORTGAGE_PAYMENT,
  EXPECTED_BACK_PAY_NET,
  BACK_PAY_CLAIMS,
} from '@/core/money/obligations'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import { backPay, EXPECTED_BACK_PAY } from '@/core/money/drillPay'
import { windfallPlan, windfallSensitivity } from '@/core/money/windfall'
import { SCRA_INTEREST_CAP, SCRA_TARGETS, SCRA_EXCLUDED } from '@/core/money/debts'
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
const round0 = (n: number) => Math.round(n)

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
  debt_agreements: seriesColor(9),
  card_minimums_open: seriesColor(6),
  debt_paydown_open: seriesColor(6),
  card_minimums_closed: seriesColor(7),
  debt_paydown_closed: seriesColor(7),
  late_payments: seriesColor(10),
  emergency_fund: seriesColor(8),
  mortgage_arrears: 'var(--accent)',
  future_fund: 'var(--series-rest)',
}

export default function MoneyPage() {
  const paychecks = projectPaychecks(HORIZON_START, HORIZON_END)
  const allocations = allocateAll(paychecks, OBLIGATIONS, ONE_OFFS)
  const summary = summarize(allocations)
  const cleared = balanceClearedOn(allocations, OBLIGATIONS)
  const steadySlack = steadyMonthlySlack(allocations)
  const bp = backPay(EXPECTED_BACK_PAY)
  const bpAlt = backPay({ ...EXPECTED_BACK_PAY, basis: 'idt_two_mutas' })
  const backPayPlan = windfallPlan(bp.net, BACK_PAY_CLAIMS)
  const backPayRange = windfallSensitivity([800, bp.net, bpAlt.net], BACK_PAY_CLAIMS)
  const oneOffIn = allocations.reduce(
    (t, a) => t + (a.oneOffs ?? []).reduce((u, o) => u + o.amount, 0),
    0,
  )
  const closingBuffer = allocations[allocations.length - 1]?.remainder ?? 0
  /**
   * Not the fifteen individual transfers — the four dates the delinquency count drops.
   * The balance is a means; the count of missed payments is what the servicer acts on.
   */
  const arrearsProgress = (() => {
    const months = MORTGAGE_ARREARS_BALANCE / MORTGAGE_PAYMENT
    const cured: { month: number; date: string }[] = []
    let running = 0
    let firstPayment: { date: string; amount: number } | null = null
    for (const a of allocations) {
      // Every line drawing on the arrears balance, not just the sweep.
      const paid = a.lines
        .filter((l) => (l.capGroup ?? l.key) === 'mortgage_arrears')
        .reduce((t, l) => t + l.allocated, 0)
      if (paid <= 0) continue
      if (!firstPayment) firstPayment = { date: a.paycheck.payDate, amount: paid }
      running += paid
      while (cured.length < months && running >= (cured.length + 1) * MORTGAGE_PAYMENT - 0.005) {
        cured.push({ month: cured.length + 1, date: a.paycheck.payDate })
      }
    }
    return { months, cured, firstPayment }
  })()

  /**
   * The back pay as its own bar, sitting between the paydays it falls between.
   *
   * Starred because the date is a guess — it is drawn as a column so it is visible in
   * the same shape as everything else, not because it is scheduled. Its segments come
   * from the ordered claim list, so the bar shows the plan rather than a total.
   */
  const backPayColumn = {
    label: '8/21*',
    sublabel: `${usd0(bp.net)} back pay`,
    segments: backPayPlan.lines.map((l) => ({
      key: `bp-${l.key}`,
      label: `${l.label} — ${usd0(l.amount)}${l.partial ? ` (${usd0(l.remaining)} still owed)` : ''}`,
      value: round0(l.amount),
      color:
        l.key === 'tolls' ? COLOR.late_payments! : COLOR.mortgage_arrears!,
    })),
  }

  const paydayColumns = allocations.slice(0, 12).map((a) => ({
    label: a.paycheck.payDate.slice(5),
    sublabel: a.paycheck.czte ? 'CZTE' : '',
    segments: a.lines
      .filter((l) => l.allocated > 0 || l.shortfall > 0)
      .map((l) => ({
        key: l.key,
        label: l.label,
        value: l.allocated,
        // Only bills can be short. Waterfall lines never ask for a set amount.
        ...(l.shortfall > 0 ? { unmet: l.shortfall } : {}),
        color: COLOR[l.key] ?? 'var(--series-rest)',
      })),
  }))

  /** Slot the starred bar in after the cheque it follows. */
  const columns = [
    ...paydayColumns.slice(0, 1),
    backPayColumn,
    ...paydayColumns.slice(1),
  ]

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

  /**
   * Every dollar, one destination. Sums allocations across the whole horizon, so the
   * parts add exactly to net income — no "miscellaneous", no residue. The last row is
   * cash still in hand at the end of the horizon, which is a job too: it is what funds
   * the 1st, and it is the only row that is not yet spent.
   */
  const usesOfFunds = (() => {
    const byKey = new Map<string, number>()
    for (const a of allocations) {
      for (const l of a.lines) {
        byKey.set(l.key, (byKey.get(l.key) ?? 0) + l.allocated)
      }
    }
    const rows = OBLIGATIONS.filter((o) => (byKey.get(o.key) ?? 0) > 0.005).map((o) => ({
      key: o.key,
      label: o.label.split(' — ')[0] ?? o.label,
      value: Math.round(byKey.get(o.key) ?? 0),
      color: COLOR[o.key] ?? 'var(--series-rest)',
    }))
    const closing = Math.round(allocations[allocations.length - 1]?.remainder ?? 0)
    if (closing > 0) {
      rows.push({
        key: 'buffer',
        label: 'Still in hand (funds the next 1st)',
        value: closing,
        color: 'var(--series-rest)',
      })
    }
    const assigned = rows.reduce((s, r) => s + r.value, 0)
    return { rows, assigned }
  })()

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
          k="Bills unpaid"
          v={usd0(summary.bindingShortfall)}
          tone={summary.bindingShortfall > 0 ? 'bad' : 'good'}
          sub={`${summary.bindingShortPaydays.length} of ${summary.paychecks} paydays`}
        />
        <Card
          k="Open cards cleared"
          v={cleared.open_cards?.clearedOn ?? 'not within horizon'}
          tone={cleared.open_cards?.clearedOn ? 'good' : 'bad'}
          sub={`${usd0(OPEN_DEBT_BALANCE)} across 3 live accounts`}
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
        <strong>Below the bills, nothing asks for an amount — each line takes everything.</strong>{' '}
        Steady-state slack after every committed bill is about{' '}
        <strong>{usd0(steadySlack)} a month</strong>, and all of it goes to one balance at
        a time, in this order: arrears, then the three open cards, then the emergency fund,
        then the closed balances, then the law-school fund. A line clears and vanishes, and
        the whole flow moves to the next.
      </div>

      <div className="note">
        <strong>What that buys inside the deployment.</strong> The house comes current{' '}
        <strong>{cleared.mortgage_arrears?.clearedOn ?? 'not within the horizon'}</strong>.
        The open cards — {usd0(OPEN_DEBT_BALANCE)}, the only balances with a live credit
        line and so the only ones that move a score — clear{' '}
        <strong>{cleared.open_cards?.clearedOn ?? 'not within the horizon'}</strong>.
        The emergency fund then reaches {usd0(cleared.emergency_fund?.paid ?? 0)} of its{' '}
        {usd0(cleared.emergency_fund?.cap ?? 0)} target by the time you come home. The{' '}
        {usd0(CLOSED_DEBT_BALANCE)} on the remaining closed accounts is queued behind all
        of that and is not reached — worth clearing eventually, but there is no credit line to free up, so
        it does not outrank a cash reserve — though their <em>minimums</em> are bills and
        are paid from day one, because a closed account still bills one. Chase is not in
        that figure — it is under a{' '}
        {usd0(AGREEMENT_MONTHLY)}/mo agreement, which makes it a bill rather than a
        balance you choose a rate for, and defaulting on an arrangement costs more than
        the payment does. Goldman and PSECU are in no line here at all:
        both were sued on and dismissed, and paying them is a legal decision rather than a
        scheduling one.
      </div>

      <div className="note">
        <strong>The arrears clock, not the arrears balance.</strong> Around four payments
        behind is where a servicer may make its first foreclosure filing, so the number
        that matters is the count of missed payments, not the dollars. The arrears sit
        first in the waterfall and take everything free from the very first cheque.
        <p style={{ marginTop: 8 }}>
          <strong>
            One FULL payment of {usd0(MORTGAGE_PAYMENT)} on the 15 August cheque
          </strong>{' '}
          — one transfer, not two, and not contingent on anything arriving. A full
          payment on each 1st stays a separate bill at the top of the stack, and from the
          next payday on everything free goes at the arrears as partials. It shares the
          arrears balance, so it buys back a missed month rather than being a fifth
          payment on a four-payment debt.
        </p>
        <p style={{ marginTop: 8 }} className="bad">
          <strong>What it costs, stated plainly.</strong> That cheque frees about{' '}
          {usd0(510)} after every other bill, so {usd0(790)} of the {usd0(MORTGAGE_PAYMENT)}{' '}
          has no funding on the day — the model reports it as an unpaid bill rather than
          absorbing it quietly, and it is the only such gap in the whole horizon. It also
          spends the cheque to the last dollar, so nothing carries into 1 September.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>
            The back pay closes both, and it only has to land before 1 September — not
            before the 15th.
          </strong>{' '}
          That is a much softer dependency than the date suggests. But if it slips past
          the 1st, the casualty is the{' '}
          <strong>{usd0(AGREEMENT_MONTHLY)} Chase agreement payment</strong>, and missing
          one of those typically voids the arrangement and re-exposes the full balance.
          If the money has not appeared by the last week of August, pay Chase first and
          send the mortgage balance late.
        </p>
        <table style={{ marginTop: 8 }}>
          <tbody>
            {arrearsProgress.cured.map((c) => (
              <tr key={c.month}>
                <td>Missed payment {c.month} of {arrearsProgress.months} made good</td>
                <td>{c.date}</td>
                <td className={c.month === arrearsProgress.months ? 'good' : 'muted'}>
                  {c.month === arrearsProgress.months
                    ? 'current — clock stopped'
                    : `${arrearsProgress.months - c.month} still behind`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 8 }} className="muted">
          SCRA gives real foreclosure protection on a pre-service mortgage, but it is a
          defence rather than a cure — the fees and the credit reporting happen anyway.
          And paying the CURRENT mortgage on time is a separate line at the top of the
          stack: missing one adds a month back and undoes this.
        </p>
      </div>

      <h2>Two things to do now</h2>
      <div className="note">
        <strong>1. Drill back pay — 7 MUTAs plus 3 days on a 1380.</strong> A drill period
        pays <strong>one thirtieth of MONTHLY basic pay</strong> and carries no allowances
        at all — no BAH, no BAS. So this is worth more than it feels like and none of it
        is the tax-free part.
        <table style={{ marginTop: 8 }}>
          <tbody>
            {bp.lines.map((l) => (
              <tr key={l.key}>
                <td>{l.label}</td>
                <td style={{ textAlign: 'right' }}>{usd(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="muted">Federal tax and FICA</td>
              <td className="muted" style={{ textAlign: 'right' }}>
                − {usd(bp.federalTax + bp.fica)}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Net to you</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{usd(bp.net)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8 }} className="muted">
          Where it goes is on its own card below — the date and the amount are both
          guesses, so it gets a plan rather than a slot in the schedule.
        </p>
        <p className="muted" style={{ fontSize: 12.5 }}>
          The three 1380 days are read conservatively, as active-duty days at 1/30th of
          basic pay plus BAS. If they were inactive duty in day status they pay two drill
          periods each and the whole batch is worth {usd(bpAlt.net)} net —{' '}
          {usd(bpAlt.net - bp.net)} more. Check which the orders say. Not CZTE either way:
          drills performed at home station before you shipped are ordinary taxable wages.
        </p>
      </div>

      <div className="note">
        <strong>2. File SCRA interest-cap requests — before you ship.</strong> Caps
        interest at {Math.round(SCRA_INTEREST_CAP * 100)}% on every debt incurred before
        active duty began. Three things make this worth an afternoon:{' '}
        <strong>it is retroactive to 2026-07-31</strong>, so filing late still recovers
        the months in between; the excess above {Math.round(SCRA_INTEREST_CAP * 100)}% is{' '}
        <strong>forgiven, not deferred</strong> — the rare case where the creditor does
        not get it back later; and <strong>it is not automatic</strong>, so nothing
        happens until you write to them with a copy of the orders.
        <ul className="tight" style={{ marginTop: 8 }}>
          {SCRA_TARGETS.map((t) => (
            <li key={t.creditor}>
              <strong>{t.creditor}</strong> — {t.reason}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 8 }}>Deliberately not on that list:</p>
        <ul className="tight">
          {SCRA_EXCLUDED.map((t) => (
            <li key={t.creditor} className="muted">
              <strong>{t.creditor}</strong> — {t.reason}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Mortgage and auto already have SCRA active — verify the cap actually appears on
          a statement rather than assuming the request was processed. Not legal advice.
        </p>
      </div>

      <h2>8/21* — whenever the back pay actually hits</h2>
      <div className="note">
        <strong>
          The asterisk is the point: {ONE_OFFS[0]?.date} is a placeholder, not a date.
        </strong>{' '}
        &ldquo;Sometime this month&rdquo; is all anyone knows, and the amount is a range
        too. So nothing with a deadline is funded out of this — the 14 August cheque pays
        what it can pay on its own, and this money gets an ordered list instead of a slot
        in the schedule. Order is by <em>consequence of delay</em>, not by size: something
        that escalates on a date beats something that escalates over months, which beats
        something that merely accrues interest.
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Pay in this order</th>
              <th>At {usd0(bp.net)}</th>
              <th>Why here</th>
            </tr>
          </thead>
          <tbody>
            {BACK_PAY_CLAIMS.map((c) => {
              const line = backPayPlan.lines.find((l) => l.key === c.key)
              return (
                <tr key={c.key}>
                  <td style={{ whiteSpace: 'normal' }}>
                    {c.label}
                    {line?.howTo && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {line.howTo}
                      </div>
                    )}
                  </td>
                  <td className={line ? 'good' : 'muted'}>
                    {line ? usd(line.amount) : '—'}
                    {line?.partial && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {usd(line.remaining)} still owed
                      </div>
                    )}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'normal', fontSize: 12.5 }}>
                    {c.because}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <p style={{ marginTop: 12 }}>
          <strong>You guessed car and tolls. Tolls yes, car no</strong> — the car is due
          on the 25th and the 14 August cheque already funds it in full, so putting it on
          this list would pay it twice and push something genuinely exposed further down.
          What is actually exposed is August&rsquo;s mortgage payment: that cheque frees
          about {usd0(510)} on its own, which is not a full month, and completing the
          month is what moves the delinquency count.
        </p>

        <p style={{ marginTop: 12 }}>
          <strong>The order does not change with the amount</strong> — only how far down
          the list you get. Which is why the order is the decision and the forecast is not:
        </p>
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>If this arrives</th>
              {BACK_PAY_CLAIMS.map((c) => (
                <th key={c.key} style={{ whiteSpace: 'normal' }}>
                  {c.label.split(' —')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {backPayRange.map(({ amount, plan }) => (
              <tr key={amount}>
                <td>
                  {usd0(amount)}
                  <span className="muted">
                    {amount === bp.net ? ' — expected' : amount === bpAlt.net ? ' — if IDT' : ' — if low'}
                  </span>
                </td>
                {BACK_PAY_CLAIMS.map((c) => {
                  const line = plan.lines.find((l) => l.key === c.key)
                  return (
                    <td key={c.key} className={line ? 'good' : 'muted'}>
                      {line ? usd0(line.amount) : 'nothing'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Sources of funds</h2>
      <div className="note">
        <strong>Where the money comes from, so the uses below have something to add up to.</strong>
        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td>Net pay, {summary.paychecks} cheques</td>
              <td style={{ textAlign: 'right' }}>{usd(summary.totalNet)}</td>
            </tr>
            <tr>
              <td>One-off money (drill back pay)</td>
              <td style={{ textAlign: 'right' }}>+ {usd(oneOffIn)}</td>
            </tr>
            <tr>
              <td>
                <strong>Total available</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{usd(summary.totalNet + oneOffIn)}</strong>
              </td>
            </tr>
            <tr>
              <td className="muted">Allocated below</td>
              <td className="muted" style={{ textAlign: 'right' }}>
                − {usd(summary.totalNet + oneOffIn - closingBuffer)}
              </td>
            </tr>
            <tr>
              <td className="muted">Still in hand at the horizon</td>
              <td className="muted" style={{ textAlign: 'right' }}>{usd(closingBuffer)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8 }}>
          These balance to the cent by construction, and that is the point: if the uses
          below ever fail to add to the total above, the model has lost money and the
          page should be disbelieved. Within a single payday the two sides will NOT match
          — the 1st carries the mortgage and spends the 15th&rsquo;s surplus to do it. The
          &ldquo;+ Carried in&rdquo; column further down is that draw, shown rather than
          hidden.
        </p>
      </div>

      <h2>Uses of funds — every dollar has a job</h2>
      <Figure
        title={`Where all ${usd0(usesOfFunds.assigned)} goes — net pay plus the back pay, ${HORIZON_START} → ${HORIZON_END}`}
        caption={
          <>
            One bar, sliced by destination. There is deliberately no{' '}
            <em>miscellaneous</em> and no remainder: the law-school sweep takes whatever
            survives, so the slices add to the total above exactly. Money without a named
            destination is the money that disappears.
            {usesOfFunds.rows.some((r) => r.key === 'buffer') && (
              <>
                {' '}
                The last slice is cash still in hand at the horizon — not spare, but
                reserved: the 1st carries the mortgage and the truck while the 15th is
                light, so a buffer has to survive the 15th for the 1st to clear.
              </>
            )}
          </>
        }
      >
        <StackedBars
          height={120}
          format={(n) => usd0(n)}
          columns={[
            {
              label: 'All paydays',
              sublabel: usd0(usesOfFunds.assigned),
              segments: usesOfFunds.rows,
            },
          ]}
        />
        <Legend items={usesOfFunds.rows.map((r) => ({ label: r.label, color: r.color }))} />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Destination</th>
                <th>Total</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {usesOfFunds.rows.map((r) => (
                <tr key={`uof-${r.key}`}>
                  <td>{r.label}</td>
                  <td>{usd0(r.value)}</td>
                  <td className="muted">
                    {((r.value / usesOfFunds.assigned) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>In against out, per pay period</h2>
      <Figure
        title="Net income vs committed expenses"
        caption={
          <>
            Both bars are dollars on one axis, so where they cross means what it looks
            like it means. The income bar is <strong>available cash</strong>, not the
            cheque: on the 1st the cheque alone does not cover the bills, and the surplus
            carried from the 15th is what closes the gap. That draw is included here, so
            the two bars are on the same basis and a month that balances looks like one.{' '}
            <strong>Expenses are bills only</strong> — the waterfall absorbs whatever is
            left by design, so including it would make every period look exactly
            break-even. The gap between the bars IS what the waterfall gets.
          </>
        }
      >
        <GroupedBars
          height={280}
          format={(n) => usd0(n)}
          columns={allocations.slice(0, 12).map((a) => {
            const committed = a.lines
              .filter((l) => l.kind !== 'arrears_catchup' && !l.swept)
              .reduce((s, l) => s + l.requested, 0)
            return {
              label: a.paycheck.payDate.slice(5),
              sublabel: a.paycheck.czte ? 'CZTE' : '',
              bars: [
                {
                  key: 'in',
                  label:
                    a.openingBuffer > 0
                      ? `Available: ${usd0(a.paycheck.net)} cheque + ${usd0(a.openingBuffer)} drawn from surplus`
                      : 'Net in',
                  value: round0(a.paycheck.net + a.openingBuffer),
                  color: seriesColor(2),
                },
                { key: 'out', label: 'Committed out', value: round0(committed), color: seriesColor(1) },
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
                <th>+ Carried in</th>
                <th>= Available</th>
                <th>Committed out</th>
                <th>Difference</th>
                <th>To waterfall</th>
                <th>Filling</th>
                <th>Carried out</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => {
                const committed = a.lines
                  .filter((l) => l.kind !== 'arrears_catchup' && !l.swept)
                  .reduce((s, l) => s + l.requested, 0)
                // Against AVAILABLE, not against the cheque — on the 1st the cheque
                // alone does not cover the bills, and the 15th's surplus is what closes
                // the gap. Comparing to the cheque would report a deficit that is not one.
                const diff = a.paycheck.net + a.openingBuffer - committed
                const waterfall = a.lines.filter((l) => l.swept && l.allocated > 0)
                const toWaterfall = waterfall.reduce((s2, l) => s2 + l.allocated, 0)
                // Which balance the money is actually landing on this payday.
                const filling = waterfall
                  .map((l) => l.label.split(' — ')[0] ?? l.label)
                  .join(', ')
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
                    <td className={a.openingBuffer > 0 ? 'good' : 'muted'}>
                      {a.openingBuffer > 0 ? `+ ${usd(a.openingBuffer)}` : '—'}
                    </td>
                    <td>
                      <strong>{usd(a.paycheck.net + a.openingBuffer)}</strong>
                    </td>
                    <td>{usd(committed)}</td>
                    <td className={diff >= 0 ? 'good' : 'bad'}>{usd(diff)}</td>
                    <td className={toWaterfall > 0 ? 'good' : 'muted'}>
                      {toWaterfall > 0 ? usd(toWaterfall) : '—'}
                    </td>
                    <td className="muted">{filling || '—'}</td>
                    <td className="muted">{a.remainder > 0 ? usd(a.remainder) : '—'}</td>
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
        title="Allocation per payday — first 12, plus the starred back pay"
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
