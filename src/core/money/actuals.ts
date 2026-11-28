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
  date: '2026-11-28' as LocalDate,
  time: '09:28',
  source: 'Wells Fargo app screenshot (Joint Checking)',
  /** Available balance the bank showed at that moment. */
  availableBalance: 3054.07,
}

/**
 * Money back from friends — a Venmo or Cash App payment in, or a cash-out from your own
 * Cash App balance — is entered as a NEGATIVE amount on the personal line it pays back
 * (your rule, 19 Nov): it counts against personal spending, not as income, and gets no
 * category of its own.
 */
export interface Actual {
  date: LocalDate
  amount: number
  description: string
  /** The plan line it pays (an obligation key), or… */
  lineKey?: string
  /** …the one-off it is (a ONE_OFFS key). */
  oneOffKey?: string
  /** For "your own spending": software, entertainment, personal_local, fuel. */
  sub?: string
  /** scheduledDate of the paycheck whose money it came out of. */
  payday: LocalDate
  /**
   * Paid toward this paycheck's line before its pay landed, so already out of the balance
   * the card starts from (this month's card minimums, paid 9–10 Nov). Counts against the
   * line's budget; not counted again as going out of checking.
   */
  beforeStart?: boolean
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
    description: 'Brightway — minimum',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    beforeStart: true,
    status: 'posted',
  },
  {
    date: '2026-11-10',
    amount: 47,
    description: 'WF Platinum — transfer',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    beforeStart: true,
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
    lineKey: 'hvac_plan',
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
    description: 'T-Mobile — October bill, past due',
    lineKey: 'tmobile_past_due',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-16',
    amount: 28,
    description: 'WF Platinum card — autopay',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    status: 'posted',
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
    status: 'posted',
  },
  {
    date: '2026-11-18',
    amount: 178.62,
    description: 'Florist — anniversary flowers',
    oneOffKey: 'anniversary_flowers',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-18',
    amount: 41.63,
    description: 'AAFES (PX)',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-18',
    amount: 3.06,
    description: 'Local purchase',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    // Posted 19 Nov. The 18 Nov $74 "hold" was never a second charge: the bank's daily
    // balances (12–19 Nov statement, 21 Nov) show only this one.
    date: '2026-11-19',
    amount: 74.77,
    description: 'GEICO — policy start',
    oneOffKey: 'geico_start',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-20',
    amount: 54.2,
    description: 'Electronics store',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-20',
    amount: 29.96,
    description: 'Barber',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-20',
    amount: 22.88,
    description: 'Five Guys',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  // ── 23 Nov screenshot: $663.33 − 210.02 − 255.35 = $197.96 available ──
  {
    // Paid by card (the only one that would load) after paying the card $74 first —
    // this transfer (your note and 22:33 screenshot, 23 Nov). $197.96 − 74 = $123.96.
    date: '2026-11-23',
    amount: 74,
    description: 'Texas registration — paid by card, card prepaid by transfer',
    oneOffKey: 'tx_registration',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    date: '2026-11-23',
    amount: 210.02,
    description: 'Avant — monthly payment (ACH, 20 Nov)',
    lineKey: 'avant_payment',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    date: '2026-11-23',
    amount: 255.35,
    description: 'T-Mobile — November bill (autopay)',
    lineKey: 'phone_nov',
    payday: '2026-11-15',
    status: 'pending',
  },

  // ── 28 Nov screenshot: $123.96 − 30 − 1,000 − 22 − 20 − 2.99 + 4,005.10 = $3,054.07 ──
  {
    date: '2026-11-24',
    amount: 30,
    description: 'Credit One — autopay',
    lineKey: 'card_minimums_open',
    payday: '2026-11-15',
    status: 'posted',
  },
  {
    // Venmo to a friend: from the 15 Nov cheque's personal money still unspent.
    date: '2026-11-27',
    amount: 20,
    description: 'Venmo to a friend',
    lineKey: 'living_deployed',
    sub: 'personal_local',
    payday: '2026-11-15',
    status: 'pending',
  },
  {
    // Starlink, paid by Venmo (your note, 28 Nov): its own monthly tech line.
    date: '2026-11-27',
    amount: 22,
    description: 'Starlink (via Venmo)',
    lineKey: 'starlink',
    payday: '2026-12-01',
    status: 'pending',
  },
  {
    date: '2026-11-27',
    amount: 1000,
    description: 'Venmo to Sommer — nanny',
    lineKey: 'support_home_deployed',
    payday: '2026-12-01',
    status: 'pending',
  },
  {
    date: '2026-11-27',
    amount: 2.99,
    description: 'Apple — subscription',
    lineKey: 'subscriptions',
    payday: '2026-12-01',
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
