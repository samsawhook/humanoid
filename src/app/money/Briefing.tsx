/**
 * The money briefing — what an adviser would put in front of you, in the order you
 * would want it: the verdict, the four numbers, what needs you, then the evidence.
 *
 * Every figure comes from running the real allocator (briefing.ts). Every suggestion's
 * value is the plan re-run with that suggestion applied, not an estimate typed in.
 */

import {
  runPlan,
  moveImpacts,
  allMoves,
  stressTest,
  monthlyComposition,
  trajectory,
  tightestPayday,
  openingDebt,
  BUCKETS,
  HORIZON,
  type BucketKey,
} from '@/core/money/briefing'
import {
  EMERGENCIES,
  MORTGAGE_PAYMENT,
  CAR_PAYMENT,
  PLAN_AS_OF,
} from '@/core/money/obligations'
import { OBSERVED_NET_MONTHLY } from '@/core/money/rates'
import { SDP_CAP, SDP_ACCRUAL_TAIL_DAYS, SDP_LAST_DEPOSIT } from '@/core/money/sdp'
import { RETIREMENT_ACCOUNTS } from '@/core/money/lawschool'
import { addLocalDays } from '@/core/time/localDay'
import { Figure, Legend, StackedBars, TableView, Timeline, seriesColor } from '@/components/viz'
import { TrendChart } from '@/components/TrendChart'
import { CHECKING_DAILY, DFAS_PAYCHECKS, overdraftDips } from '@/core/money/statements'

