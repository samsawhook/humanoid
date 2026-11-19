/**
 * A normal month once you are home — my BEST ESTIMATES, category by category, for Corpus
 * with your wife, a one-year-old and the house; known bills at their real amounts. Then,
 * working backwards: the gross pay and salary it takes to cover it after taxes and the 401(k).
 *
 * Pure data and arithmetic, so the page can recompute as you edit.
 */

import { federalTax } from './tax'

export interface BudgetLine {
  key: string
  label: string
  amount: number
  /** Why this number. */
  basis: string
}

export interface BudgetCategory {
  key: string
  label: string
  lines: BudgetLine[]
}

/**
 * VA disability compensation by rating, a veteran with a spouse and one child — about the
 * 2028 rates (2025 table, carried forward with COLAs). MY ESTIMATE of the tables; check
 * them against the VA's. Below 30% there is no extra for dependents.
 */
export const VA_MONTHLY: Record<number, number> = {
  0: 0,
  10: 186,
  20: 367,
  30: 645,
  40: 926,
  50: 1316,
  60: 1662,
  70: 2087,
  80: 2418,
  90: 2717,
  100: 4404,
}
/** VA is not paid for drill and AT days: ~39 a year. */
export const VA_DRILL_WAIVER = 39 / 365
export const vaNet = (rating: number) => Math.round((VA_MONTHLY[rating] ?? 0) * (1 - VA_DRILL_WAIVER))
export const DEFAULT_RATING = 30

/** Income that is not salary. */
export const OTHER_INCOME: BudgetLine[] = [
  { key: 'va', label: 'VA disability (net of drill days)', amount: vaNet(DEFAULT_RATING), basis: 'From the rating slider. Your range is 30–80%.' },
  {
    key: 'drill',
    label: 'Reserve drill pay (weekends only)',
    amount: 634.6,
    basis: 'One drill weekend a month: 4 drill periods at 1/30 of E-6 base ($4,759.50) = $634.60. Taxable. Annual training is not counted (your call, 19 Nov).',
  },
]

export const RETURN_BUDGET: BudgetCategory[] = [
  {
    key: 'home',
    label: 'Home',
    lines: [
      { key: 'mortgage', label: 'Mortgage (P&I + escrow)', amount: 1381.79, basis: 'Navy Federal, current payment.' },
      { key: 'utilities', label: 'Utilities — electric, water, gas, internet', amount: 0, basis: 'Sommer covers it, generally (your note, 19 Nov).' },
      { key: 'hvac', label: 'HVAC service plan', amount: 19.95, basis: 'Your plan, monthly.' },
      { key: 'upkeep', label: 'Upkeep & repairs (you mow)', amount: 150, basis: 'About 1% of the house value a year, less your own labour.' },
    ],
  },
  {
    key: 'car',
    label: 'Car',
    lines: [
      { key: 'insurance', label: 'GEICO', amount: 149.5, basis: '$69 every two weeks.' },
      { key: 'fuel', label: 'Fuel', amount: 250, basis: 'Two drivers home; Monarch showed $363 before, with more driving.' },
      { key: 'maintenance', label: 'Maintenance', amount: 75, basis: 'Oil, tyres, the odd repair, averaged.' },
    ],
  },
  {
    key: 'sent',
    label: 'Wife & Kids',
    lines: [
      { key: 'groceries', label: 'Groceries & household', amount: 0, basis: 'Sommer covers it, generally (your note, 19 Nov).' },
      { key: 'childcare', label: 'Childcare (one under five)', amount: 900, basis: 'Corpus daycare, if you both work. Drops to $0 if one of you is home.' },
      { key: 'kids', label: 'Kids — diapers, clothes, gear', amount: 250, basis: 'Per child under five.' },
      { key: 'household', label: 'Her spending & the household extras', amount: 300, basis: 'What the supplemental covers now.' },
    ],
  },
  {
    key: 'personal',
    label: 'Personal spending',
    lines: [
      { key: 'you', label: 'You — food out, clothes, shopping', amount: 600, basis: 'Your number (19 Nov).' },
      { key: 'tricare', label: 'Tricare Select Reserve (family)', amount: 263, basis: 'Your figure, with a little inflation.' },
      { key: 'gifts', label: 'Gifts & occasions', amount: 75, basis: 'Birthdays, anniversary, Christmas, averaged.' },
    ],
  },
  {
    key: 'tech',
    label: 'Tech',
    lines: [
      { key: 'phone', label: 'Phone (T-Mobile)', amount: 150, basis: 'Your number (19 Nov).' },
      { key: 'subs', label: 'Subscriptions — Claude, domain, site, email, iCloud', amount: 257.81, basis: 'Today’s list, after Super Grok and Apple TV+.' },
    ],
  },
  {
    key: 'debt',
    label: 'Debt payments',
    lines: [
      { key: 'avant', label: 'Avant', amount: 210, basis: 'Monthly payment.' },
      { key: 'chase', label: 'Chase plan', amount: 110, basis: 'Agreement.' },
      { key: 'cards_open', label: 'Cards — Platinum, Brightway, Credit One', amount: 105, basis: 'Minimums; Credit One $30 autopay.' },
      { key: 'cards_closed', label: 'Cards — Citi, Capital One', amount: 106, basis: 'Estimated minimums.' },
      { key: 'student', label: 'Federal student loan (Nelnet)', amount: 75.83, basis: 'Scheduled payment.' },
      { key: 'ut', label: 'UT loan (Dept of Education)', amount: 129, basis: '$9,907; the $129 plan.' },
    ],
  },
  {
    key: 'invest',
    label: 'Investing & saving',
    lines: [
      { key: 'nth', label: 'Nth Venture — your business', amount: 500, basis: 'Never skipped; ACH.' },
      { key: 'save', label: 'Emergency fund', amount: 300, basis: 'Toward three months of expenses.' },
      { key: 'ira', label: 'IRA', amount: 0, basis: 'After the cards are clear.' },
    ],
  },
]

