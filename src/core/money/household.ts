/**
 * Household spending, by category, with a deployed profile.
 *
 * Monthly figures are the real twelve-month average from your Monarch export
 * (Aug 2025 – Jul 2026) and are marked `monarch`. The **deployed multipliers are my
 * estimates** — they are the judgement call in this file, and they move the whole
 * deployment projection. Correct them and everything downstream follows.
 *
 * The logic behind them: while you are deployed the Army feeds and houses you, so
 * your personal consumption collapses (restaurants, gas, coffee, auto wear) while the
 * household's continues largely unchanged (groceries, utilities, phone, pets, kids).
 *
 * Debt payments, mortgage and transfers are deliberately NOT here — they are
 * obligations with their own lines in obligations.ts, and counting them twice was the
 * easiest mistake available.
 */

export type FigureSource = 'monarch' | 'estimate'

export interface ExpenseCategory {
  key: string
  label: string
  /** Twelve-month monthly average at home. */
  monthlyHome: number
  /** Multiplier while deployed. 1 = unchanged, 0 = stops entirely. */
  deployedMultiplier: number
  source: FigureSource
  note?: string
}

/**
 * Support sent home is tracked separately, not as a category.
 *
 * In Monarch this is the "Gifts" line — $754/mo over the last twelve months, the
 * single largest discretionary outflow in your history and larger than groceries,
 * utilities and phone combined.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  DOUBLE-COUNT WARNING. Groceries run only $141/mo in these accounts, which is far
 *  too low for a family — so your wife's spending almost certainly happens outside
 *  them, funded by this transfer. On that reading this is a real outflow and the
 *  category list below covers only YOUR side, which is how it is modelled.
 *
 *  If instead her spending already appears in these accounts, this line is an
 *  internal transfer and counting it is double-counting roughly $9k a year. Tell me
 *  which and I will fix it in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SUPPORT_HOME = {
  key: 'support_home',
  label: 'Support sent home',
  monthlyHome: 754,
  /** Rises while deployed: it becomes the primary funding channel, not a top-up. */
  deployedMultiplier: 1.4,
  source: 'monarch' as FigureSource,
  note: 'Monarch "Gifts", 12-month average. See the double-count warning in household.ts.',
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    key: 'restaurants',
    label: 'Restaurants & bars',
    monthlyHome: 454,
    deployedMultiplier: 0.2,
    source: 'monarch',
    note: '185 transactions a year. Collapses on a DFAC.',
  },
  {
    key: 'cash_atm',
    label: 'Cash & ATM',
    monthlyHome: 461,
    deployedMultiplier: 0.3,
    source: 'monarch',
    note: 'Untracked by definition — the least trustworthy line here, and not small.',
  },
  {
    key: 'gas',
    label: 'Fuel',
    monthlyHome: 363,
    deployedMultiplier: 0.35,
    source: 'monarch',
    note: '160 fill-ups a year across two drivers; one of them leaves.',
  },
  {
    key: 'home_improvement',
    label: 'Home improvement',
    monthlyHome: 281,
    /**
     * RISES while deployed — your correction, and it makes sense two ways: work you
     * would have done yourself has to be paid for, and deployment income is what
     * finally funds the deferred jobs. 1.5× is my figure for that, not yours.
     *
     * It matters more than it looks: the house has to be sold, let or short-let in a
     * year, and every one of those needs it presentable. This is the only category
     * here that is arguably an investment rather than a cost.
     */
    deployedMultiplier: 1.5,
    source: 'monarch',
    note: 'Rises: your labour has to be bought, and the house has to be ready to sell or let.',
  },
  {
    key: 'shopping',
    label: 'Shopping',
    monthlyHome: 192,
    deployedMultiplier: 0.7,
    source: 'monarch',
  },
  {
    key: 'travel',
    label: 'Travel & vacation',
    monthlyHome: 172,
    deployedMultiplier: 0.4,
    source: 'monarch',
    note: 'R&R travel is real but less than a family holiday.',
  },
  {
    key: 'subscriptions',
    label: 'Digital subscriptions',
    monthlyHome: 161,
    deployedMultiplier: 0.9,
    source: 'monarch',
    note: '90 charges a year. Worth an audit before you go — this is free money.',
  },
  {
    key: 'phone',
    label: 'Phone',
    monthlyHome: 157,
    deployedMultiplier: 1,
    source: 'monarch',
    note: 'Check whether a line can be suspended at the deployed rate.',
  },
  {
    key: 'groceries',
    label: 'Groceries',
    monthlyHome: 141,
    deployedMultiplier: 1.15,
    source: 'monarch',
    note: 'Rises: eating out at home partly converts to cooking.',
  },
  {
    key: 'uncategorized',
    label: 'Uncategorised',
    monthlyHome: 126,
    deployedMultiplier: 0.6,
    source: 'monarch',
    note: '58 transactions a year with no category. Worth ten minutes in Monarch.',
  },
  {
    key: 'auto_maintenance',
    label: 'Auto maintenance',
    monthlyHome: 122,
    deployedMultiplier: 0.5,
    source: 'monarch',
  },
  {
    key: 'financial_fees',
    label: 'Financial fees',
    monthlyHome: 49,
    deployedMultiplier: 0.4,
    source: 'monarch',
    note: '39 fees a year — overdraft and late charges. These should approach zero once current.',
  },
  {
    key: 'pets',
    label: 'Pets',
    monthlyHome: 44,
    deployedMultiplier: 1,
    source: 'monarch',
  },
  {
    key: 'clothing',
    label: 'Clothing',
    monthlyHome: 33,
    deployedMultiplier: 0.7,
    source: 'monarch',
  },
  {
    key: 'utilities',
    label: 'Utilities (gas, electric, water)',
    monthlyHome: 21,
    deployedMultiplier: 1,
    source: 'monarch',
    note: 'Suspiciously low — likely paid from an account not in the export. VERIFY.',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    monthlyHome: 23,
    deployedMultiplier: 1,
    source: 'monarch',
    note: 'Also suspiciously low. Auto insurance alone usually exceeds this.',
  },
  {
    key: 'entertainment',
    label: 'Entertainment & recreation',
    monthlyHome: 16,
    deployedMultiplier: 0.7,
    source: 'monarch',
  },
  {
    key: 'coffee',
    label: 'Coffee shops',
    monthlyHome: 12,
    deployedMultiplier: 0.2,
    source: 'monarch',
  },
  {
    key: 'medical',
    label: 'Medical',
    monthlyHome: 7,
    deployedMultiplier: 1,
    source: 'monarch',
    note: 'Near zero on active-duty Tricare. Rises sharply after — see TRICARE_SELECT_RESERVE.',
  },
]

