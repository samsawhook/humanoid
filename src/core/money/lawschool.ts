/**
 * JD financial prep: balance sheet, housing scenarios, and a three-year projection.
 *
 * SCOPE: this models YOUR finances. Household income other than yours is deliberately
 * out of scope — the interface between the two ledgers is the support-sent-home line
 * in household.ts, which is an outflow from this one. A negative result here is the
 * gap you personally have to cover, not a claim about the family's overall position.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHAT IS REAL AND WHAT IS NOT.
 *  Real: your Monarch balances, your pay, your obligations.
 *  Estimated by me and flagged `low`: every MHA rate, every rent figure, the house's
 *  market value, and the Corpus Christi rental market. I had no authoritative source
 *  and refused to invent precise-looking numbers. All of them sit in this file as
 *  one-line edits.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The structural facts this encodes:
 *  - Hazlewood covers tuition and fees at Texas public institutions, so tuition is
 *    NOT the driver. Housing and family living costs are.
 *  - Post-9/11 MHA is paid at the E-5-with-dependents BAH rate for the school's ZIP,
 *    which makes *where* you study a five-figure-a-year decision.
 *  - You are not a typical student. A 1L living on ramen is not the relevant model.
 */

import type { LocalDate } from '../types'
import { TRICARE_SELECT_RESERVE } from './household'
import { DEBTS } from './debts'
import { CAR_LOAN_BALANCE } from './obligations'

export interface BalanceLine {
  label: string
  amount: number
  kind: 'asset' | 'liability'
  /**
   * A figure you disputed. Carried at zero in the headline so net worth is not
   * propped up by a number nobody believes; the disputed value is kept here so the
   * sensitivity is still visible and can be restored the moment you have a real one.
   */
  disputedValue?: number
  note?: string
}

export type Confidence = 'high' | 'medium' | 'low'

/**
 * Post-9/11 benefit tier: 80%.
 *
 * Everything Chapter 33 pays is prorated by this — MHA, the book stipend, and the
 * tuition percentage. Two consequences, pulling opposite ways:
 *
 *  BAD: MHA is 80% of the E-5-with-dependents rate, which is the number the whole
 *  school comparison turns on. It knocks roughly $300-460/mo off every option and
 *  flips several from MHA-covers-rent to it does not.
 *
 *  GOOD, and it settles the question I flagged as the biggest unknown: at 100% you
 *  must exhaust Chapter 33 before Hazlewood applies, because the federal benefit
 *  already covers all tuition and leaves nothing for the exemption. At 90% or less
 *  they STACK in the same semester — Chapter 33 pays its percentage and Hazlewood
 *  covers the remaining balance. So at 80% you are not forced to choose, and tuition
 *  still lands at zero.
 *
 * Confirm the stacking with the TAMU-CC certifying official before relying on it.
 */
export const POST_911_TIER = 0.8

// ── Summer earnings ─────────────────────────────────────────────────────────

/**
 * The three summers are three completely different financial events, and lumping them
 * into one "summer job" number hides the only one that matters.
 *
 *  **1L summer** is small everywhere. Firms hire almost no 1Ls; the realistic options
 *  are a funded public-interest fellowship, a judicial internship, or research work for
 *  a professor. Plan on it covering its own costs and little else.
 *
 *  **2L summer** is the whole game. A summer associate offer converts to a post-
 *  graduation job at high rates, and at a market-paying Houston or Dallas firm it pays
 *  more in twelve weeks than the MHA pays in a year. It is also the single largest
 *  swing factor in whether three years of school leaves you up or down.
 *
 *  **3L summer does not exist as earnings.** It is bar study — roughly ten weeks of
 *  full-time preparation, with the exam fee and a commercial prep course to pay for.
 *  Modelling it as income would be the most flattering error in the file, so it is
 *  modelled as the cost it is.
 *
 * Two things about the summers matter beyond the headline number:
 *
 *  1. MHA does not pay over the summer. The model already runs MHA at 9 months of 12,
 *     so summer earnings are not pure upside — the first slice replaces income you
 *     stop receiving.
 *  2. Summer earnings are ordinary taxable wages. MHA and Hazlewood are not. So a
 *     dollar of summer pay is worth materially less than a dollar of MHA, and the
 *     comparison is only honest after tax.
 */
