/**
 * JD financial prep: balance sheet, housing scenarios, and a three-year projection.
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

export type Confidence = 'high' | 'medium' | 'low'

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

/** From your Monarch snapshot, 2026-08-05. */
export const HOUSE = {
  marketValue: 187400,
  mortgageBalance: 162783,
  monthlyPayment: 1300,
  /** Agent commission, title, repairs. 7% is a normal Texas all-in figure. */
  sellingCostRate: 0.07,
  /** Corpus Christi market rent for the property. MY ESTIMATE — confirm it. */
  monthlyMarketRent: 1650,
  rentConfidence: 'low' as Confidence,
  /** Property management, if you are not there to do it. */
  managementRate: 0.1,
  /** Vacancy and maintenance reserve, as a share of gross rent. */
  vacancyMaintenanceRate: 0.15,
  /** Short-term let: higher gross, much higher cost and variance. */
  airbnbGrossMultiplier: 1.6,
  airbnbCostRate: 0.35,
  airbnbConfidence: 'low' as Confidence,
}

export type HousingScenario = 'sell' | 'rent' | 'airbnb'

export interface HousingOutcome {
  scenario: HousingScenario
  label: string
  /** Cash released at the point of the decision. Only selling produces any. */
  upfrontCash: number
  /** Net monthly effect on cash flow. Negative means the house still costs you. */
  monthlyNet: number
  /** Equity still held in the property at the end of three years, roughly. */
  equityRetainedAfter3y: number
  risks: string[]
  note: string
}

export function housingScenarios(house = HOUSE): HousingOutcome[] {
  const grossProceeds = house.marketValue * (1 - house.sellingCostRate)
  const sellNet = round2(grossProceeds - house.mortgageBalance)

  const rentGross = house.monthlyMarketRent
  const rentNet = round2(
    rentGross * (1 - house.managementRate - house.vacancyMaintenanceRate) - house.monthlyPayment,
  )

  const bnbGross = house.monthlyMarketRent * house.airbnbGrossMultiplier
  const bnbNet = round2(bnbGross * (1 - house.airbnbCostRate) - house.monthlyPayment)

  // Roughly 36 payments of principal. Deliberately crude and labelled as such.
  const principalOver3y = round2(house.monthlyPayment * 36 * 0.35)

  return [
    {
      scenario: 'sell',
      label: 'Sell',
      upfrontCash: sellNet,
      monthlyNet: house.monthlyPayment, // the payment stops, so it is a positive to cash flow
      equityRetainedAfter3y: 0,
      risks: [
        'Gives up an appreciating asset in a market you know.',
        'Sale must complete around a PCS-like move with no slack in the timing.',
      ],
      note: `Releases ${usd(sellNet)} and removes the ${usd(house.monthlyPayment)}/mo payment. The only option that produces cash for the move itself.`,
    },
    {
      scenario: 'rent',
      label: 'Rent it out',
      upfrontCash: 0,
      monthlyNet: rentNet,
      equityRetainedAfter3y: round2(house.marketValue - house.mortgageBalance + principalOver3y),
      risks: [
        'A bad tenant while you are in class is a genuine problem.',
        'Arrears history may complicate refinancing or a HELOC if you need cash fast.',
        'Rent estimate is mine, not a broker’s.',
      ],
      note: `Keeps the asset. After management and a vacancy reserve it runs ${rentNet >= 0 ? 'positive' : 'negative'} at ${usd(rentNet)}/mo.`,
    },
    {
      scenario: 'airbnb',
      label: 'Short-term let',
      upfrontCash: 0,
      monthlyNet: bnbNet,
      equityRetainedAfter3y: round2(house.marketValue - house.mortgageBalance + principalOver3y),
      risks: [
        'Highest variance of the three, and seasonal on the coast.',
        'Effectively a small business run remotely while in law school.',
        'Corpus Christi short-term regulations can change.',
        'The 1.6× gross multiplier is a guess and drives the whole result.',
      ],
      note: `Highest expected return at ${usd(bnbNet)}/mo, and the only option that adds a job to your 1L year.`,
    },
  ]
}

// ── Three-year projection ───────────────────────────────────────────────────

export interface YearProjection {
  year: number
  label: string
  mhaIncome: number
  housingScenarioIncome: number
  /** Drill pay, spouse income and the book stipend. */
  otherIncome: number
  totalIncome: number
  rent: number
  householdCosts: number
  tricare: number
  totalCosts: number
  net: number
  cumulative: number
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
   * Spouse income. THE LARGEST MISSING NUMBER IN THIS MODEL.
   *
   * Left at zero it makes every scenario look catastrophic, which is almost certainly
   * wrong: you are paying $1,500/mo for nannies, and families do not buy childcare so
   * that nobody works. Until you give me a figure, every deficit below is overstated
   * by twelve times whatever this actually is.
   */
  monthlySpouseIncome?: number
  /**
   * Reserve drill pay. You stay in the Reserves through school, so this continues.
   * Roughly four drills a month at E-6 over ten years, plus annual training.
   * MY ESTIMATE — confirm it.
   */
  monthlyDrillPay?: number
  /** Post-9/11 books and supplies stipend, paid annually. */
  annualBookStipend?: number
}