/**
 * Tricare Select Reserve, which starts roughly six months after redeployment when
 * active-duty coverage lapses. A step change the plan has to carry.
 */
export const TRICARE_SELECT_RESERVE = {
  monthlyPremium: 260,
  source: 'estimate' as FigureSource,
  note: 'Your figure. Family premium; confirm the current rate before relying on it.',
}

export type SpendingProfile = 'home' | 'deployed'

export function monthlyFor(category: ExpenseCategory, profile: SpendingProfile): number {
  const amount =
    profile === 'deployed'
      ? category.monthlyHome * category.deployedMultiplier
      : category.monthlyHome
  return Math.round(amount * 100) / 100
}

export interface HouseholdTotals {
  profile: SpendingProfile
  categories: { category: ExpenseCategory; monthly: number; delta: number }[]
  categoryTotal: number
  support: number
  total: number
  /** Per semi-monthly paycheck, which is how obligations.ts consumes it. */
  perPaycheck: number
}

export function householdTotals(
  profile: SpendingProfile,
  categories: ExpenseCategory[] = EXPENSE_CATEGORIES,
): HouseholdTotals {
  const rows = categories.map((category) => {
    const monthly = monthlyFor(category, profile)
    return { category, monthly, delta: Math.round((monthly - category.monthlyHome) * 100) / 100 }
  })

  const categoryTotal = round2(rows.reduce((s, r) => s + r.monthly, 0))
  const support = round2(
    profile === 'deployed'
      ? SUPPORT_HOME.monthlyHome * SUPPORT_HOME.deployedMultiplier
      : SUPPORT_HOME.monthlyHome,
  )
  const total = round2(categoryTotal + support)

  return {
    profile,
    categories: rows,
    categoryTotal,
    support,
    total,
    perPaycheck: round2(total / 2),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Deployed actuals ────────────────────────────────────────────────────────

/**
 * What actually leaves YOUR accounts while deployed, by category — observed, not
 * modelled. Supersedes the deployed multipliers above for the live budget; those stay
 * because the law-school projection still needs a home-profile estimate.
 *
 * Source: Monarch cash flow, September–October 2026 (two full deployed months) plus
 * 1–10 November, read 2026-11-11. Two months is thin — below the four periods D1 asks
 * for before trusting demonstrated over declared — so every row says what it is built
 * from, and one-offs are named rather than averaged in.
 *
 * Not in here, because each is its own obligation: mortgage, car, Avant, Chase, card
 * minimums, Nth Investments, and money sent home. Groceries, utilities, pets and the
 * nannies are paid at home out of the $1,000 you send every payday, so they are not
 * your categories any more.
 */
export interface ObservedCategory {
  key: string
  label: string
  monthly: number
  basis: string
}

export const DEPLOYED_ACTUALS: ObservedCategory[] = [
  {
    key: 'subscriptions',
    label: 'Digital subscriptions',
    monthly: 225,
    basis:
      'Sep $117, Oct $226, Nov $255 by the 10th. Hugedomains $99.79/mo (sawhook.com — keeping), Anthropic $106.60, ' +
      'Squarespace $26.65, Google Workspace, Apple. Rising — worth an audit.',
  },
  {
    key: 'personal',
    label: 'Personal (PX, local purchases)',
    monthly: 220,
    basis: 'Sep $264, Oct $173. Mostly in-theatre purchases.',
  },
  {
    key: 'phone',
    label: 'Phone (T-Mobile)',
    monthly: 173,
    basis: '$345.78 in September covering two months; nothing posted in October.',
  },
  {
    key: 'restaurants',
    label: 'Restaurants, coffee, delivery',
    monthly: 100,
    basis: 'Sep $132, Oct $63, Nov $25 so far.',
  },
  {
    key: 'clothing',
    label: 'Clothing and shopping',
    monthly: 90,
    basis: 'Nothing in Sep–Oct, $267 in early November (Adidas, Levi’s). Averaged across the three.',
  },
  {
    key: 'home_improvement',
    label: 'Home services',
    monthly: 20,
    basis: 'CCAC heating and cooling plan, $19.95/mo. A $120 one-off in September is excluded.',
  },
  {
    key: 'entertainment',
    label: 'Entertainment and travel',
    monthly: 70,
    basis: 'Sep $11, Oct $133 (pass days). Leave or R&R will move this.',
  },
  {
    key: 'business',
    label: 'Business expenses',
    monthly: 50,
    basis: 'Oct $54, Nov $48.',
  },
  {
    key: 'financial_fees',
    label: 'Fees and services',
    monthly: 40,
    basis:
      'Oct: $67 fee and the $106 Monarch annual. A $185 September charge (US Patriot) is ' +
      'excluded as gear, not a fee. Fees should fall toward zero once the mortgage is current.',
  },
  {
    key: 'gas',
    label: 'Fuel',
    monthly: 10,
    basis: 'About $10 a month.',
  },
]

export function deployedActualsTotal(rows: ObservedCategory[] = DEPLOYED_ACTUALS): number {
  return round2(rows.reduce((s, r) => s + r.monthly, 0))
}

/**
 * Money sent home. Your figures, 2026-11-11, and they replace both the nanny line and
 * the 1.4× "support home" estimate: one $1,000 transfer every payday covers the
 * nannies and the household.
 *
 * Extras are sporadic — Christmas, a trip, a specific problem — and you do not budget
 * them, but they happen: $365 in September, $425 in October, $500 so far in November
 * ($150 + $150 for Christmas, $200 for the trip). A plan that leaves them out is a plan
 * that is short every month, so they get an observed allowance rather than zero.
 */
export const SENT_HOME = {
  /**
   * $1,200 every payday from 13 Nov 2026 — the nanny is now $2,400/mo, your figure, and
   * the transfer covers the nanny and the household together. Was $1,000.
   */
  perPaycheck: 1200,
  extrasMonthly: 400,
  extrasBasis: 'Observed: Sep $365, Oct $425, Nov $500 by the 11th. Not budgeted by you; modelled so it is not a surprise.',
}