export type SummerTrack = 'public_interest' | 'regional_firm' | 'big_law'

export interface SummerPlan {
  track: SummerTrack
  label: string
  /** Gross pay for the summer after 1L. */
  afterFirstYear: number
  /** Gross pay for the summer after 2L — the summer associate position. */
  afterSecondYear: number
  confidence: Confidence
  note: string
}

/**
 * Effective tax on summer wages. A summer associate salary is earned in twelve weeks
 * but withheld as though it were an annual rate, so the withholding is punishing even
 * where the eventual liability is not. Modelled as a flat effective rate — blunt, and
 * flagged as such.
 */
export const SUMMER_TAX_RATE = 0.22

/** Bar exam fee plus a commercial prep course, paid in the 3L year. */
export const BAR_COSTS = 4000

export const SUMMER_PLANS: SummerPlan[] = [
  {
    track: 'public_interest',
    label: 'Public interest / government',
    afterFirstYear: 6000,
    afterSecondYear: 10000,
    confidence: 'low',
    note:
      'Funded fellowship or a government honors programme. Many such positions are ' +
      'unpaid and covered by a school grant, so treat these as the school subsidising ' +
      'the summer rather than an employer paying market.',
  },
  {
    track: 'regional_firm',
    label: 'Regional / mid-size firm',
    afterFirstYear: 8000,
    afterSecondYear: 30000,
    confidence: 'low',
    note:
      'Roughly twelve weeks at $2,500 for the 2L summer. The realistic centre of the ' +
      'distribution for most Texas graduates, and the assumption to plan against ' +
      'unless you have a reason to believe otherwise.',
  },
  {
    track: 'big_law',
    label: 'Market-rate firm (Houston / Dallas)',
    afterFirstYear: 15000,
    afterSecondYear: 52000,
    confidence: 'low',
    note:
      'Twelve weeks at the market weekly rate, which tracks the first-year associate ' +
      'salary divided by 52. Houston pays market at the large firms. This outcome is ' +
      'competitive and correlates hard with school and class rank — it is the upside ' +
      'case, not the planning case.',
  },
]

export function summerPlan(track: SummerTrack): SummerPlan {
  const found = SUMMER_PLANS.find((p) => p.track === track)
  if (!found) throw new Error(`unknown summer track: ${track}`)
  return found
}

/** Gross summer pay earned during a given school year. Year 3 is bar study, so zero. */
export function summerGrossFor(plan: SummerPlan, year: number): number {
  if (year === 1) return plan.afterFirstYear
  if (year === 2) return plan.afterSecondYear
  return 0
}

export interface LawSchool {
  key: string
  name: string
  city: string
  zip: string
  /** Post-9/11 MHA ≈ E-5 with dependents BAH for this ZIP. */
  monthlyMha: number
  mhaConfidence: Confidence
  /** Market rent for a family-sized place near campus. */
  monthlyFamilyRent: number
  rentConfidence: Confidence
  /** Tuition and fees per year, before Hazlewood. Shown to make the exemption's value visible. */
  annualTuitionSticker: number
  tuitionConfidence: Confidence
  publicTexas: boolean
  note?: string
}

/**
 * All five are Texas public institutions, so Hazlewood applies to tuition and fees at
 * each. That makes MHA minus rent the number that actually separates them.
 */
