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
import { SENT_HOME } from '@/core/money/household'
import { CHECKING_DAILY, DFAS_PAYCHECKS, availableDaily, overdraftDips, EARLY_PAY_BUSINESS_DAYS } from '@/core/money/statements'
import { TRADELINES, REVIEW_FILE, reviewReadiness, type ReviewStatus } from '@/core/money/credit'

/** How each review status reads — status colour, always with an icon and a label. */
const REVIEW_LEVEL: Record<ReviewStatus, { level: 'critical' | 'warning' | 'serious' | 'good'; label: string }> = {
  federal_delinquent: { level: 'critical', label: 'Federal, past due' },
  collections: { level: 'critical', label: 'In collections' },
  delinquent: { level: 'critical', label: 'Past due' },
  charged_off: { level: 'serious', label: 'Charged off — document' },
  recovering: { level: 'warning', label: 'Recovering' },
  clean: { level: 'good', label: 'Clean' },
}

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
  // The ledger reads negative before paydays only because deposits print on the settle
  // date; DFAS pay is spendable two business days earlier. Judge on what was spendable.
  const available = availableDaily()
  const ledgerDips = overdraftDips().filter((d) => d.start >= '2026-08-08')
  const dips = overdraftDips(available)
  const deployedDips = dips.filter((d) => d.start >= '2026-09-01')
  const lowestAvailable = available
    .filter((d) => d.date >= '2026-09-01')
    .reduce((m, d) => Math.min(m, d.balance), Infinity)
  const readiness = reviewReadiness()
  const wire = impacts.find((i) => i.move.key === 'wire_to_ach')

  // ── Calls to attention, most urgent first ──
  const attention: { level: Level; title: string; body: string; amount?: string; note?: string }[] = [
    {
      level: 'critical',
      title: 'Student loan: ~13 payments behind — call before 10 Dec',
      body:
        '$974.60 past due, $1,050.43 due 10 Dec, last payment Feb 2025. Federal loans default at ' +
        '270 days — tax refunds can be seized and ~20% collection costs added. Deployed, you qualify ' +
        'for military deferment and 0% interest; ask for forbearance on the past due and it is current ' +
        'at $0. If they will not, the plan pays the $974.60 from the 15 Dec cheque — inside 30 days of the 10 Dec due date.',
      amount: '$974.60',
      note: 'past due',
    },
    {
      level: 'critical',
      title: 'UT student loan: $11,082 in collections',
      body:
        'Placed for collection, closed 7 Apr 2026 — not in Monarch, not in the plan until now. The ' +
        'creditor is UT itself, which usually means a Federal Perkins loan: if so, military deferment ' +
        'and Perkins cancellation for service in an imminent-danger area may apply. Call UT to confirm ' +
        'the loan type, then ask for those or a written plan. Federal debt in collection weighs heavily ' +
        'in a security review.',
      amount: '$11,082',
      note: 'in collections',
    },
    {
      level: 'warning',
      title: 'Mortgage extra payment moved to 15 Apr',
      body:
        'NFCU reports one payment behind (30–59 days late, 27 Oct). With the nanny at $2,400/mo and ' +
        'Nth untouchable, the one extra payment lands 15 Apr — the date that keeps every bill paid even ' +
        'if the student-loan deferment is refused (15 Jan if it is approved). The federal loan comes ' +
        'first: default is the heavier review finding, and SCRA and the "active military duty" note ' +
        'protect the mortgage. Cost: a few more 30-day marks. Pay the regular payment on every 1st ' +
        'without fail, and ask NFCU for a letter once current.',
      amount: '15 Apr',
      note: 'current',
    },
    {
      level: 'good',
      title: 'Car paid off from the 15 Nov cheque',
      body:
        'The 15 Nov cheque pays the remaining ~$850 outright — with Nth untouched. ' +
        'Get a payoff quote from Westlake and the lien release in writing; then liability-only insurance.',
      amount: '+$355/mo',
      note: 'freed from Dec',
    },
    {
      level: deployedDips.length === 0 ? 'good' : 'warning',
      title: deployedDips.length === 0 ? 'Checking: never actually below zero since September' : 'Checking dipped below zero',
      body:
        `The statements print ${ledgerDips.length} dips, but DFAS pay is spendable ${EARLY_PAY_BUSINESS_DAYS} business days ` +
        `before it posts, and every one of those dips falls inside that window. On what you could actually spend, ` +
        `the lowest point since September was ${usd0(lowestAvailable)}. The only real risk is a late release — ` +
        `a holiday or a shutdown — on a day you have already sent money against it.`,
      amount: usd0(lowestAvailable),
      note: 'lowest spendable',
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
      // At plan the SDP gets little now (the student loan and the boat come first), and a
      // "$1 interest" headline would undersell a 10% guaranteed rate. Show the rate instead.
      amount: base.sdpInterest >= 50 ? usd0(base.sdpInterest) : '10%',
      note: base.sdpInterest >= 50 ? 'interest at plan' : 'guaranteed',
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
      title: 'Tolls: last ~$400, paid 15 Jan, before the registration renewal',
      body:
        'You think most are paid, with maybe $400 of random pieces left. In Texas unpaid tolls can ' +
        'block a registration renewal, so the plan pays the remainder on 15 Jan. If the renewal is due ' +
        'sooner, look them up and pay them first — it is small enough to fit any payday.',
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
          {usd0(OBSERVED_NET_MONTHLY)}/mo take-home, Roth TSP at 5%, {usd0(SENT_HOME.perPaycheck * 2)}/mo home (nanny + household). The plan
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
          <div className="k">Freed up by May</div>
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

      <h2>Credit recovery — for the security review</h2>
      <div className="note">
        <strong>The goal is a clean review, not a score and not new credit.</strong> Under Guideline F
        (Financial Considerations) an adjudicator asks: is anything delinquent now, is any federal debt
        in default, is every bad account paid, settled or under a written plan you are following, and
        are you getting financial counseling? You already are — Magellan Federal. Today{' '}
        <strong>{readiness.federalDelinquent + readiness.inCollections + readiness.delinquentNow}</strong>{' '}
        account{readiness.federalDelinquent + readiness.inCollections + readiness.delinquentNow === 1 ? ' is' : 's are'}{' '}
        in a state a reviewer flags first, and <strong>{readiness.chargedOffUndocumented}</strong> charge-offs
        need a documented decision. Every one has a dated action below.
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Status</th>
              <th>Balance</th>
              <th style={{ textAlign: 'left' }}>The action — and the paper to keep</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {TRADELINES.map((t) => (
              <tr key={t.key}>
                <td style={{ whiteSpace: 'normal', minWidth: 150 }}>
                  <strong>{t.creditor}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{t.kind}</div>
                </td>
                <td>
                  <Pill level={REVIEW_LEVEL[t.status].level}>{REVIEW_LEVEL[t.status].label}</Pill>
                </td>
                <td>{usd0(t.balance)}</td>
                <td style={{ whiteSpace: 'normal', textAlign: 'left', minWidth: 280, fontSize: 13 }}>
                  {t.action}
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{t.reported}</div>
                </td>
                <td>{nice(t.by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rec" style={{ marginTop: 12 }}>
        <h3>The review file — start it now</h3>
        <ul className="tight">
          {REVIEW_FILE.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p>
          When you complete an SF-86 or sit a subject interview, debts over 120 days late, collections,
          charge-offs and federal debt in default are exactly what you will be asked about. Disclose
          them; the file is what turns a list of problems into evidence that they are being resolved.
          See JAG Legal Assistance before contacting Upgrade or Goldman. Not legal advice.
        </p>
      </div>

      <h2>What the statements show</h2>
      <Figure
        title="Checking: what you could spend vs what the statement prints — July to November"
        caption={
          <>
            From the four Wells Fargo statements. The statement posts each DFAS deposit on its settle date
            (marked), but the money is spendable {EARLY_PAY_BUSINESS_DAYS} business days earlier — so the
            printed balance dives below zero before every payday while the spendable balance does not.
            Since deployment pay began, spendable never went below zero; the only real dips are three small
            ones in July and August. Hover or tap for any day.
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
              key: 'avail',
              label: 'Spendable',
              color: seriesColor(0),
              points: available.map((d) => ({ date: d.date, value: Math.round(d.balance) })),
            },
            {
              key: 'bal',
              label: 'As printed',
              color: seriesColor(1),
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
            {
              key: 'boat',
              label: base.boatDone ? 'Boat ready' : `Boat ($${Math.round(base.boatFunded)} of $2,250)`,
              start: '2027-01-16',
              end: base.boatDone ?? HORIZON.end,
              color: BUCKET_COLOR.you,
              estimated: !base.boatDone,
              note: base.boatDone ? undefined : 'Not fully funded by homecoming at plan; the easy savings finish it.',
            },
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
          <h3>Before anything else: the student loan, this week</h3>
          <p>
            <strong>Call the servicer before 10 December</strong> with your orders and an LES showing
            imminent danger pay, and ask for three things: <strong>military service deferment</strong>
            (payments paused while on active duty), the <strong>0% interest benefit</strong> for Direct
            Loans while you serve in an imminent-danger area, and <strong>administrative forbearance on the
            $974.60 past due</strong> to bring the account current. Confirm in writing that it is current,
            and ask whether it was ever reported as defaulted. If it is a FFEL or private loan rather than a
            Direct Loan, the 0% benefit may not apply — ask. SCRA will not help: the rate is already ~5.1%.
          </p>
          <p>
            If they refuse, the plan pays $75.83 a month from December and clears the past due from
            spare cash by mid-March — but that costs the boat, the open cards and the SDP their place
            before homecoming. Approval is worth{' '}
            {(() => {
              const d = impacts.find((i) => i.move.key === 'sl_deferment')
              return d ? <strong>{signed(d.delta)}</strong> : null
            })()}{' '}
            and gets you current four months sooner.
          </p>
        </div>
        <div className="rec">
          <h3>2. Early pay is working — give it a backstop</h3>
          <p>
            DFAS pay is spendable {EARLY_PAY_BUSINESS_DAYS} business days before it posts, and you time the
            transfers home and the mortgage check to it: on what you could actually spend, checking has not
            gone below zero since deployment pay began. The one exposure is a release that comes late — a
            federal holiday, a pay-system delay, a shutdown — after money has already gone out against it.
            The cheap fix: <strong>link a Wells Fargo savings account as Overdraft Protection</strong> and keep
            the $1,000 buffer there. Wells Fargo does not charge for those transfers, so a late release
            becomes a quiet top-up instead of a returned mortgage payment.
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
            <strong>1)</strong> the $1,000 cash buffer. <strong>2)</strong> hold the month&rsquo;s extras home.{' '}
            <strong>3)</strong> move the mortgage catch-up payment back a month (call NFCU first) — never
            miss the regular one. <strong>4)</strong> SDP emergency withdrawal, with command approval.
            Nth is never the give. <strong>Never</strong> a new card or a payday loan: one of those undoes a
            year of this plan, and new debt is the last thing a security review wants to see.
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
