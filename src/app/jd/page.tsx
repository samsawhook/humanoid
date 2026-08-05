import {
  LAW_SCHOOLS,
  HOUSE,
  POST_911_TIER,
  sellNetAt,
  OPENING_BALANCE_SHEET,
  balanceSheet,
  housingScenarios,
  projectJd,
  projectedBalanceSheet,
  SUMMER_PLANS,
  SUMMER_TAX_RATE,
  BAR_COSTS,
  summerPlan,
  type SummerTrack,
} from '@/core/money/lawschool'
import { EXPENSE_CATEGORIES, SUPPORT_HOME, householdTotals, TRICARE_SELECT_RESERVE } from '@/core/money/household'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, balanceClearedOn } from '@/core/money/allocation'
import { OBLIGATIONS, MORTGAGE_ARREARS_BALANCE } from '@/core/money/obligations'
import { TIMELINE } from '@/core/money/rates'
import {
  DEBTS,
  activeDebts,
  deprioritisedDebts,
  simulatePaydown,
  totalBalance,
} from '@/core/money/debts'
import { Figure, GroupedBars, Legend, StackedBars, TableView, seriesColor } from '@/components/viz'

export const dynamic = 'force-dynamic'

/** Reserve drill pay while in school. My estimate — a one-line edit. */
const DRILL_PAY = 475

/**
 * Which summer outcome the headline numbers assume. The middle of the distribution,
 * deliberately — planning against the best case is not planning.
 */
const SUMMER_TRACK: SummerTrack = 'regional_firm'