export const LAW_SCHOOLS: LawSchool[] = [
  {
    key: 'uh',
    name: 'University of Houston Law Center',
    city: 'Houston',
    zip: '77204',
    monthlyMha: 2100,
    mhaConfidence: 'low',
    monthlyFamilyRent: 1900,
    rentConfidence: 'low',
    annualTuitionSticker: 36000,
    tuitionConfidence: 'low',
    publicTexas: true,
  },
  {
    key: 'ut',
    name: 'University of Texas School of Law',
    city: 'Austin',
    zip: '78705',
    monthlyMha: 2300,
    mhaConfidence: 'low',
    monthlyFamilyRent: 2400,
    rentConfidence: 'low',
    annualTuitionSticker: 40000,
    tuitionConfidence: 'low',
    publicTexas: true,
    note: 'Strongest outcomes of the five, and the only one where rent likely exceeds MHA.',
  },
  {
    key: 'ttu',
    name: 'Texas Tech University School of Law',
    city: 'Lubbock',
    zip: '79409',
    monthlyMha: 1450,
    mhaConfidence: 'low',
    monthlyFamilyRent: 1250,
    rentConfidence: 'low',
    annualTuitionSticker: 26000,
    tuitionConfidence: 'low',
    publicTexas: true,
    note: 'Lowest cost of living of the five. Lower MHA, but rent falls further than MHA does.',
  },
  {
    key: 'unt',
    name: 'UNT Dallas College of Law',
    city: 'Dallas',
    zip: '75201',
    monthlyMha: 2150,
    mhaConfidence: 'low',
    monthlyFamilyRent: 1950,
    rentConfidence: 'low',
    annualTuitionSticker: 22000,
    tuitionConfidence: 'low',
    publicTexas: true,
    note: 'Lowest sticker tuition — irrelevant under Hazlewood, but relevant if it ever lapses.',
  },
  {
    key: 'tamu',
    name: 'Texas A&M School of Law',
    city: 'Fort Worth',
    zip: '76102',
    monthlyMha: 2000,
    mhaConfidence: 'low',
    monthlyFamilyRent: 1750,
    rentConfidence: 'low',
    annualTuitionSticker: 34000,
    tuitionConfidence: 'low',
    publicTexas: true,
  },
]

// ── The Corpus Christi house ────────────────────────────────────────────────

/**
 * 628 Chamberlain St — real figures from Zillow, 2026-08-05.
 *
 * 3 bed / 1 bath, 1,416 sqft, built 1951, 8,232 sqft lot.
 *
 * Two of these corrected my earlier estimates in ways that change the answer:
 * selling costs are 11%, not the 7% I assumed, and the value is a RANGE. Between
 * them, selling can plausibly leave you owing money at closing.
 */
export const HOUSE = {
  /** Zestimate. */
  marketValue: 185100,
  /** Zillow's stated range. The sell decision is dominated by where in this you land. */
  valueLow: 165000,
  valueHigh: 205000,
  mortgageBalance: 162783,
  monthlyPayment: 1300,
  /**
   * Zillow's own figure: $6,000 prep and repair + $14,225 closing = $20,225 on a
   * $185,100 sale, i.e. 11%. My earlier 7% was optimistic by roughly $7,400.
   */
  sellingCostRate: 0.11,
  prepAndRepair: 6000,
  /** Rent Zestimate. */
  monthlyMarketRent: 1705,
  rentConfidence: 'medium' as Confidence,
  /** Nueces County, 2026. Escrowed inside the payment while it is your homestead. */
  annualPropertyTax: 3117,
  /**
   * Assessed well above the Zestimate. Worth a protest — and note that converting to
   * a rental forfeits the homestead exemption and cap, which raises the bill.
   */
  taxAssessedValue: 221715,
  /** Property management, if you are not there to do it. */
  managementRate: 0.1,
  /** Vacancy and maintenance reserve. A 1951 build with one bathroom earns the high end. */
  vacancyMaintenanceRate: 0.15,
  /** Extra tax and insurance once it stops being your homestead. MY ESTIMATE. */
  monthlyRentalTaxInsuranceUplift: 150,
  /** Short-term let: higher gross, much higher cost and variance. */
  airbnbGrossMultiplier: 1.6,
  airbnbCostRate: 0.35,
  airbnbConfidence: 'low' as Confidence,
}

