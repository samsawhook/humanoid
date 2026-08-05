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
    deployedMultiplier: 0.25,
    source: 'monarch',
    note: 'Mostly your labour and your trips to the store. Hard to spend while away.',
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
