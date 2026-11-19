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

/** Income that is not salary. */
export const OTHER_INCOME: BudgetLine[] = [
  { key: 'va', label: 'VA disability (50%, net of drill days)', amount: 1175, basis: 'Your range is 30–80%; 50% for a veteran with a spouse and child ≈ $1,316, less ~$141 waived for drill and AT days.' },
  { key: 'drill', label: 'Reserve drill pay', amount: 475, basis: 'One weekend a month plus AT, averaged. Taxable.' },
]

export const RETURN_BUDGET: BudgetCategory[] = [
  {
    key: 'home',
    label: 'Home',
    lines: [
      { key: 'mortgage', label: 'Mortgage (P&I + escrow)', amount: 1381.79, basis: 'Navy Federal, current payment.' },
      { key: 'utilities', label: 'Utilities — electric, water, gas, internet', amount: 350, basis: 'Corpus summers run electric to $250+; water ~$80; internet ~$70. Averaged.' },
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
      { key: 'groceries', label: 'Groceries & household', amount: 900, basis: 'Family of three, moderate food plan, plus household goods.' },
      { key: 'childcare', label: 'Childcare (one under five)', amount: 900, basis: 'Corpus daycare, if you both work. Drops to $0 if one of you is home.' },
      { key: 'kids', label: 'Kids — diapers, clothes, gear', amount: 250, basis: 'Per child under five.' },
      { key: 'household', label: 'Her spending & the household extras', amount: 300, basis: 'What the supplemental covers now.' },
    ],
  },
  {
    key: 'personal',
    label: 'Personal spending',
    lines: [
      { key: 'you', label: 'You — food out, clothes, shopping', amount: 400, basis: 'Above the deployed rate; well under the $2,834 Monarch average before.' },
      { key: 'tricare', label: 'Tricare Select Reserve (family)', amount: 263, basis: 'Your figure, with a little inflation.' },
      { key: 'gifts', label: 'Gifts & occasions', amount: 75, basis: 'Birthdays, anniversary, Christmas, averaged.' },
    ],
  },
  {
    key: 'tech',
    label: 'Tech',
    lines: [
      { key: 'phone', label: 'Phone (T-Mobile)', amount: 120.71, basis: 'Plan $100 + Protection $20.71; iPhone paid off, pass cancelled.' },
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