/** Net cash at closing at a given sale price. Negative means you bring money. */
export function sellNetAt(price: number, house = HOUSE): number {
  return round2(price * (1 - house.sellingCostRate) - house.mortgageBalance)
}

export type HousingScenario = 'sell' | 'rent' | 'airbnb'

export interface HousingOutcome {
  scenario: HousingScenario
  label: string
  /** Cash released at the point of the decision. Only selling produces any. */
  upfrontCash: number
  /**
   * ABSOLUTE monthly cash flow from the property, mortgage payment included.
   *
   * Selling is 0: the property is gone, so it neither costs nor earns. Letting is
   * income minus the payment minus costs. All three on one basis — an earlier version
   * scored selling as +$1,300 (the payment relieved) against letting figures that
   * already netted the payment off, which compared a delta with an absolute and made
   * selling look $1,300/mo better than it is.
   */
  monthlyCashFlow: number
  /**
   * Change against the do-nothing case of holding it empty at -$1,300/mo. Useful, but
   * only ever shown beside the absolute figure and never mixed with it.
   */
  monthlyVsHoldingEmpty: number
  /** Equity still held in the property at the end of three years, roughly. */
  equityRetainedAfter3y: number
  risks: string[]
  note: string
}

export function housingScenarios(house = HOUSE): HousingOutcome[] {
  const sellNet = sellNetAt(house.marketValue, house)
  const sellNetLow = sellNetAt(house.valueLow, house)
  const sellNetHigh = sellNetAt(house.valueHigh, house)

  const rentGross = house.monthlyMarketRent
  const rentNet = round2(
    rentGross * (1 - house.managementRate - house.vacancyMaintenanceRate) -
      house.monthlyPayment -
      house.monthlyRentalTaxInsuranceUplift,
  )

  const bnbGross = house.monthlyMarketRent * house.airbnbGrossMultiplier
  const bnbNet = round2(
    bnbGross * (1 - house.airbnbCostRate) -
      house.monthlyPayment -
      house.monthlyRentalTaxInsuranceUplift,
  )

  // Roughly 36 payments of principal. Deliberately crude and labelled as such.
  const principalOver3y = round2(house.monthlyPayment * 36 * 0.35)

  /** Holding it empty costs the full payment and earns nothing. */
  const holdingEmpty = -house.monthlyPayment

  return [
    {
      scenario: 'sell',
      label: 'Sell',
      upfrontCash: sellNet,
      // Gone: no payment, no income. Zero is the honest absolute figure.
      monthlyCashFlow: 0,
      monthlyVsHoldingEmpty: round2(0 - holdingEmpty),
      equityRetainedAfter3y: 0,
      risks: [
        `Value is a RANGE. At ${usd(house.valueLow)} you bring ${usd(Math.abs(sellNetLow))} TO closing; at ${usd(house.valueHigh)} you walk with ${usd(sellNetHigh)}.`,
        'Selling costs are 11% — $6,000 prep and repair plus $14,225 closing.',
        'Gives up the asset and the homestead exemption permanently.',
        'Must complete around the move, with no slack in the timing.',
      ],
      note: `Nets about ${usd(sellNet)} at the Zestimate — far thinner than it looks, because 11% of ${usd(house.marketValue)} is ${usd(house.marketValue * house.sellingCostRate)}. Monthly cash flow afterwards is zero: no payment, no income.`,
    },
    {
      scenario: 'rent',
      label: 'Rent it out',
      upfrontCash: 0,
      monthlyCashFlow: rentNet,
      monthlyVsHoldingEmpty: round2(rentNet - holdingEmpty),
      equityRetainedAfter3y: round2(house.marketValue - house.mortgageBalance + principalOver3y),
      risks: [
        'A bad tenant while you are in class is a genuine problem.',
        '3 bed / 1 bath, built 1951 — one bathroom materially narrows the tenant pool.',
        'Loses the homestead exemption and cap; assessed value is already $221,715 against a $185,100 Zestimate.',
        'Arrears history may complicate refinancing or a HELOC if you need cash fast.',
      ],
      note: `Keeps the asset. After the payment, management and a vacancy reserve it runs ${rentNet >= 0 ? 'positive' : 'negative'} at ${usd(rentNet)}/mo — ${usd(rentNet - holdingEmpty)}/mo better than holding it empty.`,
    },
    {
      scenario: 'airbnb',
      label: 'Short-term let',
      upfrontCash: 0,
      monthlyCashFlow: bnbNet,
      monthlyVsHoldingEmpty: round2(bnbNet - holdingEmpty),
      equityRetainedAfter3y: round2(house.marketValue - house.mortgageBalance + principalOver3y),
      risks: [
        'Highest variance of the three, and seasonal on the coast.',
        'Effectively a small business run remotely while in law school.',
        'Corpus Christi short-term regulations can change.',
        'The 1.6× gross multiplier is a guess and drives the whole result.',
        'One bathroom caps nightly rate and party size — the multiplier may be generous.',
        'Also loses the homestead exemption.',
      ],
      note: `Highest expected return at ${usd(bnbNet)}/mo after the payment and costs, and the only option that adds a job to your 1L year.`,
    },
  ]
}