const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${usd0(Math.abs(n))}`
const nice = (iso: string | null) =>
  iso
    ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'not by homecoming'
const monthName = (ym: string) =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** Fixed colour per bucket, by entity and in palette order — never by rank. */
const BUCKET_COLOR: Record<BucketKey, string> = {
  housing: seriesColor(0),
  home: seriesColor(1),
  you: seriesColor(2),
  debt: seriesColor(3),
  invest: seriesColor(4),
  save: seriesColor(5),
}

type Level = 'critical' | 'warning' | 'serious' | 'good'
const LEVEL: Record<Level, { icon: string; label: string }> = {
  critical: { icon: '!', label: 'Act now' },
  warning: { icon: '◐', label: 'Watch' },
  serious: { icon: '?', label: 'Confirm' },
  good: { icon: '✓', label: 'On track' },
}

function Pill({ level, children }: { level: Level; children?: React.ReactNode }) {
  return (
    <span className={`pill ${level}`}>
      <span aria-hidden>{LEVEL[level].icon}</span>
      {children ?? LEVEL[level].label}
    </span>
  )
}

export function Briefing() {
  const base = runPlan()
  const impacts = moveImpacts(base)
  const together = allMoves()
  const stress = stressTest()
  const months = monthlyComposition(base.allocations)
  const traj = trajectory(base)
  const tight = tightestPayday(base)
  const startDebt = openingDebt()
  const early = stress.find((s) => s.case.key === 'early')!
  const calm = stress.find((s) => s.case.key === 'none')!
  const freed = MORTGAGE_PAYMENT + CAR_PAYMENT
  const emergencyTotal = -EMERGENCIES.reduce((s, e) => s + e.amount, 0)
  const tolls = impacts.find((i) => i.move.key === 'tolls_paid')
  const together$ = together.netPosition - base.netPosition
  const maxMove = Math.max(1, together$, ...impacts.map((i) => i.delta))
  const maxStress = Math.max(1, ...stress.map((s) => s.outcome.comingHomeCash))
  const onTrack = base.billsUnpaid === 0

  // ── What the statements showed ──
  const dips = overdraftDips()
  const worst = dips.reduce((w, d) => (d.low < w.low ? d : w), dips[0]!)
  const deployedDips = dips.filter((d) => d.start >= '2026-08-08')
  const wire = impacts.find((i) => i.move.key === 'wire_to_ach')

  // ── Calls to attention, most urgent first ──
  const attention: { level: Level; title: string; body: string; amount?: string; note?: string }[] = [
    {
      level: 'critical',
      title: 'Checking keeps going below zero',
      body:
        `${deployedDips.length} times in three months, as low as ${usd0(worst.low)} on ${nice(worst.lowOn)}. ` +
        `There is no overdraft protection — a paycheck landing the next day is all that has stopped fees ` +
        `and returned payments (Avant bounced twice this summer). It is timing, not money: the $1,000 home ` +
        `and the mortgage check go out 1–4 days before payday. Send them ON payday.`,
      amount: usd0(worst.low),
      note: 'lowest balance',
    },
    {
      level: 'serious',
      title: 'Chase, Citi and Capital One — who is paying them?',
      body:
        'Four months of statements show no payment to any of the three. The plan assumes the $110 Chase ' +
        'agreement and both closed-card minimums go out every month. If they are paid from another ' +
        'account, fine; if not, the Chase agreement may have lapsed.',
    },
    {
      level: 'critical',
      title: 'Start the SDP allotment',
      body:
        `10% guaranteed on up to ${usd0(SDP_CAP)}, only while you are deployed. Deposits stop when you ` +
        `leave theatre, so every month it waits is a month that cannot be made up. myPay or finance.`,
      amount: usd0(base.sdpInterest),
      note: 'interest at plan',
    },
    {
      level: 'warning',
      title: `December to February is thin`,
      body:
        `Tightest payday ${nice(tight?.date ?? null)}: ${usd0(tight?.left ?? 0)} left after bills. ` +
        `An emergency before February leaves ${usd0(early.outcome.billsUnpaid)} of bills unpaid ` +
        `(Nth, then Avant, then Chase give). Playbook below.`,
      amount: usd0(early.outcome.billsUnpaid),
      note: 'at risk',
    },
    {
      level: 'warning',
      title: 'Every Nth transfer costs $30',
      body:
        'It goes out as a wire — $30 in September, October and November. That is $360 a year to invest ' +
        '$6,000. Switch to ACH and it is free.',
      amount: wire ? signed(wire.delta) : '$30/mo',
      note: 'by homecoming',
    },
    {
      level: 'serious',
      title: 'The tolls are probably still owed',
      body:
        'The back pay landed on 28 Aug, but four months of statements show no payment to a toll ' +
        'authority. Check for a registration hold before it becomes a problem you cannot fix from here.',
      amount: tolls ? signed(tolls.delta) : undefined,
      note: 'if already paid',
    },
    {
      level: 'serious',
      title: 'Did the SCRA letters go out?',
      body:
        'The SDP sits ahead of Citi and Capital One because a 6% capped card costs less than 10% earns. ' +
        'Any card still above 10% moves ahead of it.',
    },
    {
      level: 'warning',
      title: 'Subscriptions are creeping',
      body: 'September $117 → October $226 → November $255 by the 10th. Hugedomains alone is $99.79/mo.',
      amount: '$255',
      note: 'Nov, to date',
    },
  ]

  // ── Trend chart data ──
  const trendSeries = [
    {
      key: 'cash',
      label: 'Cash & SDP',
      color: seriesColor(0),
      points: traj.map((p) => ({ date: p.date, value: Math.round(p.cash) })),
    },
    {
      key: 'debt',
      label: 'Debt to pay',
      color: seriesColor(1),
      points: traj.map((p) => ({ date: p.date, value: Math.round(p.debt) })),
    },
  ]
  const trendMarkers = [
    ...EMERGENCIES.map((e) => ({ date: e.date, label: usd0(-e.amount), kind: 'event' as const })),
    ...(base.mortgageCurrent ? [{ date: base.mortgageCurrent, label: 'House current', kind: 'milestone' as const }] : []),
    ...(base.openCardsClear ? [{ date: base.openCardsClear, label: 'Open cards clear', kind: 'milestone' as const }] : []),
  ]

  // ── Monthly composition ──
  const monthCols = months.map((m) => ({
    label: monthName(m.month),
    sublabel: usd0(m.net),
    segments: [
      ...BUCKETS.map((b) => ({
        key: b.key,
        label: b.label,
        value: Math.round(m.byBucket[b.key]),
        color: BUCKET_COLOR[b.key],
      })),
      ...(m.carried > 1
        ? [{ key: 'carried', label: 'Held in checking', value: Math.round(m.carried), color: 'var(--series-rest)', hatched: true }]
        : []),
    ],
  }))

  return (
    <>
      <div className="brief-hero">
        <Pill level={onTrack ? 'good' : 'critical'}>
          {onTrack ? 'On track' : 'Bills at risk'} · as of {nice(PLAN_AS_OF)}
        </Pill>
        <div className="verdict">
          {onTrack ? (
            <>
              Every bill paid, the house <em>current {nice(base.mortgageCurrent)}</em>, and{' '}
              <em>{usd0(startDebt - base.debtLeft)}</em> of debt gone before you come home —{' '}
              <span style={{ whiteSpace: 'nowrap' }}>even after two emergencies.</span>
            </>
          ) : (
            <>{usd0(base.billsUnpaid)} of bills go unpaid as modelled.</>
          )}
        </div>
        <div className="lede">
          {usd0(OBSERVED_NET_MONTHLY)}/mo take-home, Roth TSP at 5%, {usd0(2000)}/mo home. The plan
          assumes {usd0(emergencyTotal)} of emergencies and still pays everything. The deployment is
          the window: it ends {nice(HORIZON.departure)}, and the moves below are worth doing inside it.
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Cash for coming home</div>
          <div className="v">{usd0(base.comingHomeCash)}</div>
          <div className="d">
            SDP payout <b>{usd0(base.sdpPayout)}</b> · buffer <b>{usd0(base.emergencyFund)}</b> · checking{' '}
            <b>{usd0(base.checking)}</b>
          </div>
        </div>
        <div className="kpi">
          <div className="k">Debt you are paying</div>
          <div className="v">{usd0(base.debtLeft)}</div>
          <div className="d">
            from <b>{usd0(startDebt)}</b> today — <b>{signed(base.debtLeft - startDebt)}</b>
          </div>
        </div>
        <div className="kpi">
          <div className="k">Freed up by March</div>
          <div className="v">+{usd0(freed)}/mo</div>
          <div className="d">
            catch-up ends <b>{nice(base.mortgageCurrent)}</b>, car <b>{nice(base.carPaidOff)}</b>
          </div>
        </div>
        <div className="kpi">
          <div className="k">Tightest payday</div>
          <div className="v">{usd0(tight?.left ?? 0)}</div>
          <div className="d">
            left after bills on <b>{nice(tight?.date ?? null)}</b>
          </div>
        </div>
      </div>

      <h2>Needs your attention</h2>
      <div className="attn">
        {attention.map((a) => (
          <div className="attn-row" key={a.title}>
            <Pill level={a.level} />
            <div>
              <div className="t">{a.title}</div>
              <div className="b">{a.body}</div>
            </div>
            {a.amount && (
              <div className="amt">
                {a.amount}
                {a.note && <small>{a.note}</small>}
              </div>
            )}
          </div>
        ))}
      </div>

      <h2>What the statements show</h2>
      <Figure
        title="Checking balance, every day the bank printed one — July to November"
        caption={
          <>
            From the four Wells Fargo statements. The money is enough; the order is not. Each dive below
            zero is a transfer home or a mortgage check leaving a few days before the paycheck that pays for
            it — then the paycheck lands (marked) and the balance snaps back. There is no overdraft
            protection on this account, so the only thing between these dips and returned payments is the
            paycheck arriving on time. Hover or tap for any day.
          </>
        }
      >
        <TrendChart
          stepped
          tipTitle="Balance on"
          height={260}
          ariaLabel="Checking account daily balance from the statements"
          series={[
            {
              key: 'bal',
              label: 'Checking',
              color: seriesColor(0),
              points: CHECKING_DAILY.map((d) => ({ date: d.date, value: Math.round(d.balance) })),
            },
          ]}
          markers={DFAS_PAYCHECKS.map((p) => ({
            date: p.date,
            label: 'pay',
            kind: 'milestone' as const,
          }))}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Below zero from</th>
                <th>to</th>
                <th>Lowest</th>
                <th>on</th>
              </tr>
            </thead>
            <tbody>
              {dips.map((d) => (
                <tr key={d.start}>
                  <td>{d.start}</td>
                  <td>{d.end}</td>
                  <td>{usd0(d.low)}</td>
                  <td>{d.lowOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>The trajectory</h2>
      <Figure
        title="Cash up, debt down — every payday to homecoming"
        caption={
          <>
            Cash is the emergency fund, checking and SDP deposits; debt is everything you are actually
            paying (cards, Avant, Chase, car, arrears, tolls — not Goldman or PSECU, not mortgage
            principal). Dashed red lines are the two assumed emergencies: the fund pays what it holds,
            refills, and the plan carries on. Hover or tap for any payday.
          </>
        }
      >
        <TrendChart series={trendSeries} markers={trendMarkers} ariaLabel="Cash against debt per payday" />
        <Legend items={trendSeries.map((s) => ({ label: s.label, color: s.color }))} />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Payday</th>
                <th>Cash &amp; SDP</th>
                <th>Debt to pay</th>
              </tr>
            </thead>
            <tbody>
              {traj.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{usd0(p.cash)}</td>
                  <td>{usd0(p.debt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <div>
        <Figure
          title="Where each month's pay goes"
          caption={
            <>
              December and January carry two mortgage payments. From February the second one —{' '}
              {usd0(MORTGAGE_PAYMENT)} — moves into debt and savings, and the car&rsquo;s {usd0(CAR_PAYMENT)}{' '}
              follows in March. Hatched is pay held in checking to cover a later payday or an emergency.
              Month totals under each bar are net pay.
            </>
          }
        >
          <StackedBars columns={monthCols} height={270} format={(n) => usd0(n)} minLabel={22} />
          <Legend
            items={[
              ...BUCKETS.map((b) => ({ label: b.label, color: BUCKET_COLOR[b.key] })),
              { label: 'Held in checking', color: 'var(--series-rest)' },
            ]}
          />
          <TableView>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Net</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key}>{b.label}</th>
                  ))}
                  <th>Held</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{usd0(m.net)}</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key}>{usd0(m.byBucket[b.key])}</td>
                    ))}
                    <td>{usd0(m.carried)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </Figure>

      </div>

        <Figure
        title="Milestones and windows"
        caption={
          <>
            Solid bars are balances being paid down or filled; hatched are windows whose end dates are
            estimates. The SDP stops taking deposits when you leave and keeps paying interest for{' '}
            {SDP_ACCRUAL_TAIL_DAYS} days after.
          </>
        }
      >
        <Timeline
          from="2026-11-01"
          to="2027-11-30"
          today={PLAN_AS_OF}
          labelW={170}
          bars={[
            { key: 'catchup', label: 'Mortgage catch-up', start: PLAN_AS_OF, end: base.mortgageCurrent ?? HORIZON.end, color: BUCKET_COLOR.housing },
            { key: 'car', label: 'Car loan', start: PLAN_AS_OF, end: base.carPaidOff ?? HORIZON.end, color: BUCKET_COLOR.debt },
            { key: 'cards', label: 'Open cards', start: PLAN_AS_OF, end: base.openCardsClear ?? HORIZON.end, color: BUCKET_COLOR.debt },
            { key: 'sdp', label: 'SDP deposits', start: PLAN_AS_OF, end: SDP_LAST_DEPOSIT, color: BUCKET_COLOR.save },
            {
              key: 'sdp_tail',
              label: 'SDP interest tail',
              start: SDP_LAST_DEPOSIT,
              end: addLocalDays(SDP_LAST_DEPOSIT, SDP_ACCRUAL_TAIL_DAYS),
              color: BUCKET_COLOR.save,
              estimated: true,
            },
            { key: 'deploy', label: 'Deployment pay', start: '2026-11-01', end: HORIZON.departure, color: 'var(--series-rest)', estimated: true },
          ]}
        />
      </Figure>

      <h2>What each move is worth</h2>
      <Figure
        title="Change in your position at homecoming, if you do it"
        caption={
          <>
            Each bar is the whole plan re-run with that one change — cash you will hold plus investments,
            minus debt left. Debt interest is not modelled (rates are mostly unknown, and SCRA should cap
            them at 6%), so a dollar paid and a dollar saved count the same and only the SDP&rsquo;s 10% is
            counted as a return. Pausing Nth shows only the extra SDP interest — the $500/mo is still yours
            either way; what changes is guaranteed 10% and cash in hand on landing.
          </>
        }
      >
        <div className="hbars">
          {impacts.map((i) => (
            <div className="hbar" key={i.move.key}>
              <div className="name">
                {i.move.label}{' '}
                {i.move.basis === 'estimate' && <span className="tag est">estimate</span>}
                <small>{i.move.action}</small>
              </div>
              <div className="track" title={`${i.move.label}: ${signed(i.delta)} at homecoming`}>
                <div
                  className="fill"
                  style={{ width: `${Math.max(1, (i.delta / maxMove) * 78)}%`, background: seriesColor(0) }}
                />
                <span className="val">
                  {signed(i.delta)}
                  {i.cashDelta !== i.delta && <small> · cash {signed(i.cashDelta)}</small>}
                </span>
              </div>
            </div>
          ))}
          <div className="hbar">
            <div className="name">
              All of them together
              <small>Not the sum — the plan re-run with every change at once.</small>
            </div>
            <div className="track" title={`All moves: ${signed(together$)}`}>
              <div className="fill outline" style={{ width: `${Math.max(1, (together$ / maxMove) * 78)}%` }} />
              <span className="val">
                {signed(together$)} <small>· SDP fills to {usd0(together.sdpDeposited)}</small>
              </span>
            </div>
          </div>
        </div>
      </Figure>

      <h2>Stress test</h2>
      <Figure
        title="Cash for coming home, if things go wrong"
        caption={
          <>
            The plan already assumes two emergencies ({usd0(emergencyTotal)}). A quiet year is worth{' '}
            {signed(calm.outcome.comingHomeCash - base.comingHomeCash)}; a third emergency costs most of the
            SDP but no bills. The one that breaks something is an emergency <em>during the catch-up</em>,
            before the buffer exists — which is why the playbook below exists.
          </>
        }
      >
        <div className="hbars">
          {stress.map((s) => (
            <div className="hbar" key={s.case.key}>
              <div className="name">
                {s.case.label}
                <small>{s.totalHit > 0 ? `${usd0(s.totalHit)} of emergencies` : 'no emergencies'}</small>
              </div>
              <div className="track" title={`${s.case.label}: ${usd0(s.outcome.comingHomeCash)}`}>
                <div
                  className="fill"
                  style={{
                    width: `${Math.max(1, (s.outcome.comingHomeCash / maxStress) * 62)}%`,
                    background: seriesColor(0),
                  }}
                />
                <span className="val">{usd0(s.outcome.comingHomeCash)}</span>
                {s.outcome.billsUnpaid > 0 ? (
                  <Pill level="critical">{usd0(s.outcome.billsUnpaid)} bills unpaid</Pill>
                ) : (
                  <Pill level="good">all bills paid</Pill>
                )}
              </div>
            </div>
          ))}
        </div>
      </Figure>

      <h2>The advice</h2>
      <div className="recs">
        <div className="rec">
          <h3>1. Open the SDP allotment this month</h3>
          <p>
            <strong>10% guaranteed, compounded quarterly, on up to {usd0(SDP_CAP)}.</strong> No high-yield
            account pays half of that. It is paid out within 120 days of leaving theatre — exactly when the
            deployment pay stops — so it is the landing cushion and the 10% at once. The plan sends it
            everything after the tolls, the $1,000 buffer and the open cards: {usd0(base.sdpDeposited)} at
            plan, {usd0(together.sdpDeposited)} if you take every move above. Confirm eligibility with finance
            first; deposits by allotment in myPay or in cash at finance.
          </p>
        </div>
        <div className="rec">
          <h3>2. Fix the order money leaves checking — this costs nothing</h3>
          <p>
            The statements show the account below zero {deployedDips.length} times in three months, as low as{' '}
            {usd0(worst.low)}. Not once because the month was short — every time because something went out
            before the paycheck that pays for it. Three changes: <strong>send the $1,000 home on payday, not
            the days before</strong>; <strong>date the mortgage check to arrive after the 1st or 15th</strong>;
            and <strong>link a Wells Fargo savings account as Overdraft Protection</strong> and park the
            $1,000 buffer there — Wells Fargo does not charge for those transfers, and it turns a returned
            payment into a quiet top-up. One late DFAS deposit is all it takes to bounce the mortgage.
          </p>
        </div>
        <div className="rec">
          <h3>3. Stop paying $30 to invest $500</h3>
          <p>
            Each Nth transfer leaves as an outgoing wire, and Wells Fargo charges $30 for every one —
            $360 a year, a 6% haircut before the money is invested. Ask for ACH details or pull it from the
            Bank of America side. {wire ? <>Worth <strong>{signed(wire.delta)}</strong> by homecoming.</> : null}
          </p>
        </div>
        <div className="rec">
          <h3>4. Converting the traditional TSP balance to Roth</h3>
          <p>
            Your contributions are already Roth — the right call in the zone. What sits in traditional is
            the <strong>agency money</strong>: the 1% automatic and the 4% match always land there, whatever
            you elect. The whole account is about {usd0(RETIREMENT_ACCOUNTS[0]?.amount ?? 0)} in L 2050.
          </p>
          <p>
            Converting is taxed as ordinary income in the year you do it, so <strong>do it in the year your
            taxable income is lowest — 2027</strong>, when almost all your pay is excluded and only your
            wife&rsquo;s income and your few taxable months are on the return. Convert in slices that stay
            inside your current bracket, and pay the tax from cash, never from the TSP. TSP has announced
            in-plan Roth conversions; check tsp.gov for whether it is live, or do it after separation by
            rolling to a Roth IRA.
          </p>
        </div>
        <div className="rec">
          <h3>5. The emergency playbook — in this order</h3>
          <p>
            <strong>1)</strong> the $1,000 cash buffer. <strong>2)</strong> skip one month of Nth ($500).{' '}
            <strong>3)</strong> call the servicer and move that month&rsquo;s catch-up payment back a month
            — never miss the regular one. <strong>4)</strong> SDP emergency withdrawal, with command
            approval. <strong>Never</strong> a new card or a payday loan: one of those undoes a year of this
            plan. Before February, step 2 and 3 are what keep the bills paid.
          </p>
        </div>
        <div className="rec">
          <h3>6. Tax season</h3>
          <p>
            No April rush: CZTE extends your deadline to 180 days after you leave the zone. With your
            wife&rsquo;s income, the EITC is not in play. Combat pay still counts as compensation for an IRA,
            so a Roth IRA is open to you — but behind the SDP, which beats it on a guaranteed basis while
            the window is open.
          </p>
        </div>
        <div className="rec">
          <h3>7. Tell the VA you are on active duty</h3>
          <p>
            The VA paid disability compensation for days in August when you were already on orders. VA
            compensation stops during active duty, so anything paid for those days is an overpayment it
            will claw back — small so far, but it grows every month it keeps paying. Confirm the VA has
            your orders, and expect payments to restart after you are released.
          </p>
        </div>
        <div className="rec">
          <h3>What I would not do</h3>
          <p>
            Prepay the mortgage once it is current — it is the cheapest debt you have. Pay anything to
            Goldman or PSECU — a payment can restart the limitations clock. Raise TSP above 5% before the
            buffer and SDP are full — it locks money away with law school ahead. Leave a sweep in checking —
            if it does not move the day it lands, it gets spent.
          </p>
        </div>
      </div>
    </>
  )
}