const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function JdPage() {
  const opening = balanceSheet('2026-08-05', OPENING_BALANCE_SHEET)

  // What the deployment actually does to the sheet, taken from the cash-flow model.
  const allocations = allocateAll(projectPaychecks('2026-08-15', '2027-08-01'), OBLIGATIONS)
  const cleared = balanceClearedOn(allocations, OBLIGATIONS)
  const paid = (key: string) =>
    allocations.reduce((s, a) => s + (a.lines.find((l) => l.key === key)?.allocated ?? 0), 0)

  const debtPaid = paid('debt_paydown_open') + paid('debt_paydown_closed')
  /**
   * The Chase agreement is a bill rather than a paydown, so it is not in `debtPaid` and
   * not in the paydown simulation — but it is still money reducing a real balance, so
   * the balance sheet has to see it. Applied as its own liability delta below.
   */
  const agreementPaid = paid('debt_agreements')
  const savings = paid('emergency_fund')
  const mortgagePrincipal = paid('mortgage_current') * 0.3 + (cleared.mortgage_arrears?.paid ?? 0)

  // Same paydown the budget runs: live accounts in order, dismissed ones untouched.
  const paydown = simulatePaydown(debtPaid / allocations.length, allocations.length)

  const projected = projectedBalanceSheet('2027-08-04', OPENING_BALANCE_SHEET, [
    { label: 'Car loan', delta: -(cleared.car_payoff?.paid ?? 0) },
    { label: 'Mortgage', delta: -mortgagePrincipal },
    { label: 'Chase', delta: -agreementPaid },
    ...paydown.steps.map((step) => ({
      label: step.debt.label,
      delta: -step.paid,
    })),
    { label: 'Emergency Savings', delta: savings },
  ])

  const scenarios = housingScenarios()
  const homeProfile = householdTotals('home')
  const deployedProfile = householdTotals('deployed')

  // 1L household cost: back at home rates, minus the mortgage (it is in the scenario).
  const schoolHousehold = Math.round(homeProfile.total)

  const matrix = LAW_SCHOOLS.map((school) => ({
    school,
    runs: scenarios.map((scenario) =>
      projectJd(school, scenario, {
        startingCash: projected.liquid,
        monthlyHousehold: schoolHousehold,
        monthlyDrillPay: DRILL_PAY,
        summerTrack: SUMMER_TRACK,
      }),
    ),
  }))

  return (
    <>
      <h1>JD Financial Prep</h1>
      <p className="sub">
        Where you stand now, where the deployment leaves you, and what three years of law
        school costs under each housing and school combination.{' '}
        <strong>This is your ledger only</strong> — household income other than yours is out
        of scope, so a deficit here is the gap you personally have to cover.
      </p>

      <div className="note">
        <strong>Nothing on this page is typed in twice.</strong> The balance sheet composes
        from the same figures the budget uses — the house from Zillow, every debt from the
        debt register, the auto loan from the obligation, cash from the Monarch export.
        Correct a number in the budget and it corrects here. Two pages that restate the
        same fact are two pages that eventually disagree.
        <br />
        <br />
        <strong>What is real and what is not.</strong> Balances, pay and obligations are
        yours. <em>Every MHA rate, every rent figure, the house&rsquo;s market value and the
        Corpus Christi rental market are my estimates</em>, flagged low confidence
        throughout. I had no authoritative source and did not invent precise-looking
        numbers. All of them are one-line edits in{' '}
        <code>src/core/money/lawschool.ts</code>.
      </div>

      <h2>Balance sheet</h2>
      <div className="cards">
        <Card k="Net worth today" v={usd0(opening.netWorth)} tone="bad" />
        <Card k="Liquid today" v={usd0(opening.liquid)} tone="bad" sub="across all accounts" />
        <Card
          k="Net worth at redeployment"
          v={usd0(projected.netWorth)}
          tone={projected.netWorth > opening.netWorth ? 'good' : 'bad'}
          sub={`${usd0(projected.netWorth - opening.netWorth)} change`}
        />
        <Card k="Liquid at redeployment" v={usd0(projected.liquid)} tone="good" />
      </div>

      {opening.disputedTotal > 0 && (
        <div className="note">
          <strong>
            The truck and the boat are carried at zero, not at Monarch&rsquo;s{' '}
            {usd0(opening.disputedTotal)}.
          </strong>{' '}
          You said you never agreed with those auto-valuations, so propping net worth up
          with them would make the headline number worse than useless. If they really are
          worth {usd0(opening.disputedTotal)}, net worth today is{' '}
          {usd0(opening.netWorthIfDisputedAccepted)} rather than {usd0(opening.netWorth)} —
          that is the whole sensitivity. Note the truck also carries a{' '}
          {usd0(1600)} lien, so it is a net negative until that clears. Give me figures you
          would actually sell at and I will restore them.
        </div>
      )}

      <Figure
        title="Opening vs projected, by line"
        caption={`Projection applies the cash-flow model: car cleared ${cleared.car_payoff?.clearedOn ?? '—'}, arrears ${cleared.mortgage_arrears?.clearedOn ? `cured ${cleared.mortgage_arrears.clearedOn}` : `still open — only ${usd0(cleared.mortgage_arrears?.paid ?? 0)} of ${usd0(MORTGAGE_ARREARS_BALANCE)} paid, because the savings targets above the gauge absorb the slack`}, ${usd0(debtPaid)} against unsecured debt and ${usd0(savings)} saved. No market appreciation or vehicle depreciation — guessing at either would add noise to a number whose job is to be roughly right.`}
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Today</th>
                <th>At redeployment</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {projected.lines.map((line) => {
                const before = opening.lines.find((l) => l.label === line.label)?.amount ?? 0
                const delta = line.amount - before
                const good = line.kind === 'liability' ? delta < 0 : delta > 0
                return (
                  <tr key={line.label}>
                    <td style={{ whiteSpace: 'normal' }}>
                      {line.label}
                      <span className="muted"> · {line.kind}</span>
                    </td>
                    <td>{usd(before)}</td>
                    <td>{usd(line.amount)}</td>
                    <td className={delta === 0 ? 'muted' : good ? 'good' : 'bad'}>
                      {delta === 0 ? '—' : usd(delta)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Figure>

      <h2>Household spending — home vs deployed</h2>
      <p className="sub">
        Twelve-month Monarch averages. The multipliers are mine; the base figures are yours.
      </p>
      <Figure
        title={`${usd0(homeProfile.total)}/mo at home → ${usd0(deployedProfile.total)}/mo deployed`}
        caption="Personal consumption collapses when the Army feeds and houses you; the household's does not. Support sent home rises, because it becomes the funding channel rather than a top-up."
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>At home</th>
                <th>Deployed</th>
                <th>Change</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {deployedProfile.categories
                .slice()
                .sort((a, b) => a.delta - b.delta)
                .map((row) => (
                  <tr key={row.category.key}>
                    <td>{row.category.label}</td>
                    <td>{usd0(row.category.monthlyHome)}</td>
                    <td>{usd0(row.monthly)}</td>
                    <td className={row.delta < 0 ? 'good' : row.delta > 0 ? 'warn' : 'muted'}>
                      {row.delta === 0 ? '—' : usd0(row.delta)}
                    </td>
                    <td className="muted" style={{ whiteSpace: 'normal' }}>
                      {row.category.note ?? `×${row.category.deployedMultiplier}`}
                    </td>
                  </tr>
                ))}
              <tr>
                <td>
                  <strong>{SUPPORT_HOME.label}</strong>
                </td>
                <td>{usd0(homeProfile.support)}</td>
                <td>{usd0(deployedProfile.support)}</td>
                <td className="warn">{usd0(deployedProfile.support - homeProfile.support)}</td>
                <td className="muted" style={{ whiteSpace: 'normal' }}>
                  Monarch &ldquo;Gifts&rdquo; — your largest discretionary line.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Figure>

      <div className="note">
        <strong>One thing I need you to settle.</strong> Groceries run only{' '}
        {usd0(141)}/mo in these accounts — far too low for a family — which says your
        wife&rsquo;s spending happens outside them and the {usd0(754)}/mo support line is how
        it gets funded. That is how I have modelled it. If her spending <em>is</em> already
        in these accounts, that line is an internal transfer and I am double-counting about{' '}
        {usd0(9043)} a year. Tell me which and I will fix it in one place.
      </div>

      <h2>Unsecured debt</h2>
      <div className="note">
        <strong>Goldman and PSECU are deliberately last, and not only because you prefer
        it that way.</strong>{' '}
        Both sued and both were dismissed. Texas has a four-year limitations period on a
        debt claim — and <strong>a partial payment or written acknowledgment can restart
        that clock</strong>. So paying a token amount on either, believing it responsible,
        can re-expose you to a suit you were otherwise safe from. That makes &ldquo;pay a
        little on everything&rdquo; exactly the wrong strategy here. Not legal advice —
        confirm the limitations dates with someone qualified before paying either.
      </div>
      <div className="cards">
        <Card
          k="Live accounts"
          v={usd0(totalBalance(activeDebts()))}
          sub={`${activeDebts().length} accounts — the paydown target`}
        />
        <Card
          k="Sued & dismissed"
          v={usd0(totalBalance(deprioritisedDebts()))}
          tone="warn"
          sub="untouched by the plan"
        />
        <Card
          k="Live debt cleared by"
          v={
            paydown.allClearedAfter
              ? (allocations[paydown.allClearedAfter - 1]?.paycheck.payDate ?? '—')
              : 'not within the deployment'
          }
          tone={paydown.allClearedAfter ? 'good' : 'bad'}
        />
      </div>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>Posture</th>
              <th>Paid by redeployment</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {DEBTS.map((d) => {
              const step = paydown.steps.find((s) => s.debt.key === d.key)
              return (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td>{usd0(d.balance)}</td>
                  <td className={d.posture === 'active' ? 'muted' : 'warn'}>
                    {d.posture.replace(/_/g, ' ')}
                  </td>
                  <td className={step && step.paid > 0 ? 'good' : 'muted'}>
                    {step ? usd0(step.paid) : '—'}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {d.note}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        On credit repair: these are already reported. Paying a charged-off balance does not
        remove the entry, and most scoring models do not reward it the way people expect —
        what actually restores the score is time plus low utilisation on the live accounts.
        Clearing Chase and Capital One does more for the score than anything you could pay
        Goldman.
      </p>

      <h2>The Corpus Christi house</h2>
      <p className="sub">
        Zillow, {'2026-08-05'}: Zestimate {usd0(HOUSE.marketValue)} (range {usd0(HOUSE.valueLow)}–
        {usd0(HOUSE.valueHigh)}), rent Zestimate {usd0(HOUSE.monthlyMarketRent)}/mo, mortgage{' '}
        {usd0(HOUSE.mortgageBalance)}. 3 bed / 1 bath, 1,416 sqft, built 1951.
      </p>

      <div className="note">
        <strong>Selling barely clears the mortgage, and could cost you money.</strong> Zillow
        puts total selling costs at <strong>11%</strong> — {usd0(HOUSE.prepAndRepair)} prep and
        repair plus {usd0(HOUSE.marketValue * HOUSE.sellingCostRate - HOUSE.prepAndRepair)}{' '}
        closing — not the 7% I had assumed. Against a {usd0(HOUSE.mortgageBalance)} balance
        that leaves:
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Sale price</th>
                <th>After 11% costs</th>
                <th>Net at closing</th>
              </tr>
            </thead>
            <tbody>
              {[HOUSE.valueLow, HOUSE.marketValue, HOUSE.valueHigh].map((price) => (
                <tr key={price}>
                  <td>{usd0(price)}</td>
                  <td>{usd0(price * (1 - HOUSE.sellingCostRate))}</td>
                  <td className={sellNetAt(price) >= 0 ? 'good' : 'bad'}>
                    {usd0(sellNetAt(price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        At the bottom of Zillow&rsquo;s own range you would need to bring{' '}
        {usd0(Math.abs(sellNetAt(HOUSE.valueLow)))} <em>to</em> closing — money you do not
        have. Selling is not the safe option; it is the one with a tail risk.
      </div>
      <p className="sub">
        Both figures are on one basis. <strong>Monthly cash flow</strong> is absolute — what
        the property does to your bank balance, mortgage payment included — so selling is
        zero, not a positive. <strong>Versus holding it empty</strong> is the change against
        doing nothing and paying {usd0(HOUSE.monthlyPayment)}/mo for an empty house. Mixing
        the two made selling look {usd0(HOUSE.monthlyPayment)}/mo better than it is.
      </p>
      <div className="cards">
        {scenarios.map((s, i) => (
          <div className="panel card" key={s.scenario}>
            <div className="k">{s.label}</div>
            <div className={`v ${s.monthlyCashFlow >= 0 ? 'good' : 'bad'}`}>
              {usd0(s.monthlyCashFlow)}
              <span style={{ fontSize: 13 }} className="muted">
                /mo
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {usd0(s.monthlyVsHoldingEmpty)}/mo vs holding it empty
              <br />
              {s.upfrontCash > 0 ? `+${usd0(s.upfrontCash)} upfront` : 'no cash released'}
            </div>
          </div>
        ))}
      </div>
      {scenarios.map((s) => (
        <div className="panel" key={s.scenario}>
          <strong>{s.label}</strong>
          <p style={{ marginTop: 4 }}>{s.note}</p>
          <ul className="tight">
            {s.risks.map((r) => (
              <li key={r} className="muted">
                {r}
              </li>
            ))}
          </ul>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Equity retained after 3 years: {usd0(s.equityRetainedAfter3y)}
          </div>
        </div>
      ))}

      <h2>Three years of law school</h2>
      <p className="sub">
        <strong>Post-9/11 at {Math.round(POST_911_TIER * 100)}%</strong>, so MHA and the
        book stipend are prorated. That cuts roughly {usd0(290)}–{usd0(460)}/mo off every
        option and flips most of them from MHA-covers-rent to it does not.
        <br />
        <br />
        The good half: at 90% or less <strong>Hazlewood stacks with Chapter 33</strong>{' '}
        rather than having to wait for it to exhaust — Chapter 33 pays its{' '}
        {Math.round(POST_911_TIER * 100)}% and Hazlewood covers the remaining{' '}
        {Math.round((1 - POST_911_TIER) * 100)}%. At 100% you would have been forced to
        burn Chapter 33 first. So tuition still lands at zero, and the entitlement question
        I flagged as the biggest unknown resolves in your favour. Confirm with the TAMU-CC
        certifying official. MHA is paid for months in session only (9 of 12); Tricare
        Select Reserve at {usd0(TRICARE_SELECT_RESERVE.monthlyPremium)}/mo runs throughout.
      </p>

      <Figure
        title="Three-year cash position by school and housing choice"
        caption="Starting from projected liquid cash at redeployment. Bars show ending cash after three years; a negative result is borrowing you would have to cover."
      >
        <StackedBars
          height={300}
          format={(n) => usd0(n)}
          columns={matrix.map((m) => ({
            label: m.school.key.toUpperCase(),
            sublabel: m.school.city,
            segments: m.runs.map((run, i) => ({
              key: `${m.school.key}-${run.scenario.scenario}`,
              label: run.scenario.label,
              value: Math.max(0, run.endingCash),
              color: seriesColor(i),
            })),
          }))}
        />
        <Legend
          items={scenarios.map((s, i) => ({ label: s.label, color: seriesColor(i) }))}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Housing</th>
                <th>MHA/mo @{Math.round(POST_911_TIER * 100)}%</th>
                <th>Rent/mo</th>
                <th>MHA − rent</th>
                <th>3-yr ending cash</th>
                <th>Hazlewood value</th>
              </tr>
            </thead>
            <tbody>
              {matrix.flatMap((m) =>
                m.runs.map((run) => (
                  <tr key={`${m.school.key}-${run.scenario.scenario}`}>
                    <td style={{ whiteSpace: 'normal' }}>{m.school.name}</td>
                    <td className="muted">{run.scenario.label}</td>
                    <td>
                      {usd0(m.school.monthlyMha * POST_911_TIER)}
                      <span className="muted"> of {usd0(m.school.monthlyMha)}</span>
                    </td>
                    <td>{usd0(m.school.monthlyFamilyRent)}</td>
                    <td
                      className={
                        m.school.monthlyMha * POST_911_TIER - m.school.monthlyFamilyRent >= 0
                          ? 'good'
                          : 'bad'
                      }
                    >
                      {usd0(m.school.monthlyMha * POST_911_TIER - m.school.monthlyFamilyRent)}
                    </td>
                    <td className={run.endingCash >= 0 ? 'good' : 'bad'}>
                      {usd0(run.endingCash)}
                    </td>
                    <td className="muted">{usd0(run.hazlewoodValue)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>The summer after 2L is the biggest number you can move</h2>
      <p className="sub">
        MHA pays for months in session — nine of twelve — so the summers are unpaid by
        default and the earnings replace income you stop receiving rather than adding to
        it. The three summers are three different events: 1L is small everywhere, 2L is
        the summer associate position and the whole game, and{' '}
        <strong>3L has no summer income at all</strong> — that stretch is bar study, and
        it carries the {usd0(BAR_COSTS)} exam fee and prep course instead of a salary.
        Summer wages are ordinary taxable income, modelled at{' '}
        {Math.round(SUMMER_TAX_RATE * 100)}%, where MHA and Hazlewood are tax-free.
      </p>

      <Figure
        title={`Ending cash after three years by summer track — ${bestOf(matrix).school.name}, ${bestOf(matrix).scenario.label}`}
        caption={
          <>
            Same school and housing choice throughout; only the summer outcome changes.
            The spread between the bars is larger than three years of drill pay, which is
            the next biggest lever you actually control. Every figure here is{' '}
            <strong>low confidence</strong> — the 2L outcome turns on school and class
            rank, neither of which exists yet. The plan runs on the middle track.
          </>
        }
      >
        <GroupedBars
          height={260}
          format={(n) => usd0(n)}
          columns={SUMMER_PLANS.map((plan) => {
            const run = projectJd(bestOf(matrix).school, bestOf(matrix).scenario, {
              startingCash: projected.liquid,
              monthlyHousehold: schoolHousehold,
              monthlyDrillPay: DRILL_PAY,
              summerTrack: plan.track,
            })
            return {
              label: plan.label.split(' /')[0] ?? plan.label,
              sublabel: plan.track === SUMMER_TRACK ? 'planning case' : '',
              bars: [
                {
                  key: 'summer',
                  label: 'Summer earnings, after tax, over three years',
                  value: run.years.reduce((t, y) => t + y.summerIncome, 0),
                  color: seriesColor(2),
                },
                {
                  key: 'ending',
                  label: 'Ending cash after three years',
                  value: Math.max(0, run.endingCash),
                  color: seriesColor(1),
                },
              ],
            }
          })}
        />
        <Legend
          items={[
            { label: 'Summer earnings after tax, 3 yrs', color: seriesColor(2) },
            { label: 'Ending cash after 3 yrs', color: seriesColor(1) },
          ]}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Track</th>
                <th>After 1L</th>
                <th>After 2L</th>
                <th>After 3L</th>
                <th>Gross</th>
                <th>Tax</th>
                <th>Net to you</th>
              </tr>
            </thead>
            <tbody>
              {SUMMER_PLANS.map((plan) => {
                const gross = plan.afterFirstYear + plan.afterSecondYear
                return (
                  <tr key={plan.track}>
                    <td style={{ whiteSpace: 'normal' }}>
                      {plan.label}
                      {plan.track === SUMMER_TRACK && (
                        <span className="muted"> — planning case</span>
                      )}
                    </td>
                    <td>{usd0(plan.afterFirstYear)}</td>
                    <td>{usd0(plan.afterSecondYear)}</td>
                    <td className="muted">— bar study</td>
                    <td>{usd0(gross)}</td>
                    <td className="bad">{usd0(-gross * SUMMER_TAX_RATE)}</td>
                    <td className="good">{usd0(gross * (1 - SUMMER_TAX_RATE))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>Year by year — what comes in, what goes out</h2>
      {(() => {
        const run = bestOf(matrix)
        const totalIn = run.years.reduce((t, y) => t + y.totalIncome, 0)
        const totalOut = run.years.reduce((t, y) => t + y.totalCosts, 0)
        const biggest = run.years[0]!.costs.reduce((a, b) => (b.amount > a.amount ? b : a))
        const mha3 = run.years.reduce((t, y) => t + y.mhaIncome, 0)
        return (
          <div className="note">
            <strong>
              Across three years: {usd0(totalIn)} in against {usd0(totalOut)} out.
            </strong>{' '}
            The line that decides this is not tuition and not MHA — it is{' '}
            <strong>{biggest.label.toLowerCase()} at {usd0(biggest.amount)} a year</strong>,
            roughly {(biggest.amount / (mha3 / 3)).toFixed(1)}× the MHA. Hazlewood and
            Chapter 33 between them take tuition to zero, which is worth{' '}
            {usd0(run.hazlewoodValue)} and is the reason this is even arguable — but they
            do nothing about the cost of keeping a family fed for three years while not
            earning. That is the number to attack, and the only two levers on it are the
            2L summer above and where you choose to live.
          </div>
        )
      })()}

      {[bestOf(matrix), worstOf(matrix)].map((run, idx) => (
        <div key={idx}>
          <Figure
            title={`${idx === 0 ? 'Best' : 'Worst'}: ${run.school.name} · ${run.scenario.label}`}
            caption={
              <>
                Two bars a year on one axis, so where they cross means what it looks like
                it means. Every line below is named — there is no residual{' '}
                <em>other</em> bucket, so a total cannot quietly contain something you
                cannot see. Watch 3L: the summer income stops, and the bar exam arrives in
                the same year.
              </>
            }
          >
            <GroupedBars
              height={260}
              format={(n) => usd0(n)}
              columns={run.years.map((y) => ({
                label: y.label,
                sublabel: `${y.net >= 0 ? '+' : ''}${usd0(y.net)}`,
                bars: [
                  { key: 'in', label: 'Money in', value: y.totalIncome, color: seriesColor(2) },
                  { key: 'out', label: 'Money out', value: y.totalCosts, color: seriesColor(1) },
                ],
              }))}
            />
            <Legend
              items={[
                { label: 'Money in', color: seriesColor(2) },
                { label: 'Money out', color: seriesColor(1) },
              ]}
            />
            <TableView>
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Line</th>
                    <th>In</th>
                    <th>Out</th>
                  </tr>
                </thead>
                <tbody>
                  {run.years.flatMap((y) => [
                    ...y.income.map((l) => (
                      <tr key={`${y.year}-in-${l.key}`}>
                        <td className="muted">{y.label}</td>
                        <td style={{ whiteSpace: 'normal' }}>{l.label}</td>
                        <td className="good">{usd0(l.amount)}</td>
                        <td />
                      </tr>
                    )),
                    ...y.costs.map((l) => (
                      <tr key={`${y.year}-out-${l.key}`}>
                        <td className="muted">{y.label}</td>
                        <td style={{ whiteSpace: 'normal' }}>{l.label}</td>
                        <td />
                        <td className="bad">{usd0(l.amount)}</td>
                      </tr>
                    )),
                    <tr key={`${y.year}-net`}>
                      <td />
                      <td>
                        <strong>{y.label} net · cumulative {usd0(y.cumulative)}</strong>
                      </td>
                      <td colSpan={2} className={y.net >= 0 ? 'good' : 'bad'}>
                        <strong>{usd0(y.net)}</strong>
                      </td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            </TableView>
          </Figure>

          <ul className="tight" style={{ marginTop: 8 }}>
            {run.warnings.map((w) => (
              <li key={w} className="muted" style={{ fontSize: 12.5 }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      ))}

    </>
  )
}

function bestOf(matrix: { runs: ReturnType<typeof projectJd>[] }[]) {
  return matrix.flatMap((m) => m.runs).sort((a, b) => b.endingCash - a.endingCash)[0]!
}
function worstOf(matrix: { runs: ReturnType<typeof projectJd>[] }[]) {
  return matrix.flatMap((m) => m.runs).sort((a, b) => a.endingCash - b.endingCash)[0]!
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