// ── Three-year projection ───────────────────────────────────────────────────

/**
 * One named line on one side of one year's ledger.
 *
 * `amount` is always positive — which side of the ledger it is on is carried by which
 * array it lives in, not by its sign. That way a rendering can never accidentally show
 * a cost as income by dropping a minus.
 */
export interface LedgerLine {
  key: string
  label: string
  amount: number
  note?: string
}

export interface YearProjection {
  year: number
  label: string
  /** Every dollar in, itemised. Nothing is bundled into a residual "other". */
  income: LedgerLine[]
  /** Every dollar out, itemised. */
  costs: LedgerLine[]
  totalIncome: number
  totalCosts: number
  net: number
  cumulative: number

  // ── Convenience accessors over the same numbers, for charts and assertions. ──
  mhaIncome: number
  housingScenarioIncome: number
  /** Summer earnings, AFTER tax. Zero in 3L: that summer is bar study. */
  summerIncome: number
  /** Summer earnings before tax, so the withholding bite stays visible. */
  summerGross: number
  /** Drill pay and the book stipend. */
  otherIncome: number
  rent: number
  householdCosts: number
  tricare: number
  /** Bar exam fee and prep course. 3L year only. */
  barCosts: number
}

export interface JdProjection {
  school: LawSchool
  scenario: HousingOutcome
  startingCash: number
  years: YearProjection[]
  endingCash: number
  /** Tuition avoided by Hazlewood over three years. */
  hazlewoodValue: number
  warnings: string[]
}

export interface JdInputs {
  startingCash: number
  /** Monthly household running cost for the family while in school. */
  monthlyHousehold: number
  /** MHA is paid for months in session — roughly 9 a year, not 12. */
  mhaMonthsPerYear?: number
  /** Month Tricare Select Reserve begins, counted from the start of year 1. */
  tricareStartsMonth?: number
  /**
   * Reserve drill pay. You stay in the Reserves through school, so this continues.
   * Roughly four drills a month at E-6 over ten years, plus annual training.
   * MY ESTIMATE — confirm it.
   */
  monthlyDrillPay?: number
  /** Post-9/11 books and supplies stipend, paid annually, before the tier is applied. */
  annualBookStipend?: number
  /** Chapter 33 entitlement tier. Defaults to POST_911_TIER. */
  benefitTier?: number
  /**
   * Which summer outcome to plan against. Defaults to `regional_firm` — the centre of
   * the distribution rather than the best case, because a plan built on the best case
   * is not a plan.
   */
  summerTrack?: SummerTrack
  /** Effective tax on summer wages. Defaults to SUMMER_TAX_RATE. */
  summerTaxRate?: number
  /** Bar exam fee plus prep course, charged in 3L. Defaults to BAR_COSTS. */
  barCosts?: number
}

