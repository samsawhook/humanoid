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
  const drillPay = inputs.monthlyDrillPay ?? 475
  const bookStipend = inputs.annualBookStipend ?? 1000

  const warnings: string[] = [
    'Every MHA and rent figure here is my estimate, flagged low confidence. Confirm before deciding.',
    'MHA is paid only for months in session — modelled at 9 of 12, not 12.',
    'Post-9/11 entitlement is 36 months against a 36-month degree; any month spent on the MAcc is a month not available here.',
    `Reserve drill pay modelled at ${usd(drillPay)}/mo — my estimate, confirm it.`,
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
    const mhaIncome = round2(school.monthlyMha * mhaMonths)
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

    const otherIncome = round2(drillPay * 12 + bookStipend)
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