export const EMPLOYEE_401K = 0.05
const FICA = 0.0765

export interface Solved {
  /** Salary, a year. */
  salary: number
  /** Gross a month: salary/12 + drill + VA. */
  grossMonthly: number
  taxes: number
  k401: number
}

/** Take-home in a month from a salary, given other income. */
export function monthlyCash(salary: number, other: { va: number; drill: number }, year = 2028): { cash: number; taxes: number; k401: number } {
  const wage = salary / 12
  const k401 = wage * EMPLOYEE_401K
  const taxable = (wage - k401 + other.drill) * 12
  const taxes = federalTax(taxable, year) / 12 + (wage + other.drill) * FICA
  return { cash: wage - k401 - taxes + other.drill + other.va, taxes, k401 }
}

/** The salary that just covers `spend` a month (everything but the 401k and taxes). */
export function salaryNeeded(spend: number, other: { va: number; drill: number }, year = 2028): Solved {
  let lo = 0
  let hi = 600000
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (monthlyCash(mid, other, year).cash >= spend) hi = mid
    else lo = mid
  }
  const { taxes, k401 } = monthlyCash(hi, other, year)
  return { salary: Math.round(hi), grossMonthly: Math.round(hi / 12 + other.drill + other.va), taxes: Math.round(taxes), k401: Math.round(k401) }
}

// ── Modifications: your base, then my estimates for each change ─────────────

/** What stays true whatever you pick (yours, not mine). */
export const PRINCIPLES = [
  'Nth: $500 a month, never skipped',
  'Debts on their schedule — nothing skipped to make room',
  'Sommer covers groceries and utilities',
  'The emergency fund keeps getting its $300',
  'The Corpus house is kept — let, if you move',
]

export type LocationKey = 'corpus' | 'houston' | 'dallas' | 'fortworth' | 'austin' | 'lubbock' | 'country'
export type ArrangementKey = 'hybrid' | 'remote' | 'office'
export type WorkKey = 'federal' | 'public' | 'small' | 'practice' | 'nightlaw' | 'lawschool'
export type DayJob = 'fed' | 'mid' | 'small'

export interface Selection {
  location: LocationKey
  arrangement: ArrangementKey
  work: WorkKey
  children: 1 | 2 | 3
  /** Still finishing the MAcc (through Dec 2027) while working. */
  macc: boolean
  /** Night law only: the day job. */
  dayJob?: DayJob
}