export function projectJd(
  school: LawSchool,
  scenario: HousingOutcome,
  inputs: JdInputs,
): JdProjection {
  const { startingCash, monthlyHousehold } = inputs
  const mhaMonths = inputs.mhaMonthsPerYear ?? 9
  const tricareStart = inputs.tricareStartsMonth ?? 1
  const drillPay = inputs.monthlyDrillPay ?? 475
  const tier = inputs.benefitTier ?? POST_911_TIER
  const bookStipend = round2((inputs.annualBookStipend ?? 1000) * tier)
  const summer = summerPlan(inputs.summerTrack ?? 'regional_firm')
  const summerTaxRate = inputs.summerTaxRate ?? SUMMER_TAX_RATE
  const barCosts = inputs.barCosts ?? BAR_COSTS

  const warnings: string[] = [
    'Every MHA and rent figure here is my estimate, flagged low confidence. Confirm before deciding.',
    'MHA is paid only for months in session — modelled at 9 of 12, not 12.',
    'Post-9/11 entitlement is 36 months against a 36-month degree; any month spent on the MAcc is a month not available here.',
    `Reserve drill pay modelled at ${usd(drillPay)}/mo — my estimate, confirm it.`,
    `Summer earnings modelled on the ${summer.label.toLowerCase()} track: ` +
      `${usd(summer.afterFirstYear)} after 1L and ${usd(summer.afterSecondYear)} after 2L, ` +
      `taxed at ${Math.round(summerTaxRate * 100)}%. The 2L summer is the single largest ` +
      'swing factor here and the least predictable — it turns on school and class rank.',
    'No summer income in 3L: that summer is bar study, and it carries the exam fee and ' +
      'prep course rather than a salary.',
    `Post-9/11 at ${Math.round(tier * 100)}%: MHA and the book stipend are prorated. At 90% or ` +
      'less Hazlewood stacks with Chapter 33 rather than waiting for it to exhaust, so ' +
      'tuition should still land at zero — confirm that with the certifying official.',
  ]
  warnings.push(
    'This models YOUR side of the ledger only. Household income other than yours is out ' +
      'of scope by design, so a negative result is the gap you personally have to cover — ' +
      'not a statement about the family’s position.',
  )
  if (scenario.scenario === 'sell') {
    warnings.push('Sale proceeds are counted once, in year 1. A sale that slips costs you the move.')
  }

  const years: YearProjection[] = []
  let cumulative = startingCash

  for (let year = 1; year <= 3; year++) {
    const mhaIncome = round2(school.monthlyMha * tier * mhaMonths)
    // Absolute basis. Selling contributes its proceeds once and nothing thereafter;
    // the Corpus mortgage is not among the school-year costs, so crediting its relief
    // here would have been counting a payment that was never charged.
    const housingScenarioIncome =
      scenario.scenario === 'sell' && year === 1
        ? round2(scenario.upfrontCash)
        : round2(scenario.monthlyCashFlow * 12)

    const rent = round2(school.monthlyFamilyRent * 12)
    const householdCosts = round2(monthlyHousehold * 12)

    const tricareMonths = Math.max(0, Math.min(12, year * 12 - tricareStart + 1))
    const tricare = round2(TRICARE_SELECT_RESERVE.monthlyPremium * tricareMonths)

    const drillIncome = round2(drillPay * 12)
    const otherIncome = round2(drillIncome + bookStipend)

    // The summer AFTER this academic year. 3L's summer is bar study, not a job.
    const summerGross = summerGrossFor(summer, year)
    const summerTax = round2(summerGross * summerTaxRate)
    const summerIncome = round2(summerGross - summerTax)
    const barCostsThisYear = year === 3 ? barCosts : 0

    const income: LedgerLine[] = [
      {
        key: 'mha',
        label: `Post-9/11 MHA (${Math.round(tier * 100)}%, ${mhaMonths} months)`,
        amount: mhaIncome,
        note: 'Tax-free, and paid only for months in session — nothing over the summer.',
      },
      { key: 'drill', label: 'Reserve drill pay', amount: drillIncome },
      { key: 'books', label: 'Book stipend', amount: bookStipend },
    ]
    if (summerIncome > 0) {
      income.push({
        key: 'summer',
        label: `Summer after ${year}L, after tax — ${summer.label}`,
        amount: summerIncome,
        note:
          `${usd(summerGross)} gross less ${usd(summerTax)} tax. Partly replaces the MHA ` +
          'you stop receiving over the summer rather than adding to it.',
      })
    }
    if (housingScenarioIncome > 0) {
      income.push({
        key: 'housing',
        label: scenario.scenario === 'sell' ? 'Sale proceeds' : `House — ${scenario.label}`,
        amount: housingScenarioIncome,
      })
    }

    const costs: LedgerLine[] = [
      { key: 'rent', label: `Rent near ${school.city}`, amount: rent },
      { key: 'household', label: 'Family living costs', amount: householdCosts },
    ]
    if (tricare > 0) {
      costs.push({ key: 'tricare', label: 'Tricare Select Reserve', amount: tricare })
    }
    if (housingScenarioIncome < 0) {
      costs.push({
        key: 'housing',
        label: `House — ${scenario.label}`,
        amount: Math.abs(housingScenarioIncome),
        note: 'The Corpus house costs more to keep than it brings in under this scenario.',
      })
    }
    if (barCostsThisYear > 0) {
      costs.push({
        key: 'bar',
        label: 'Bar exam fee and prep course',
        amount: barCostsThisYear,
        note: 'Falls in 3L, in the same stretch where there is no summer income to meet it.',
      })
    }

    const totalIncome = round2(income.reduce((t, l) => t + l.amount, 0))
    const totalCosts = round2(costs.reduce((t, l) => t + l.amount, 0))
    const net = round2(totalIncome - totalCosts)
    cumulative = round2(cumulative + net)

    years.push({
      year,
      label: `${year}L`,
      income,
      costs,
      totalIncome,
      totalCosts,
      net,
      cumulative,
      mhaIncome,
      housingScenarioIncome,
      summerIncome,
      summerGross,
      otherIncome,
      rent,
      householdCosts,
      tricare,
      barCosts: barCostsThisYear,
    })
  }

  return {
    school,
    scenario,
    startingCash,
    years,
    endingCash: cumulative,
    // What Hazlewood covers: the share Chapter 33 does not, at this tier.
    hazlewoodValue: round2(school.annualTuitionSticker * (1 - tier) * 3),
    warnings,
  }
}

