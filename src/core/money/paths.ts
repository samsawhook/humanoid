/**
 * Two paths after the deployment, month by month for twenty years.
 *
 *  LAW — Texas Tech Law, Lubbock. Home in June 2027; start Aug 2027, graduate May 2030, bar July 2030,
 *        first legal job Sep 2030. The Corpus house is let while you are in Lubbock and
 *        you move back into it after graduating.
 *  MACC — Stay in Corpus. Finish the online MAcc at TAMU-CC (6 of 30 hours done; most
 *        of the rest on deployment, the last block Sep–Dec 2027), sit the CPA in 2028,
 *        start as a staff accountant Jan 2028.
 *
 * Both paths start from the same place: the deployment plan in briefing.ts, through
 * the last active-duty payday (1 Jul 2027 — home in June). Everything after that is assumption, collected in PATH_ASSUMPTIONS so each
 * is a one-line edit, and every assumption that is mine rather than yours says so.
 *
 * SCOPE. As in lawschool.ts, this is YOUR side of the ledger. Your spouse's income is
 * out of scope by design — so the move to Lubbock, which may cost her job, is a cost
 * this model cannot see. Read the law path's result as the best case on that front.
 *
 * Pure data plus pure functions.
 */

import { runPlan, monthlyComposition, trajectory } from './briefing'
import { DEBTS } from './debts'
import { HOUSE, LAW_SCHOOLS, POST_911_TIER, RETIREMENT_ACCOUNTS } from './lawschool'
import { MORTGAGE_PAYMENT } from './obligations'

export type PathKey = 'law' | 'macc'

/** A salary path as dated anchors, interpolated linearly in between. */
type Anchor = [month: string, annual: number]

export const PATH_ASSUMPTIONS = {
  startMonth: '2026-12',
  months: 240,

  /**
   * Your contribution to the family after you are home: childcare and household. Today's
   * $2,400 pays a full-time nanny because you are away; at home, with both of you
   * working, I have taken your share as $1,000. MY ESTIMATE — the biggest lever here.
   */
  familySupportMonthly: 1000,
  /**
   * Your own and home spending at home. The Monarch 12-month average before you shipped
   * was $2,834, on income that did not cover it — which is how the debts happened. The
   * plan budgets $1,800: restaurants, cash and fuel are where the difference comes from.
   */
  personalSpendingMonthly: 1800,
  /** Tricare Select Reserve, family. Your figure. Kept in both paths. */
  tricareMonthly: 260,
  inflation: 0.025,

  /** Reserve drill pay, both paths. My estimate, as in lawschool.ts. */
  drillMonthly: 475,
  /** VA disability at 10%, 2026 rate. Likely higher after this deployment — not modelled. */
  vaMonthly: 180,

  nthMonthly: 530,
  nthPrincipal: 500,
  /** Nominal return on invested money (Nth, TSP, 401k). */
  investReturn: 0.06,
  cashReturn: 0.03,
  /**
   * Interest on a negative cash balance. A gap has to be borrowed: in law school that is
   * federal Direct Unsubsidized loans (Grad PLUS closed to new borrowers in July 2026),
   * at roughly 8%.
   */
  gapRate: 0.08,
  homeAppreciation: 0.03,

  /** Mortgage: balance per the Oct 2026 credit report; rate is MY ESTIMATE. */
  mortgageBalance: 164896,
  mortgageRate: 0.0575,
  mortgageEscrow: 412,
  houseValue: HOUSE.marketValue,

  /** Payable debt after the deployment: paid at this rate until gone. */
  debtPaydownMonthly: 600,
  debtRate: 0.08,
  /** UT loan: balance unconfirmed (SLRP may have paid it). Modelled on a $129/mo plan. */
  utBalance: 11082,
  utMonthly: 129,
  utRate: 0.05,
  /** Upgrade + Goldman charge-offs. Held flat pending JAG — identical in both paths. */
  chargeOffs: 0,

  /** TSP contribution + BRS match while deployed (5% + 5% of base). */
  tspDeployedMonthly: 476,
  /** Civilian 401(k): you put in 5%, the employer matches 4%. MY ESTIMATE. */
  employee401k: 0.05,
  employer401k: 0.04,

  law: {
    school: LAW_SCHOOLS.find((s) => s.key === 'ttu')!,
    schoolStart: '2027-08',
    schoolEnd: '2030-05',
    moveBack: '2030-06',
    jobStart: '2030-09',
    movingCost: 3000,
    barCost: 4000,
    /**
     * Household income your spouse loses by moving to Lubbock, per month in school. Zero in
     * the base case because her income is out of scope — a sensitivity, not a forecast.
     */
    spouseIncomeLostMonthly: 0,
    bookStipendAnnual: 1000,
    summerGross: { '2028': 8000, '2029': 30000 } as Record<string, number>,
    /** Corpus Christi / regional practice. MY ESTIMATE. */
    salary: [
      ['2030-09', 80000],
      ['2032-09', 95000],
      ['2034-09', 115000],
      ['2037-09', 135000],
      ['2041-09', 160000],
      ['2046-12', 190000],
    ] as Anchor[],
  },
  macc: {
    /** Last MAcc block after you are home; online MHA paid for these months. */
    enrolledMonths: ['2027-09', '2027-10', '2027-11', '2027-12'],
    /** Online-only Chapter 33 housing: half the national average, before the 80% tier. MY ESTIMATE. */
    onlineMhaFull: 1170,
    /** Home in June: job search over the summer, start in September. MY ESTIMATE. */
    jobStart: '2027-09',
    /** CPA review course and exam fees, spread over the exam months. */
    cpaCost: 3500,
    cpaMonths: ['2028-01', '2028-02', '2028-03', '2028-04', '2028-05', '2028-06'],
    /**
     * Not entry level: you have a year-plus of audit experience at GAO and in Schwab
     * internal audit (your note, 14 Nov). So the start is an experienced / senior
     * internal-audit role, and — if a CPA supervised that work and will verify it — the
     * Texas one-year experience requirement may already be met, so the licence follows
     * the exam rather than a year after it. Senior auditor → licensed CPA → audit manager.
     * MY ESTIMATE, for Corpus Christi or a remote role at Texas pay.
     */
    salary: [
      ['2027-09', 70000],
      ['2028-09', 78000],
      ['2031-01', 90000],
      ['2033-01', 102000],
      ['2036-01', 115000],
      ['2041-01', 135000],
      ['2046-12', 155000],
    ] as Anchor[],
    /** Licensed once the exam is passed, the experience already being on file. */
    licensed: '2028-09',
  },
}