/** Each return scenario as a set of modifications to your base month. */
export const SCENARIO_PRESETS: Record<string, Selection> = {
  law_ttu: { location: 'lubbock', arrangement: 'office', work: 'lawschool', children: 1, macc: false },
  law_uh: { location: 'houston', arrangement: 'office', work: 'lawschool', children: 1, macc: false },
  law_unt: { location: 'dallas', arrangement: 'office', work: 'lawschool', children: 1, macc: false },
  law_tamu: { location: 'fortworth', arrangement: 'office', work: 'lawschool', children: 1, macc: false },
  ...Object.fromEntries(
    (['uh', 'unt'] as const).flatMap((k) =>
      (['fed', 'mid', 'small'] as const).map((j) => [
        `night_${k}_${j}`,
        { location: k === 'uh' ? 'houston' : 'dallas', arrangement: j === 'fed' ? 'hybrid' : 'office', work: 'nightlaw', children: 1, macc: false, dayJob: j } as Selection,
      ]),
    ),
  ),
  cpa_fed: { location: 'corpus', arrangement: 'hybrid', work: 'federal', children: 1, macc: false },
  cpa_mid: { location: 'corpus', arrangement: 'office', work: 'public', children: 1, macc: false },
  cpa_small: { location: 'corpus', arrangement: 'office', work: 'small', children: 1, macc: false },
  cpa_sole: { location: 'corpus', arrangement: 'remote', work: 'practice', children: 1, macc: false },
  cpa_country: { location: 'country', arrangement: 'remote', work: 'federal', children: 1, macc: false },
}
export const sameSelection = (a: Selection, b: Selection) =>
  a.location === b.location && a.arrangement === b.arrangement && a.work === b.work && a.children === b.children && a.macc === b.macc && (a.dayJob ?? null) === (b.dayJob ?? null)
export const BASE_SELECTION: Selection = { location: 'corpus', arrangement: 'hybrid', work: 'federal', children: 1, macc: false }

export const LOCATION_LABEL: Record<LocationKey, string> = {
  corpus: 'Corpus (base)',
  houston: 'Houston',
  dallas: 'Dallas',
  fortworth: 'Fort Worth',
  austin: 'Austin',
  lubbock: 'Lubbock',
  country: 'Countryside',
}
export const ARRANGEMENT_LABEL: Record<ArrangementKey, string> = { hybrid: 'Hybrid (base)', remote: 'Remote', office: 'Office, 5 days' }
export const WORK_LABEL: Record<WorkKey, string> = {
  federal: 'Federal / contractor, 40 hrs (base)',
  public: 'Mid-size public firm (busy season)',
  small: 'Small local firm',
  practice: 'Your own practice',
  nightlaw: 'Day job + night law',
  lawschool: 'Full-time law school',
}

/** MY ESTIMATES, monthly, 2027–28 dollars, for a family with one child under five. */
const CITY: Record<LocationKey, { rent: number; childcare: number; driving: number; insurance: number; parking: number; pay: number; mha: number }> = {
  corpus: { rent: 0, childcare: 900, driving: 0, insurance: 0, parking: 0, pay: 1, mha: 1400 },
  houston: { rent: 2300, childcare: 1200, driving: 100, insurance: 40, parking: 120, pay: 1.06, mha: 2100 },
  dallas: { rent: 2400, childcare: 1250, driving: 100, insurance: 35, parking: 110, pay: 1.08, mha: 2150 },
  fortworth: { rent: 2100, childcare: 1150, driving: 80, insurance: 25, parking: 60, pay: 1.04, mha: 2000 },
  austin: { rent: 2700, childcare: 1400, driving: 60, insurance: 20, parking: 150, pay: 1.1, mha: 2300 },
  lubbock: { rent: 1250, childcare: 850, driving: -30, insurance: -10, parking: 0, pay: 0.95, mha: 1450 },
  country: { rent: 1500, childcare: 700, driving: 200, insurance: -10, parking: 0, pay: 1, mha: 1170 },
}
/** The Corpus house let: $1,705 market rent less management, vacancy and the landlord's tax and insurance. */
const CORPUS_RENT_NET = 1250

export interface BridgeRow {
  group: 'Location' | 'Remote / office' | 'Type of work' | 'Children' | 'School'
  label: string
  amount: number
  why: string
}

export interface Bridge {
  rows: BridgeRow[]
  /** Income changes (GI Bill housing on the law options). */
  income: BridgeRow[]
  /** Pay in this city relative to Corpus — the offers scale by it. */
  payScale: number
  /** No salary: full-time school. The result is a monthly gap, not a salary. */
  noSalary: boolean
}

/**
 * `loans`: what the base pays on the two student loans — deferred while you are in any
 * school (your rule, 19 Nov), so a school option takes them back out.
 */