// ── Balance sheet ───────────────────────────────────────────────────────────

/**
 * Cash accounts, from the Monarch export 2026-08-05.
 *
 * The only balances stated here directly. Everything else on the balance sheet is
 * COMPOSED from wherever that fact already lives: the house from HOUSE, the unsecured
 * debts from debts.ts, the auto loan from obligations.ts. One number, one home — so
 * correcting a figure in the budget corrects it here too, rather than leaving two
 * pages quietly disagreeing.
 */
export const CASH_ACCOUNTS: { label: string; amount: number }[] = [
  { label: 'Share Savings', amount: 46.83 },
  { label: 'Schwab Checking', amount: 2.91 },
  { label: 'Joint Checking', amount: 2.2 },
]

/** Valuations you rejected. Carried at zero; the disputed figure is kept for the sensitivity. */
export const PERSONAL_PROPERTY: BalanceLine[] = [
  {
    label: '2013 Ford Expedition King Ranch',
    amount: 0,
    kind: 'asset',
    disputedValue: 8898.59,
    note: 'Monarch auto-valuation, which you do not accept. Carried at zero. A 2013 vehicle with a lien against it is a net negative until that clears.',
  },
  {
    label: 'Boat',
    amount: 0,
    kind: 'asset',
    disputedValue: 8000,
    note: 'Monarch auto-valuation, which you do not accept. Carried at zero until you give me a figure you would actually sell at.',
  },
]

