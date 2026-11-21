/**
 * Two paths after the deployment, month by month for twenty years.
 *
 *  LAW — Texas Tech Law, Lubbock. Home in June 2027; start Aug 2027, graduate May 2030, bar July 2030,
 *        then tax or transactional work in Austin from Sep 2030 (your plan, 14 Nov). The
 *        Corpus house is let from the move to Lubbock onward.
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

export type PathKey = 'law' | 'macc' | 'night'

/** A salary path as dated anchors, interpolated linearly in between. */
type Anchor = [month: string, annual: number]

export const PATH_ASSUMPTIONS = {
  /** A scenario's own name (scenarios.ts); otherwise the path's. */
  label: undefined as string | undefined,
  startMonth: '2026-12',
  months: 240,

  /**
   * Your contribution to the household after you are home, NOT counting the children —
   * they are costed one by one in `family` below, so the budget grows as the family does.
   * Today's $2,400 pays a full-time nanny because you are away. MY ESTIMATE.
   */
  /** From your back-home budget (19 Nov): her spending & extras $300; groceries $0 on your side. */
  familySupportMonthly: 300,
  /**
   * The family. Child 1 about a year old on 14 Nov 2026 (your figure), so born ~Nov 2025. Your plan: pregnant
   * a few months after you are home (so child 2 ~Jun 2028) and the same spacing again
   * (child 3 ~Aug 2030). Same dates in both paths.
   *
   * Per child, 2027 dollars, MY ESTIMATES: under five, childcare at the local rate plus
   * $250/mo of everything else (food, diapers, clothes, gear); five to seventeen, $500/mo
   * (food, clothes, activities, after-school and summer care); $1,500 around each birth
   * (Tricare covers the delivery). College is not costed: the Hazlewood Legacy Act lets
   * you pass unused Hazlewood hours to a child.
   */
  family: {
    births: ['2025-11', '2028-06', '2030-08'],
    childcare: { corpus: 900, lubbock: 850, austin: 1400, houston: 1200, dallas: 1250, 'fort worth': 1150, country: 700 } as Record<string, number>,
    under5Other: 250,
    schoolAge: 500,
    birthCost: 1500,
  },
  /**
   * Lifestyle scales with income: for each dollar of salary above $85k (2027 dollars), a
   * dime more goes on spending. A plan that held spending flat while pay tripled would
   * be flattering the higher-paid path. MY ESTIMATE.
   */
  lifestyleShare: 0.1,
  lifestyleFloor: 85000,
  /**
   * The house upgrade, "when cash allows" (your call, 14 Nov): once payable debt is gone
   * and cash covers closing, the move and a reserve, buy a bigger family home — Corpus on
   * the CPA path, Austin on the law path — with a VA loan (no down payment; no funding fee
   * with a disability rating). 628 Chamberlain is kept and let. Prices in 2027 dollars,
   * rising with house prices. MY ESTIMATES. 628 Chamberlain is not on a VA loan (your
   * note, 14 Nov), so your full VA entitlement is available for the upgrade — no
   * entitlement limit and no down payment. The new home must be your primary residence.
   */
  upgrade: {
    price: { corpus: 375000, austin: 550000, houston: 450000, dallas: 475000, 'fort worth': 425000 } as Record<string, number>,
    rate: 0.0625,
    taxRate: { corpus: 0.021, austin: 0.019, houston: 0.022, dallas: 0.022, 'fort worth': 0.023 } as Record<string, number>,
    insuranceMonthly: 250,
    closingRate: 0.03,
    moveAndFurnish: 8000,
    reserve: 15000,
  },
  /**
   * Your own and home spending at home. The Monarch 12-month average before you shipped
   * was $2,834, on income that did not cover it — which is how the debts happened. The
   * plan budgets $1,800: restaurants, cash and fuel are where the difference comes from.
   */
  /**
   * From your back-home budget (19 Nov): your spending $600, gifts $75, phone $150,
   * subscriptions $257.81, car (GEICO, fuel, upkeep) $474.50, HVAC and upkeep $169.95;
   * utilities $0 on your side.
   */
  personalSpendingMonthly: 1727,
  /** Tricare Select Reserve, family. Your figure. Kept in both paths. */
  tricareMonthly: 260,
  inflation: 0.025,

  /** Reserve drill pay, both paths. My estimate, as in lawschool.ts. */
  /** Drill weekends only — 4 periods a month at 1/30 of E-6 base; annual training not counted (your call, 19 Nov). */
  drillMonthly: 634.6,
  /**
   * VA disability after this deployment. You are at 10% now; your range for the new
   * rating is 30–80% (14 Nov). The planning case is 30% (your call, 19 Nov), the bottom of
   * the range. Monthly amounts are for a veteran with a spouse and one child, roughly 2028
   * rates, plus ~5% for each further child — MY ESTIMATE of the tables; check them against
   * the VA's.
   * The claim takes a few months: until it is decided you are paid at your current 10%,
   * and the decision brings the difference back to the month after release as a lump.
   */
  vaRating: 30,
  vaMonthly: 645,
  /** Your current rating's pay (10%: no extra for dependents), drawn until the new one lands. */
  vaCurrentMonthly: 186,
  /** Months home before the new rating is decided and paid. */
  vaDecisionMonths: 4,
  vaPerChildShare: 0.05,
  /**
   * VA pay cannot be drawn for days you are paid for drill or annual training, so it is
   * waived for those days: ~48 drill periods (24 days) plus 15 days of AT a year.
   */
  vaWaivedDaysPerYear: 39,

  /** $500 by ACH from 1 Dec — the $30 wire fee is gone (your OK, 18 Nov). */
  nthMonthly: 500,
  nthPrincipal: 500,
  /** Nominal return on invested money (Nth, TSP, 401k). */
  investReturn: 0.06,
  /**
   * Nth is your business: owner capital plus paying its creditors while it does not
   * perform (19 Nov). Carried at cost — no return assumed until it pays you.
   */
  nthReturn: 0,
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
  /** UT loan, now with the Dept of Education: $9,907 per UT (18 Nov). Modelled on a $129/mo plan. */
  utBalance: 9907,
  utMonthly: 129,
  utRate: 0.05,
  /** Upgrade + Goldman charge-offs. Held flat pending JAG — identical in both paths. */
  chargeOffs: 0,

  /** TSP contribution + BRS match while deployed (5% + 5% of base). */
  tspDeployedMonthly: 476,
  /** Civilian 401(k): you put in 5%, the employer matches 4%. MY ESTIMATE. */
  employee401k: 0.05,
  employer401k: 0.04,

  // ── Planner levers. Every one applies from the month you are home. ──────────
  /**
   * Sell 628 Chamberlain in this month; null keeps it. (The law path's `house: 'sell'`
   * means its move to Lubbock.) Sold while you still live in it, you rent in Corpus.
   */
  houseSaleMonth: null as string | null,
  /** Family rent in Corpus if the house is sold while you still live there. MY ESTIMATE. */
  corpusRent: 1800,
  /**
   * Re-enlistment bonus for any path; null keeps the path's own (law and night law: $10k,
   * Sep 2027; the CPA routes: none). Taxed at 22%.
   */
  reenlist: null as null | { bonus: number; month: string },
  /**
   * The 2013 Expedition: replaced in `replaceMonth` (null: it lasts the whole plan) at
   * `price` in 2027 dollars, `downShare` down and the rest on a loan. Insurance, fuel and
   * upkeep are already in your spending. ~265k miles and a misfire (your note, 21 Nov):
   * planned for the first months home, Sep 2027. Used, cheap, and paid in cash — no loans
   * (your calls, 21 Nov): ~$10k for an older, higher-mileage three-row SUV. MY ESTIMATE.
   */
  car: { replaceMonth: '2027-09' as string | null, price: 10000, downShare: 1, rate: 0.09, termMonths: 60 },
  /** Modelled emergencies: how many, the first month, months apart, and size (2027 dollars). Off by default. */
  emergencies: { count: 0, first: '2028-01', everyMonths: 24, size: 5000 },

  law: {
    school: LAW_SCHOOLS.find((s) => s.key === 'ttu')!,
    schoolStart: '2027-08',
    schoolEnd: '2030-05',
    /**
     * After the bar: a big market, not back to Corpus. Your plan, 14 Nov: tax or
     * transactional work, "probably Austin".
     */
    moveToMarket: '2030-06',
    market: 'Austin',
    /** Family-sized rent within commuting reach of central Austin, 2027 dollars. MY ESTIMATE. */
    marketRent: 2700,
    /** General costs run higher in Austin than in Corpus (childcare is costed per child). MY ESTIMATE. */
    marketCostPremium: 150,
    jobStart: '2030-09',
    movingCost: 3000,
    barCost: 4000,
    /**
     * Household income your spouse loses by moving to Lubbock, per month in school. Zero in
     * the base case because her income is out of scope — a sensitivity, not a forecast.
     */
    spouseIncomeLostMonthly: 0,
    /**
     * The Corpus house on the law path: let it, or sell it when you leave for Lubbock.
     * Your two options, 14 Nov. Both are run; 'rent' is the headline.
     */
    house: 'rent' as 'rent' | 'sell',
    /**
     * Reserve re-enlistment bonus — "10k or something like that", your figure, 14 Nov,
     * on the law path. Modelled as one payment when you re-enlist, taxed at 22%; many
     * bonuses pay half up front and the rest on contract anniversaries. CONFIRM the amount
     * and the schedule with your retention NCO.
     */
    reenlistBonus: 10000,
    reenlistMonth: '2027-09',
    bookStipendAnnual: 1000,
    /**
     * Summers, consistent with the planning case (a mid-size firm or a Big 4 tax practice,
     * not BigLaw): ~10 weeks at ~$2,000 a week after 1L, ~$2,500 after 2L. Texas big firms
     * pay 1Ls and 2Ls the same — ~$4,327 a week ($225k a year), ~$43k a summer — but those
     * seats are few from Texas Tech, and fewer for 1Ls. Mid-size weekly rates are MY
     * ESTIMATE; the BigLaw rate is from 2026 firm postings. Planner lever (21 Nov).
     */
    summerGross: { '2028': 20000, '2029': 25000 } as Record<string, number>,
    /**
     * PLANNING CASE: tax or transactional work in Austin at a mid-size firm or a
     * Big 4 tax practice — where a JD with a CPA is the profile they hire. Not BigLaw:
     * Texas Tech sends a minority of each class to market-rate firms, so planning on it
     * would be planning on the upside. MY ESTIMATE.
     */
    salary: [
      ['2030-09', 150000],
      ['2032-09', 175000],
      ['2034-09', 205000],
      ['2037-09', 245000],
      ['2041-09', 295000],
      ['2046-12', 350000],
    ] as Anchor[],
    /**
     * UPSIDE: a market-rate (BigLaw) tax or transactional seat — the Cravath scale, then
     * the usual exit to in-house or partnership around year seven. MY ESTIMATE.
     */
    salaryBigLaw: [
      ['2030-09', 235000],
      ['2031-09', 245000],
      ['2032-09', 270000],
      ['2033-09', 305000],
      ['2034-09', 350000],
      ['2036-09', 410000],
      ['2037-09', 360000],
      ['2041-09', 430000],
      ['2046-12', 520000],
    ] as Anchor[],
  },
  macc: {
    /** Last MAcc block after you are home; online MHA paid for these months. */
    enrolledMonths: ['2027-09', '2027-10', '2027-11', '2027-12'],
    /** Online-only Chapter 33 housing: half the national average, before the 80% tier. MY ESTIMATE. */
    onlineMhaFull: 1170,
    /** Home in June; paid through July; a job search into the autumn. MY ESTIMATE. */
    jobStart: '2027-11',
    /** CPA review course and exam fees, spread over the exam months. */
    cpaCost: 3500,
    cpaMonths: ['2028-01', '2028-02', '2028-03', '2028-04', '2028-05', '2028-06'],
    /**
     * Not Guidehouse (your call, 14 Nov: it has been a while and you left a little quick).
     * A returning veteran after a stretch running a startup: the market on return is
     * genuinely uncertain, so the planning case is deliberately middle-of-the-road and the
     * bands are wide. The realistic landing spots, all leaning on the clearance and on
     * veterans' preference: a federal financial-management or audit job (Corpus Christi
     * Army Depot, DCAA, Army audit — GS-11/12), a defense FM consulting role at another
     * firm, or industry internal audit. Planning case: ~$85k from November 2027 after a
     * job search over the late summer and autumn. MY ESTIMATE.
     */
    salary: [
      ['2027-11', 85000],
      ['2029-09', 95000],
      ['2031-09', 110000],
      ['2034-09', 130000],
      ['2037-09', 150000],
      ['2041-09', 175000],
      ['2046-12', 205000],
    ] as Anchor[],
    /**
     * Licensed once the exam is passed: your GAO supervisor will sign the Texas experience
     * verification (your word, 14 Nov), so the experience year is already met.
     */
    licensed: '2028-09',
    /** Sole-proprietor variant: no employer match, self-employment tax, practice costs. */
    selfEmployed: false as boolean,
    /** Sole proprietor: the share of revenue the practice spends (profit is the rest). */
    practiceCostShare: 0.35,
    /**
     * A FORK of the Corpus CPA path, off by default (your framing, 14 Nov: "a fork from
     * Corpus CPA"). Remote work, and out to the countryside as soon as possible. The
     * job is remote — the same ~$85k planning case; remote roles draw a national applicant
     * pool, which the job-search band already allows for. The move is a VA-loan purchase
     * of a family home on some acreage, made as early as a lender will do it: six months
     * into the job, with the seller paying 2 of the 3 points of closing (VA allows up to
     * 4% in concessions), and only the move and a small reserve in cash — not waiting for
     * the debt to clear. 628 Chamberlain is let from then on, and that is the house
     * upgrade on this path. Location not pinned down; Texas countryside prices. MY
     * ESTIMATES. Lender check: debt-to-income will be high (two mortgages, the debt plan)
     * — VA judges it on residual income, and VA disability and 75% of the Chamberlain rent
     * count as income.
     */
    countryside: {
      enabled: false,
      price: 350000,
      taxRate: 0.018,
      monthsOnJob: 6,
      sellerConcession: 0.02,
      move: 5000,
      reserve: 5000,
      /** Fuel and a second vehicle's upkeep, well and septic, Starlink-class internet. */
      ruralExtras: 350,
      /**
       * Buying needs ~$14k in hand, which the CPA path does not have until about 2032.
       * "As soon as possible" therefore means renting in the country first — moving six
       * months into the remote job — and buying out there when the cash allows.
       */
      rentFirst: true,
      rent: 1500,
    },
  },
  /**
   * PATH C — Houston, working by day, law school at night. The University of Houston Law
   * Center's part-time evening JD: four years, and a public school, so Hazlewood covers
   * tuition as on the other law path. You keep a full-time salary throughout, sit the CPA
   * in 2028 as on the CPA path, and switch to tax or transactional law after the bar.
   * The cost is time: work, night school and a family of five at once. MY ESTIMATES
   * throughout; the programme's exact length and schedule need checking with UH.
   */
  night: {
    school: LAW_SCHOOLS.find((s) => s.key === 'uh')!,
    move: '2027-08',
    schoolStart: '2027-08',
    schoolEnd: '2031-05',
    /**
     * Part-time GI Bill: housing is paid at the rate of pursuit — about 80% for an evening
     * load against a full-time 12 hours — on top of the 80% tier. Entitlement is charged at
     * the same rate, so four part-time years use ~29 of your 36 months. MY ESTIMATE.
     */
    rateOfPursuit: 0.8,
    rent: 2300,
    costPremium: 100,
    movingCost: 3000,
    barCost: 4000,
    /** Financial-management / audit work in Houston pays a little over Corpus. MY ESTIMATE. */
    dayJobScale: 1.06,
    /** Tax or transactional law from Sep 2031: the law path's ladder, one year later. */
    lawyerStart: '2031-09',
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
  /** Enrolled this month — student loans deferred. */
  inSchool: boolean
  /** Your own practice, valued at 1× trailing-12-month revenue (0 unless sole proprietor). */
  businessValue: number
  /** The replacement car's loan, if one is running. */
  carLoan: number
}

/** The month 628 Chamberlain is sold on this path, or null if it is kept. */
export function saleMonth(key: PathKey, a = PATH_ASSUMPTIONS): string | null {
  return a.houseSaleMonth ?? (key === 'law' && a.law.house === 'sell' ? a.law.schoolStart : null)
}

/** The re-enlistment bonus on this path, if any. */
export function reenlistOf(key: PathKey, a = PATH_ASSUMPTIONS): { bonus: number; month: string } | null {
  if (a.reenlist) return a.reenlist.bonus > 0 ? a.reenlist : null
  return key !== 'macc' && a.law.reenlistBonus > 0 ? { bonus: a.law.reenlistBonus, month: a.law.reenlistMonth } : null
}

/** The months a modelled emergency lands. */
export function emergencyMonths(a = PATH_ASSUMPTIONS): string[] {
  const e = a.emergencies
  return Array.from({ length: Math.max(0, e.count) }, (_, k) => addMonths(e.first, k * Math.max(1, e.everyMonths)))
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
export { federalTax } from './tax'
import { federalTax } from './tax'

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
  let sold = false
  // The upgrade home, once bought.
  let upgraded = false
  let newValue = 0
  let newMortgage = 0
  let newPI = 0
  let newLoc = ''
  let jobMonths = 0
  /** The practice's revenue, month by month — its value is the last twelve. */
  const revenueLog: number[] = []
  let inCountry = false
  let carLoan = 0
  let carPmt = 0
  const sale = saleMonth(key, a)
  const bonus = reenlistOf(key, a)
  const shocks = emergencyMonths(a)
  const priceIdx = (m: string) => Math.pow(1 + a.homeAppreciation, (monthIndex(m) - monthIndex('2027-01')) / 12)

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
    /** Enrolled this month (any school): student loans are deferred (your rule, 19 Nov). */
    let schoolNow = false

    // Growth on what is already held.
    investments *= 1 + a.nthReturn / 12
    retirement *= 1 + a.investReturn / 12
    homeValue *= 1 + a.homeAppreciation / 12
    const interest = mortgage * (a.mortgageRate / 12)
    if (!sold) mortgage = Math.max(0, mortgage - (pAndI - interest))
    ut = ut * (1 + a.utRate / 12)
    if (upgraded) {
      newValue *= 1 + a.homeAppreciation / 12
      newMortgage = Math.max(0, newMortgage - (newPI - newMortgage * (a.upgrade.rate / 12)))
    }

    const dep = deployed.rows.find((r) => r.month === m)
    if (dep) {
      // ── Deployed: the plan in briefing.ts, as-is. Identical for both paths.
      phase = 'Deployed'
      income['Military pay (net; tax-free through June)'] = dep.net
      costs['Mortgage'] = dep.byBucket.housing ?? 0
      costs['Wife & Kids — nanny & household'] = dep.byBucket.home ?? 0
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
      const kids = a.family.births.filter((b) => monthIndex(b) <= monthIndex(m)).length
      const newRate = a.vaMonthly * (1 + a.vaPerChildShare * Math.max(0, kids - 1)) * infl
      const monthsHome = monthIndex(m) - monthIndex(homeMonth)
      const decided = monthsHome >= a.vaDecisionMonths
      const va = decided ? newRate : a.vaCurrentMonthly * infl
      income[decided ? `VA disability (${a.vaRating}%)` : 'VA disability (10%, until the new rating)'] = va
      if (monthsHome === a.vaDecisionMonths)
        income['VA back pay (new rating, to the month after release)'] = (newRate - a.vaCurrentMonthly * infl) * a.vaDecisionMonths
      costs['VA waived for drill & AT days'] = ((va * 12) / 365) * a.vaWaivedDaysPerYear / 12
      let taxableWages = drill
      let salary = 0
      let summerTax = 0
      if (bonus && m === bonus.month) {
        income['Re-enlistment bonus'] = bonus.bonus
        summerTax += bonus.bonus * 0.22
      }
      // Selling 628 Chamberlain: 11% selling costs, then the mortgage is cleared.
      if (sale && m === sale && !sold) {
        const proceeds = homeValue * (1 - HOUSE.sellingCostRate) - mortgage
        if (proceeds >= 0) income['Corpus house — sale, after 11% costs and the mortgage'] = proceeds
        else costs['Corpus house — sale shortfall brought to closing'] = -proceeds
        sold = true
        homeValue = 0
        mortgage = 0
      }

      if (key === 'law') {
        const inSchool = between(m, law.schoolStart, law.schoolEnd)
        schoolNow = inSchool
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
          costs[`Rent in ${law.school.city}`] = law.school.monthlyFamilyRent * infl
          if (m === law.schoolStart) costs[`Moving to ${law.school.city}`] = law.movingCost
          if (law.spouseIncomeLostMonthly > 0)
            costs['Spouse income lost by the move'] = law.spouseIncomeLostMonthly
        } else {
          if (monthIndex(m) < monthIndex(law.jobStart)) {
            phase = 'Bar study'
            if (m === '2030-06') costs['Bar exam & prep course'] = law.barCost
          } else {
            phase = `Attorney — ${law.market}`
            salary = salaryAt(law.salary, m) / 12
          }
          if (m === law.moveToMarket) costs[`Moving to ${law.market}`] = law.movingCost
          if (!upgraded) costs[`Rent in ${law.market}`] = law.marketRent * infl
          costs[`${law.market} cost premium (general)`] = law.marketCostPremium * infl
        }
        // Unless it is sold, the house stays let for the whole path: you never move back into it.
        if (!sold && monthIndex(m) >= monthIndex(law.schoolStart)) {
          income['Corpus house — rent'] = HOUSE.monthlyMarketRent * infl
          costs['Corpus house — management & vacancy'] =
            HOUSE.monthlyMarketRent * infl * (HOUSE.managementRate + HOUSE.vacancyMaintenanceRate)
          costs['Corpus house — non-homestead tax & landlord insurance'] = HOUSE.monthlyRentalTaxInsuranceUplift
        }
      } else if (key === 'night') {
        const nt = a.night
        const inSchool = between(m, nt.schoolStart, nt.schoolEnd)
        schoolNow = inSchool
        const monthNo = Number(m.slice(5, 7))
        if (inSchool && (monthNo >= 9 || monthNo <= 5))
          income['GI Bill housing (MHA, part-time)'] = nt.school.monthlyMha * tier * nt.rateOfPursuit * infl
        if (inSchool && monthNo === 9) income['GI Bill book stipend'] = a.law.bookStipendAnnual * tier
        if (monthIndex(m) >= monthIndex(nt.lawyerStart)) {
          // The law path's salary ladder, a year later.
          salary = salaryAt(a.law.salary, addMonths(m, -12)) / 12
          phase = `Attorney \u2014 ${nt.school.city}`
        } else if (monthIndex(m) >= monthIndex(macc.jobStart)) {
          salary = (salaryAt(macc.salary, m) * nt.dayJobScale) / 12
          phase = inSchool ? 'Day job + night law' : 'Day job, bar'
        } else {
          phase = inSchool ? 'Night law + job search' : 'Home \u2014 job search'
        }
        if (macc.cpaMonths.includes(m)) costs['CPA review & exam fees'] = macc.cpaCost / macc.cpaMonths.length
        if (m === '2031-06') costs['Bar exam & prep course'] = nt.barCost
        if (m === nt.move) costs[`Moving to ${nt.school.city}`] = nt.movingCost
        if (monthIndex(m) >= monthIndex(nt.move)) {
          if (!upgraded) costs[`Rent in ${nt.school.city}`] = nt.rent * infl
          costs[`${nt.school.city} cost premium (general)`] = nt.costPremium * infl
          if (!sold) {
            income['Corpus house \u2014 rent'] = HOUSE.monthlyMarketRent * infl
            costs['Corpus house \u2014 management & vacancy'] =
              HOUSE.monthlyMarketRent * infl * (HOUSE.managementRate + HOUSE.vacancyMaintenanceRate)
            costs['Corpus house \u2014 non-homestead tax & landlord insurance'] = HOUSE.monthlyRentalTaxInsuranceUplift
          }
        }
      } else {
        const enrolled = macc.enrolledMonths.includes(m)
        schoolNow = enrolled
        if (enrolled) income['GI Bill housing (online)'] = macc.onlineMhaFull * tier
        if (monthIndex(m) < monthIndex(macc.jobStart)) {
          phase = 'Home — job search'
        } else {
          salary = salaryAt(macc.salary, m) / 12
          phase = enrolled
            ? 'FM / audit job + last MAcc block'
            : monthIndex(m) < monthIndex(macc.licensed)
              ? 'FM / audit job, CPA exam'
              : 'CPA'
        }
        if (macc.cpaMonths.includes(m)) costs['CPA review & exam fees'] = macc.cpaCost / macc.cpaMonths.length
      }

      const selfEmployed = key === 'macc' && !!macc.selfEmployed
      // A sole proprietor's 'salary' is the practice's profit. Revenue runs higher: the
      // practice keeps ~65¢ of each dollar billed, the rest is its costs.
      const revenue = selfEmployed && salary > 0 ? salary / (1 - macc.practiceCostShare) : 0
      if (selfEmployed) revenueLog.push(revenue)
      if (salary > 0) {
        if (selfEmployed) {
          income['Practice revenue (fees billed)'] = revenue
          costs[`Practice costs (≈${Math.round(macc.practiceCostShare * 100)}% of revenue: software, insurance, CPE, staff)`] = revenue - salary
        } else income['Salary'] = salary
        taxableWages += salary
        const k401 = salary * a.employee401k
        // A sole proprietor has no employer match: the solo 401(k) is all yours.
        retirement += k401 + (selfEmployed ? 0 : salary * a.employer401k)
        costs[selfEmployed ? 'Solo 401(k) — your 5%' : '401(k) — your 5%'] = k401
        invested += k401
        // Self-employment tax: both halves of FICA, so another 7.65% on top of the employee half.
        if (selfEmployed) costs['Self-employment tax (the employer half of FICA)'] = salary * 0.0765
      }
      // Tax: federal on annualised wages (less the pre-tax 401k), FICA, and the flat
      // withholding on the summer job. No state income tax in Texas.
      const annual = (taxableWages - salary * a.employee401k) * 12
      const tax = federalTax(annual, year) / 12 + taxableWages * 0.0765 + summerTax
      costs['Taxes (federal + FICA)'] = tax

      // Where the family lives this month — it sets childcare and the upgrade market.
      const loc =
        key === 'night'
          ? monthIndex(m) >= monthIndex(a.night.move)
            ? a.night.school.city.toLowerCase()
            : 'corpus'
          : key === 'law'
          ? monthIndex(m) >= monthIndex(law.moveToMarket)
            ? 'austin'
            : monthIndex(m) >= monthIndex(law.schoolStart)
              ? law.school.city.toLowerCase()
              : 'corpus'
          : inCountry || (upgraded && newLoc === 'country')
            ? 'country'
            : 'corpus'

      // Housing: 628 Chamberlain's mortgage is paid in both paths unless it was sold.
      if (!sold) costs['Mortgage (P&I + escrow)'] = MORTGAGE_PAYMENT
      costs['Family support (household)'] = a.familySupportMonthly * infl

      // The children, one by one.
      let under5 = 0
      let school = 0
      let births = 0
      for (const b of a.family.births) {
        const age = monthIndex(m) - monthIndex(b)
        if (age === 0) births += a.family.birthCost * infl
        if (age >= 0 && age < 60) under5 += (a.family.childcare[loc]! + a.family.under5Other) * infl
        else if (age >= 60 && age < 216) school += a.family.schoolAge * infl
      }
      if (under5 > 0) costs['Children under 5 (childcare & care)'] = under5
      if (school > 0) costs['Children 5-17'] = school
      if (births > 0) costs['New baby'] = births

      const lifestyle = Math.max(0, salary * 12 - a.lifestyleFloor * infl) * a.lifestyleShare / 12
      costs['Your spending & home'] = a.personalSpendingMonthly * infl + lifestyle
      costs['Tricare Select Reserve'] = a.tricareMonthly * infl

      // The upgrade, once it is affordable: payable debt gone, settled where you will stay,
      // and cash covering closing, the move and a reserve.
      if (salary > 0) jobMonths++
      const cs = macc.countryside
      if (key === 'macc' && cs.enabled && cs.rentFirst && !inCountry && jobMonths >= cs.monthsOnJob) {
        inCountry = true
        costs['Move to the countryside (renting first)'] = cs.move * infl
      }
      if (key === 'macc' && inCountry && !upgraded) {
        costs['Rent in the countryside'] = cs.rent * infl
        costs['Rural extras (driving, well & septic, internet)'] = cs.ruralExtras * infl
      }
      if (key === 'macc' && cs.enabled && !upgraded && jobMonths >= cs.monthsOnJob) {
        // Out to the countryside as soon as a lender will do it.
        const price = cs.price * priceIdx(m)
        const upfront =
          price * Math.max(0, a.upgrade.closingRate - cs.sellerConcession) + (inCountry ? 2000 : cs.move) * infl
        if (cash >= upfront + cs.reserve * infl) {
          upgraded = true
          newLoc = 'country'
          newValue = price
          newMortgage = price
          const r = a.upgrade.rate / 12
          newPI = (price * r) / (1 - Math.pow(1 + r, -360))
          costs[inCountry ? 'Buy in the countryside — closing (after seller credit) & local move' : 'Move to the countryside — closing (after seller credit) & move'] = upfront
        }
      }
      const settled = key === 'law' ? monthIndex(m) >= monthIndex(law.jobStart) + 6 : salary > 0
      if (!upgraded && settled && debt <= 0 && !(key === 'macc' && cs.enabled)) {
        const price = a.upgrade.price[loc]! * priceIdx(m)
        const upfront = price * a.upgrade.closingRate + a.upgrade.moveAndFurnish * infl
        if (cash >= upfront + a.upgrade.reserve * infl) {
          upgraded = true
          newLoc = loc
          newValue = price
          newMortgage = price
          const r = a.upgrade.rate / 12
          newPI = (price * r) / (1 - Math.pow(1 + r, -360))
          costs['Home upgrade — closing, move & furnishing'] = upfront
        }
      }
      if (upgraded) {
        costs['New home — principal & interest'] = newPI
        costs['New home — property tax & insurance'] =
          (newValue * (newLoc === 'country' ? macc.countryside.taxRate : a.upgrade.taxRate[newLoc]!)) / 12 +
          a.upgrade.insuranceMonthly * infl
        if (newLoc === 'country') costs['Rural extras (driving, well & septic, internet)'] = macc.countryside.ruralExtras * infl
      }
      if (upgraded || (key === 'macc' && inCountry)) {
        // On the CPA path you move out of 628 Chamberlain, so it is let from here on.
        if (key === 'macc' && !sold) {
          income['Corpus house — rent'] = HOUSE.monthlyMarketRent * infl
          costs['Corpus house — management & vacancy'] =
            HOUSE.monthlyMarketRent * infl * (HOUSE.managementRate + HOUSE.vacancyMaintenanceRate)
          costs['Corpus house — non-homestead tax & landlord insurance'] = HOUSE.monthlyRentalTaxInsuranceUplift
        }
      }

      // Sold while you still live in it: the family rents in Corpus.
      const inChamberlain =
        key === 'macc' ? !upgraded && !inCountry : key === 'law' ? monthIndex(m) < monthIndex(law.schoolStart) : monthIndex(m) < monthIndex(a.night.move)
      if (sold && inChamberlain) costs['Rent in Corpus (house sold)'] = a.corpusRent * infl

      // The car: replaced once, a down payment and then a loan.
      const cr = a.car
      if (carLoan > 0.005) {
        const due = Math.min(carPmt, carLoan * (1 + cr.rate / 12))
        carLoan = carLoan * (1 + cr.rate / 12) - due
        costs['Car — replacement loan'] = due
      }
      if (cr.replaceMonth && m === cr.replaceMonth && cr.price > 0) {
        const price = cr.price * infl
        costs[cr.downShare >= 1 ? 'Car — replacement, paid in cash' : 'Car — replacement, down payment'] = price * cr.downShare
        carLoan = price * (1 - cr.downShare)
        const r = cr.rate / 12
        carPmt = r > 0 ? (carLoan * r) / (1 - Math.pow(1 + r, -cr.termMonths)) : carLoan / cr.termMonths
      }

      // Emergencies, if modelled.
      const shockCount = shocks.filter((x) => x === m).length
      if (shockCount > 0) costs['Emergency (modelled)'] = a.emergencies.size * infl * shockCount

      // Debts.
      debt = debt * (1 + a.debtRate / 12)
      const debtPay = Math.min(debt, a.debtPaydownMonthly)
      if (debtPay > 0) costs['Debt payments'] = debtPay
      debt -= debtPay
      // In school: the UT (Dept of Education) loan is deferred — no payment that month.
      const utPay = schoolNow ? 0 : Math.min(ut, a.utMonthly)
      if (utPay > 0) costs['UT loan plan'] = utPay
      ut -= utPay

      // Nth: never skipped.
      costs['Nth Venture (your business)'] = a.nthMonthly
      investments += a.nthPrincipal
      invested += a.nthMonthly

      cash *= 1 + (cash >= 0 ? a.cashReturn : a.gapRate) / 12
    }

    const totalIncome = r2(Object.values(income).reduce((s, v) => s + v, 0))
    const totalCosts = r2(Object.values(costs).reduce((s, v) => s + v, 0))
    const net = r2(totalIncome - totalCosts)
    if (!dep) cash += net

    const liabilities = mortgage + newMortgage + debt + ut + chargeOffs + carLoan
    // The practice is an asset: small accounting practices sell for about 1× a year's revenue.
    const businessValue = revenueLog.slice(-12).reduce((s, v) => s + v, 0)
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
      homeValue: r2(homeValue + newValue),
      mortgage: r2(mortgage + newMortgage),
      debt: r2(debt + ut + chargeOffs),
      netWorth: r2(cash + investments + retirement + homeValue + newValue + businessValue - liabilities),
      inSchool: schoolNow,
      businessValue: r2(businessValue),
      carLoan: r2(carLoan),
    })
  }

  return {
    key,
    label: a.label ??
      (key === 'law'
        ? 'Law school — Texas Tech, then Austin'
        : key === 'night'
          ? 'Night law — UH part-time, working in Houston'
          : a.macc.countryside.enabled
            ? 'MAcc → CPA — remote, countryside'
            : 'MAcc → CPA — Corpus'),
    months,
  }
}