export interface PathMonth {
  month: string
  phase: string
  income: Record<string, number>
  costs: Record<string, number>
  totalIncome: number
  totalCosts: number
  /** Cash left after costs and saving. Negative = a gap to borrow. */
  net: number
  /** Saved or invested this month — not a cost, so outside `net`. */
  invested: number
  cash: number
  investments: number
  retirement: number
  homeValue: number
  mortgage: number
  debt: number
  netWorth: number
}

export interface PathProjection {
  key: PathKey
  label: string
  months: PathMonth[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function monthIndex(m: string): number {
  const [y, mo] = m.split('-').map(Number)
  return y! * 12 + (mo! - 1)
}

function addMonths(m: string, n: number): string {
  const i = monthIndex(m) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

function between(m: string, from: string, to: string): boolean {
  return monthIndex(m) >= monthIndex(from) && monthIndex(m) <= monthIndex(to)
}

export function salaryAt(anchors: Anchor[], m: string): number {
  if (monthIndex(m) < monthIndex(anchors[0]![0])) return 0
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a, va] = anchors[i]!
    const [b, vb] = anchors[i + 1]!
    if (between(m, a, b)) {
      const t = (monthIndex(m) - monthIndex(a)) / (monthIndex(b) - monthIndex(a))
      return va + (vb - va) * t
    }
  }
  return anchors[anchors.length - 1]![1]
}

/** Federal income tax, married filing jointly on YOUR income alone, 2026 brackets indexed. */
export function federalTax(annualTaxable: number, year: number): number {
  const idx = Math.pow(1.025, Math.max(0, year - 2026))
  const income = Math.max(0, annualTaxable - 32200 * idx)
  const brackets: [number, number][] = [
    [24800, 0.1],
    [100800, 0.12],
    [211400, 0.22],
    [403550, 0.24],
    [Infinity, 0.32],
  ]
  let tax = 0
  let prev = 0
  for (const [top, rate] of brackets) {
    const t = top * idx
    if (income > prev) tax += (Math.min(income, t) - prev) * rate
    prev = t
  }
  return tax
}

const r2 = (n: number) => Math.round(n * 100) / 100

// ── The shared deployment months ────────────────────────────────────────────

interface DeployedMonth {
  month: string
  net: number
  byBucket: Record<string, number>
  carried: number
  cash: number
  debt: number
}

function deployedMonths(): { rows: DeployedMonth[]; comingHomeCash: number; debtLeft: number; finalPay: number } {
  const outcome = runPlan()
  const traj = trajectory(outcome)
  // The last active-duty paycheck lands on the 1st of the first month home. It is that
  // month's income in the path, not a deployed month of its own — August is already
  // Lubbock or the job search, and its costs are the path's.
  let allocations = outcome.allocations
  let finalPay = 0
  const last = allocations.at(-1)!
  if (last.paycheck.scheduledDate.endsWith('-01')) {
    finalPay = last.paycheck.net
    allocations = allocations.slice(0, -1)
  }
  const handoff = traj[allocations.length - 1]!
  const comp = monthlyComposition(allocations)
  const rows = comp
    .filter((r) => monthIndex(r.month) >= monthIndex(PATH_ASSUMPTIONS.startMonth))
    .map((r) => {
      const last = traj.filter((p) => p.date.slice(0, 7) <= r.month).at(-1)
      return { ...r, byBucket: { ...r.byBucket }, cash: last?.cash ?? 0, debt: last?.debt ?? 0 }
    })
  return { rows, comingHomeCash: handoff.cash, debtLeft: handoff.debt, finalPay }
}

// ── The projection ──────────────────────────────────────────────────────────

export function projectPath(key: PathKey, a = PATH_ASSUMPTIONS): PathProjection {
  const deployed = deployedMonths()
  const months: PathMonth[] = []
  /** The first month with no active-duty pay: everything after is path-specific. */
  const homeMonth = addMonths(deployed.rows.at(-1)!.month, 1)

  const chargeOffs =
    a.chargeOffs ||
    DEBTS.filter((d) => d.key === 'goldman' || d.key === 'psecu').reduce((s, d) => s + d.balance, 0)

  let investments = 0
  let retirement = RETIREMENT_ACCOUNTS.reduce((s, r) => s + r.amount, 0)
  let homeValue = a.houseValue
  let mortgage = a.mortgageBalance
  const pAndI = MORTGAGE_PAYMENT - a.mortgageEscrow
  let cash = 0
  let debt = 0
  let ut = a.utBalance

  const law = a.law
  const macc = a.macc
  const tier = POST_911_TIER

  for (let i = 0; i < a.months; i++) {
    const m = addMonths(a.startMonth, i)
    const year = Number(m.slice(0, 4))
    const infl = Math.pow(1 + a.inflation, (monthIndex(m) - monthIndex(homeMonth)) / 12)
    const income: Record<string, number> = {}
    const costs: Record<string, number> = {}
    let invested = 0
    let phase = ''

    // Growth on what is already held.
    investments *= 1 + a.investReturn / 12
    retirement *= 1 + a.investReturn / 12
    homeValue *= 1 + a.homeAppreciation / 12
    const interest = mortgage * (a.mortgageRate / 12)
    mortgage = Math.max(0, mortgage - (pAndI - interest))
    ut = ut * (1 + a.utRate / 12)

    const dep = deployed.rows.find((r) => r.month === m)
    if (dep) {
      // ── Deployed: the plan in briefing.ts, as-is. Identical for both paths.
      phase = 'Deployed'
      income['Military pay (net; tax-free through June)'] = dep.net
      costs['Mortgage'] = dep.byBucket.housing ?? 0
      costs['Sent home — nanny & household'] = dep.byBucket.home ?? 0
      costs['Your spending, phone, subscriptions'] = dep.byBucket.you ?? 0
      costs['Debt payments'] = dep.byBucket.debt ?? 0
      invested = (dep.byBucket.invest ?? 0) + (dep.byBucket.save ?? 0)
      investments += Math.min(dep.byBucket.invest ?? 0, a.nthPrincipal)
      retirement += a.tspDeployedMonthly
      cash = dep.cash
      debt = dep.debt
    } else {
      if (m === homeMonth) {
        cash = deployed.comingHomeCash
        debt = deployed.debtLeft
        if (deployed.finalPay > 0) income['Last active-duty pay (July leave, taxed)'] = deployed.finalPay
      }
      const drill = a.drillMonthly * infl
      income['Reserve drill pay'] = drill
      income['VA disability (10%)'] = a.vaMonthly * infl
      let taxableWages = drill
      let salary = 0
      let summerTax = 0

      if (key === 'law') {
        const inSchool = between(m, law.schoolStart, law.schoolEnd)
        const monthNo = Number(m.slice(5, 7))
        if (inSchool) {
          phase = 'Law school'
          if (monthNo >= 9 || monthNo <= 5) income['GI Bill housing (MHA)'] = law.school.monthlyMha * tier * infl
          if (monthNo === 9) income['GI Bill book stipend'] = law.bookStipendAnnual * tier
          // Summer job paid over Jun–Aug after 1L and 2L.
          const summer = law.summerGross[String(year)]
          if (summer && monthNo >= 6 && monthNo <= 8) {
            income['Summer law job'] = summer / 3
            summerTax = (summer / 3) * 0.22
          }
          costs['Rent in Lubbock'] = law.school.monthlyFamilyRent * infl
          // The Corpus house, let.
          income['Corpus house — rent'] = HOUSE.monthlyMarketRent * infl
          costs['Corpus house — management & vacancy'] =
            HOUSE.monthlyMarketRent * infl * (HOUSE.managementRate + HOUSE.vacancyMaintenanceRate)
          costs['Corpus house — non-homestead tax & landlord insurance'] = HOUSE.monthlyRentalTaxInsuranceUplift
          if (m === law.schoolStart) costs['Moving to Lubbock'] = law.movingCost
          if (law.spouseIncomeLostMonthly > 0)
            costs['Spouse income lost by the move'] = law.spouseIncomeLostMonthly
        } else if (monthIndex(m) < monthIndex(law.jobStart)) {
          phase = 'Bar study'
          if (m === law.moveBack) costs['Moving back to Corpus'] = law.movingCost
          if (m === '2030-06') costs['Bar exam & prep course'] = law.barCost
        } else {
          phase = 'Attorney'
          salary = salaryAt(law.salary, m) / 12
        }
      } else {
        const enrolled = macc.enrolledMonths.includes(m)
        if (enrolled) income['GI Bill housing (online)'] = macc.onlineMhaFull * tier
        if (monthIndex(m) < monthIndex(macc.jobStart)) {
          phase = 'Home — job search'
        } else {
          salary = salaryAt(macc.salary, m) / 12
          phase = enrolled
            ? 'Senior auditor + last MAcc block'
            : monthIndex(m) < monthIndex(macc.licensed)
              ? 'Senior auditor / CPA exam'
              : 'CPA'
        }
        if (macc.cpaMonths.includes(m)) costs['CPA review & exam fees'] = macc.cpaCost / macc.cpaMonths.length
      }

      if (salary > 0) {
        income['Salary'] = salary
        taxableWages += salary
        const k401 = salary * a.employee401k
        retirement += k401 + salary * a.employer401k
        costs['401(k) — your 5%'] = k401
        invested += k401
      }
      // Tax: federal on annualised wages (less the pre-tax 401k), FICA, and the flat
      // withholding on the summer job. No state income tax in Texas.
      const annual = (taxableWages - salary * a.employee401k) * 12
      const tax = federalTax(annual, year) / 12 + taxableWages * 0.0765 + summerTax
      costs['Taxes (federal + FICA)'] = tax

      // Housing in Corpus whenever you live there; the mortgage is paid in both paths.
      costs['Mortgage (P&I + escrow)'] = MORTGAGE_PAYMENT
      costs['Family support (childcare, household)'] = a.familySupportMonthly * infl
      costs['Your spending & home'] = a.personalSpendingMonthly * infl
      costs['Tricare Select Reserve'] = a.tricareMonthly * infl

      // Debts.
      debt = debt * (1 + a.debtRate / 12)
      const debtPay = Math.min(debt, a.debtPaydownMonthly)
      if (debtPay > 0) costs['Debt payments'] = debtPay
      debt -= debtPay
      const utPay = Math.min(ut, a.utMonthly)
      if (utPay > 0) costs['UT loan plan'] = utPay
      ut -= utPay

      // Nth: never skipped.
      costs['Nth Investments'] = a.nthMonthly
      investments += a.nthPrincipal
      invested += a.nthMonthly

      cash *= 1 + (cash >= 0 ? a.cashReturn : a.gapRate) / 12
    }

    const totalIncome = r2(Object.values(income).reduce((s, v) => s + v, 0))
    const totalCosts = r2(Object.values(costs).reduce((s, v) => s + v, 0))
    const net = r2(totalIncome - totalCosts)
    if (!dep) cash += net

    const liabilities = mortgage + debt + ut + chargeOffs
    months.push({
      month: m,
      phase,
      income: Object.fromEntries(Object.entries(income).map(([k, v]) => [k, r2(v)])),
      costs: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, r2(v)])),
      totalIncome,
      totalCosts,
      net: dep ? r2(dep.carried) : net,
      invested: r2(invested),
      cash: r2(cash),
      investments: r2(investments),
      retirement: r2(retirement),
      homeValue: r2(homeValue),
      mortgage: r2(mortgage),
      debt: r2(debt + ut + chargeOffs),
      netWorth: r2(cash + investments + retirement + homeValue - liabilities),
    })
  }

  return {
    key,
    label: key === 'law' ? 'Law school — Texas Tech, Lubbock' : 'MAcc → CPA — stay in Corpus',
    months,
  }
}