/**
 * The balance sheet, assembled from the same figures the budget uses.
 *
 * Deliberately a function rather than a constant: a constant would have to restate
 * the house value and every debt balance, and a restated number is a number that
 * drifts. This one cannot disagree with the budget because it reads from it.
 */
export function openingBalanceSheetLines(): BalanceLine[] {
  return [
    {
      label: '628 Chamberlain St, Corpus Christi',
      amount: HOUSE.marketValue,
      kind: 'asset',
      note: `Zillow Zestimate. Range ${usd(HOUSE.valueLow)}–${usd(HOUSE.valueHigh)}.`,
    },
    ...PERSONAL_PROPERTY,
    ...CASH_ACCOUNTS.map((a): BalanceLine => ({ ...a, kind: 'asset' })),
    { label: 'Mortgage', amount: HOUSE.mortgageBalance, kind: 'liability' },
    ...DEBTS.map(
      (d): BalanceLine => ({
        label: d.label,
        amount: d.balance,
        kind: 'liability',
        note: d.posture === 'active' ? undefined : d.posture.replace(/_/g, ' '),
      }),
    ),
    { label: 'Car loan', amount: CAR_LOAN_BALANCE, kind: 'liability' },
  ]
}

/** Kept as a name for readability. Always the composed version. */
export const OPENING_BALANCE_SHEET: BalanceLine[] = openingBalanceSheetLines()

export interface BalanceSheet {
  asOf: LocalDate
  lines: BalanceLine[]
  assets: number
  liabilities: number
  netWorth: number
  /** Assets you could actually spend this week. */
  liquid: number
  /** Total of figures carried at zero because you disputed them. */
  disputedTotal: number
  /** What net worth would be if the disputed values were accepted. */
  netWorthIfDisputedAccepted: number
}

export function balanceSheet(
  asOf: LocalDate,
  lines: BalanceLine[],
  liquidLabels: string[] = ['Share Savings', 'Schwab Checking', 'Joint Checking', 'Cash'],
): BalanceSheet {
  const assets = round2(
    lines.filter((l) => l.kind === 'asset').reduce((s, l) => s + l.amount, 0),
  )
  const liabilities = round2(
    lines.filter((l) => l.kind === 'liability').reduce((s, l) => s + l.amount, 0),
  )
  const liquid = round2(
    lines
      .filter((l) => l.kind === 'asset' && liquidLabels.some((n) => l.label.startsWith(n)))
      .reduce((s, l) => s + l.amount, 0),
  )
  const disputedTotal = round2(lines.reduce((s, l) => s + (l.disputedValue ?? 0), 0))
  const netWorth = round2(assets - liabilities)

  return {
    asOf,
    lines,
    assets,
    liabilities,
    netWorth,
    liquid,
    disputedTotal,
    netWorthIfDisputedAccepted: round2(netWorth + disputedTotal),
  }
}

/**
 * Projected balance sheet at the end of the deployment.
 *
 * Applies the cash-flow model's outcomes to the opening sheet: arrears cured, car
 * cleared, some unsecured debt retired, some cash accumulated. Everything else is
 * held flat — no market appreciation, no vehicle depreciation, because guessing at
 * either would add noise to a number whose job is to be roughly right.
 */
export function projectedBalanceSheet(
  asOf: LocalDate,
  opening: BalanceLine[],
  changes: { label: string; delta: number }[],
): BalanceSheet {
  const lines = opening.map((line) => {
    const change = changes.find((c) => c.label === line.label)
    if (!change) return line
    return { ...line, amount: round2(Math.max(0, line.amount + change.delta)) }
  })

  for (const change of changes) {
    if (!opening.some((l) => l.label === change.label)) {
      lines.push({ label: change.label, amount: round2(change.delta), kind: 'asset' })
    }
  }

  return balanceSheet(asOf, lines)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