export function projectJd(
  school: LawSchool,
  scenario: HousingOutcome,
  inputs: JdInputs,
): JdProjection {
  const { startingCash, monthlyHousehold } = inputs
  const mhaMonths = inputs.mhaMonthsPerYear ?? 9
  const tricareStart = inputs.tricareStartsMonth ?? 1
  const spouseIncome = inputs.monthlySpouseIncome ?? 0
  const drillPay = inputs.monthlyDrillPay ?? 475
  const bookStipend = inputs.annualBookStipend ?? 1000

  const warnings: string[] = [
    'Every MHA and rent figure here is my estimate, flagged low confidence. Confirm before deciding.',
    'MHA is paid only for months in session — modelled at 9 of 12, not 12.',
    'Post-9/11 entitlement is 36 months against a 36-month degree; any month spent on the MAcc is a month not available here.',
    `Reserve drill pay modelled at ${usd(drillPay)}/mo — my estimate, confirm it.`,
  ]
  if (spouseIncome === 0) {
    warnings.push(
      'SPOUSE INCOME IS ZERO IN THIS RUN. That is almost certainly wrong — you pay for ' +
        'childcare, and families do not buy childcare so that nobody works. Every deficit ' +
        'below is overstated by twelve times whatever the real figure is.',
    )
  }
  if (scenario.scenario === 'sell') {
    warnings.push('Sale proceeds are counted once, in year 1. A sale that slips costs you the move.')
  }

  const years: YearProjection[] = []
  let cumulative = startingCash

  for (let year = 1; year <= 3; year++) {
    const mhaIncome = round2(school.monthlyMha * mhaMonths)
    const housingScenarioIncome =
      scenario.scenario === 'sell'
        ? year === 1
          ? round2(scenario.upfrontCash + scenario.monthlyNet * 12)
          : round2(scenario.monthlyNet * 12)
        : round2(scenario.monthlyNet * 12)

    const rent = round2(school.monthlyFamilyRent * 12)
    const householdCosts = round2(monthlyHousehold * 12)

    const tricareMonths = Math.max(0, Math.min(12, year * 12 - tricareStart + 1))
    const tricare = round2(TRICARE_SELECT_RESERVE.monthlyPremium * tricareMonths)

    const otherIncome = round2((spouseIncome + drillPay) * 12 + bookStipend)
    const totalIncome = round2(mhaIncome + housingScenarioIncome + otherIncome)
    const totalCosts = round2(rent + householdCosts + tricare)
    const net = round2(totalIncome - totalCosts)
    cumulative = round2(cumulative + net)

    years.push({
      year,
      label: `${year}L`,
      mhaIncome,
      housingScenarioIncome,
      otherIncome,
      totalIncome,
      rent,
      householdCosts,
      tricare,
      totalCosts,
      net,
      cumulative,
    })
  }

  return {
    school,
    scenario,
    startingCash,
    years,
    endingCash: cumulative,
    hazlewoodValue: round2(school.annualTuitionSticker * 3),
    warnings,
  }
}

// ── Balance sheet ───────────────────────────────────────────────────────────

export interface BalanceLine {
  label: string
  amount: number
  kind: 'asset' | 'liability'
}

/** From the Monarch export, 2026-08-05. Real figures. */
export const OPENING_BALANCE_SHEET: BalanceLine[] = [
  { label: '628 Chamberlain St, Corpus Christi', amount: 187400, kind: 'asset' },
  { label: '2013 Ford Expedition King Ranch', amount: 8898.59, kind: 'asset' },
  { label: 'Boat', amount: 8000, kind: 'asset' },
  { label: 'Share Savings', amount: 46.83, kind: 'asset' },
  { label: 'Schwab Checking', amount: 2.91, kind: 'asset' },
  { label: 'Joint Checking', amount: 2.2, kind: 'asset' },
  { label: 'Mortgage', amount: 162782.68, kind: 'liability' },
  { label: 'Goldman', amount: 22730, kind: 'liability' },
  { label: 'PSECU', amount: 10922, kind: 'liability' },
  { label: 'Chase', amount: 7290, kind: 'liability' },
  { label: 'Capital One', amount: 3489, kind: 'liability' },
  { label: 'Citi', amount: 1777, kind: 'liability' },
  { label: 'Car loan', amount: 1600, kind: 'liability' },
  { label: 'Platinum Card', amount: 1198.89, kind: 'liability' },
  { label: 'Brightway', amount: 568, kind: 'liability' },
  { label: 'Credit One', amount: 454, kind: 'liability' },
]

export interface BalanceSheet {
  asOf: LocalDate
  lines: BalanceLine[]
  assets: number
  liabilities: number
  netWorth: number
  /** Assets you could actually spend this week. */
  liquid: number
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
  return { asOf, lines, assets, liabilities, netWorth: round2(assets - liabilities), liquid }
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
