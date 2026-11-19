/**
 * What has actually been paid, against the plan.
 *
 * Fed by hand from your bank screenshots and from Monarch (Wells Fargo does not reach
 * Monarch's API: those accounts sync through a provider it will not share). Each payment
 * is matched to the plan line or one-off it pays, and to the paycheck whose money it came
 * out of, so the payday cards can show spent-to-date against budget.
 *
 * Privacy: descriptions are generic. No card numbers, and no merchant names that would
 * place you (the deployment location stays out of the repo).
 */

import type { LocalDate } from '../types'

export const ACTUALS_AS_OF = {
  date: '2026-11-18' as LocalDate,
  time: '21:12',
  source: 'Wells Fargo app screenshot (Joint Checking)',
  /** Available balance the bank showed at that moment. */
  availableBalance: 845.14,
}

export interface Actual {
  date: LocalDate
  amount: number
  description: string
  /** The plan line it pays (an obligation key), or… */
  lineKey?: string
  /** …the one-off it is (a ONE_OFFS key). */
  oneOffKey?: string
  /** For "your own spending": phone, software, entertainment, personal_local, home_services, fuel. */
  sub?: string
  /** scheduledDate of the paycheck whose money it came out of. */
  payday: LocalDate
  status: 'posted' | 'pending'
}

export const ACTUALS: Actual[] = [
  // ── From your 14 Nov screenshots (the Nov 15 pay was spendable from 11 Nov) ──
  {
    date: '2026-11-12',
    amount: 1000,
    description: 'Venmo to Sommer — nanny (authorized 11 Nov)',
    lineKey: 'support_home_deployed',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-09',
    amount: 25,
    description: 'Brightway (Mastercard ending 28)',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-10',
    amount: 47,
    description: 'Online transfer to WF Platinum card',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-12',
    amount: 80,
    description: 'Lawn service (Cash App)',
    lineKey: 'lawn_2026_11_15',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-12',
    amount: 19.95,
    description: 'HVAC service plan',
    lineKey: 'living_deployed',
    sub: 'home_services',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-12',
    amount: 6.54,
    description: 'Local purchase',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-13',
    amount: 35,
    description: 'Cash App transfers ($10 + $25)',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-16',
    amount: 289.16,
    description: 'T-Mobile — past-due balance',
    lineKey: 'phone',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-17',
    amount: 192.06,
    description: 'The Company Store — anniversary robe',
    oneOffKey: 'anniversary_robe',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-18',
    amount: 799.21,
    description: 'Westlake — auto loan payoff',
    lineKey: 'car_payoff_now',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-18',
    amount: 178.62,
    description: 'Florist — anniversary flowers',
    oneOffKey: 'anniversary_flowers',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-18',
    amount: 41.63,
    description: 'AAFES (PX)',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-18',
    amount: 3.06,
    description: 'Local purchase',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-18',
    amount: 74,
    description: 'GEICO — policy start',
    oneOffKey: 'geico_start',
    payday: '2026-11-15',
    status: 'pending',
  },
]

/** Spent so far against one plan line or one-off, on one paycheck. */
export function spentOn(payday: LocalDate, key: string, actuals: Actual[] = ACTUALS): number {
  return (
    Math.round(
      actuals
        .filter((a) => a.payday === payday && (a.lineKey === key || a.oneOffKey === key))
        .reduce((s, a) => s + a.amount, 0) * 100,
    ) / 100
  )
}

/** The transactions behind a line (or one-off) on one paycheck, oldest first. */
export function actualsFor(payday: LocalDate, key: string, actuals: Actual[] = ACTUALS): Actual[] {
  return actuals
    .filter((a) => a.payday === payday && (a.lineKey === key || a.oneOffKey === key))
    .sort((x, y) => (x.date < y.date ? -1 : 1))
}