export function buildBridge(sel: Selection, loans: { student: number; ut: number } = { student: 75.83, ut: 129 }): Bridge {
  const c = CITY[sel.location]
  const rows: BridgeRow[] = []
  const income: BridgeRow[] = []
  const add = (group: BridgeRow['group'], label: string, amount: number, why: string) => {
    if (Math.abs(amount) > 0.004) rows.push({ group, label, amount: Math.round(amount * 100) / 100, why })
  }
  if (sel.location !== 'corpus') {
    add('Location', `Rent — ${LOCATION_LABEL[sel.location]}`, c.rent, 'A family-sized place; the mortgage keeps being paid.')
    add('Location', 'Corpus house let (net)', -CORPUS_RENT_NET, '$1,705 market rent, less management, vacancy and the landlord tax and insurance.')
    add('Location', 'Childcare — city rate', c.childcare - 900, `Daycare for one under five runs ~$${c.childcare} here vs $900 in Corpus.`)
    add('Location', 'Driving', c.driving, sel.location === 'country' ? 'Longer drives for everything.' : 'Bigger city, longer drives.')
    add('Location', 'Car insurance', c.insurance, 'Rates by ZIP.')
  }
  if (sel.arrangement === 'remote') add('Remote / office', 'No commute', -120, 'Fuel and wear, five days a week, gone.')
  if (sel.arrangement === 'office') {
    add('Remote / office', 'Lunches & coffee out', 120, 'Five office days a week.')
    add('Remote / office', 'Work clothes', 40, 'Averaged.')
    add('Remote / office', 'Commute fuel', 60, 'Two more days a week than hybrid.')
    add('Remote / office', 'Parking', c.parking, c.parking ? 'Downtown parking.' : 'Free parking.')
  }
  let noSalary = false
  if (sel.work === 'public') {
    add('Type of work', 'Evening & Saturday sitter in busy season', 330, '~$1,000 a month January to April, averaged over the year — the nanny can’t cover 60-hour weeks.')
    add('Type of work', 'Meals out in busy season', 50, 'Averaged.')
  }
  if (sel.work === 'small') {
    add('Type of work', 'Extra sitter hours in tax season', 150, 'Longer weeks February to April, averaged — lighter than a public firm’s busy season.')
  }
  if (sel.work === 'practice') {
    // The practice's own costs (≈35% of fees) are the business's, not the household's:
    // the salary needed here is the practice's PROFIT.
    add('Type of work', 'Childcare — part-time', -300, 'Your own hours: part-time care instead of full-time.')
  }
  if (sel.work === 'nightlaw') {
    add('Type of work', 'Evening sitter, class nights', 500, 'Three or four nights a week while Sommer works or needs a break.')
    add('Type of work', 'Books & fees', 50, 'Hazlewood covers tuition.')
    if (sel.dayJob === 'mid') add('Type of work', 'Busy-season sitter on top of class nights', 330, 'A public firm’s January–April hours, averaged over the year.')
    if (sel.dayJob === 'small') add('Type of work', 'Extra sitter hours in tax season', 150, 'Averaged over the year.')
    income.push({ group: 'Type of work', label: 'GI Bill housing, part-time (averaged)', amount: Math.round(c.mha * 0.8 * 0.8 * 0.75), why: 'MHA at the 80% tier and part-time rate, paid September–May.' })
  }
  if (sel.work === 'lawschool') {
    noSalary = true
    add('Type of work', 'Study-hours sitter', 250, 'Evenings and weekends before exams.')
    add('Type of work', 'Books & fees', 80, 'Hazlewood covers tuition.')
    income.push({ group: 'Type of work', label: 'GI Bill housing (averaged)', amount: Math.round(c.mha * 0.8 * 0.75), why: 'MHA at the 80% tier, paid September–May.' })
  }
  const inSchool = sel.macc || sel.work === 'nightlaw' || sel.work === 'lawschool'
  if (inSchool) {
    const why = sel.macc && sel.work !== 'nightlaw' && sel.work !== 'lawschool' ? 'Enrolled in the MAcc: in-school deferment.' : 'Enrolled in law school: in-school deferment.'
    add('School', 'Federal student loan (Nelnet) — deferred', -loans.student, why)
    add('School', 'UT loan (Dept of Education) — deferred', -loans.ut, why)
  }
  if (sel.children > 1) {
    const n = sel.children - 1
    add('Children', `${n} more child${n > 1 ? 'ren' : ''} — childcare`, c.childcare * n * (sel.work === 'practice' ? 0.67 : 1), 'Another full-time place each.')
    add('Children', `${n} more — diapers, clothes, gear`, 250 * n, 'Per child under five.')
    add('Children', 'Bigger groceries — Sommer’s side', 0, 'Groceries stay with Sommer; noted, not counted.')
  }
  return { rows, income, payScale: c.pay, noSalary }
}
