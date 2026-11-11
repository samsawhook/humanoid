/**
 * What the Wells Fargo checking statements actually show, 8 Jul – 6 Nov 2026.
 *
 * Transcribed from the four monthly statements you uploaded on 2026-11-11 — the
 * ending daily balance on every day the statement prints one, and every DFAS deposit.
 * No account numbers, no merchant locations: only what the plan needs.
 *
 * This is evidence, not plan. The plan says what SHOULD happen on each payday; this
 * says what DID happen between them — and between them is where the account keeps
 * going below zero.
 *
 * Pure data plus pure functions. No clock.
 */

import type { LocalDate } from '../types'

export interface DailyBalance {
  date: LocalDate
  balance: number
}

/** Ending daily balance, as printed. Days with no activity carry the previous figure. */
export const CHECKING_DAILY: DailyBalance[] = [
  // Statement ending 2026-08-07
  { date: '2026-07-08', balance: 1155.16 },
  { date: '2026-07-09', balance: 923.93 },
  { date: '2026-07-10', balance: 693.57 },
  { date: '2026-07-13', balance: 216.53 },
  { date: '2026-07-15', balance: 188.98 },
  { date: '2026-07-16', balance: 134.73 },
  { date: '2026-07-17', balance: 59.02 },
  { date: '2026-07-20', balance: -5.38 },
  { date: '2026-07-23', balance: 323.12 },
  { date: '2026-07-24', balance: 181.3 },
  { date: '2026-07-27', balance: 2.56 },
  { date: '2026-07-29', balance: -43.67 },
  { date: '2026-07-31', balance: 33.89 },
  { date: '2026-08-03', balance: 2.2 },
  // Statement ending 2026-09-08
  { date: '2026-08-12', balance: -997.8 },
  { date: '2026-08-13', balance: -1065.9 },
  { date: '2026-08-14', balance: 207.12 },
  { date: '2026-08-17', balance: -109.9 },
  { date: '2026-08-18', balance: -129.85 },
  { date: '2026-08-19', balance: 20.15 },
  { date: '2026-08-24', balance: 9.82 },
  { date: '2026-08-26', balance: 6.83 },
  { date: '2026-08-27', balance: -8.17 },
  { date: '2026-08-28', balance: -148.71 },
  { date: '2026-08-31', balance: -1893.55 },
  { date: '2026-09-01', balance: 1001.27 },
  { date: '2026-09-02', balance: 796.6 },
  { date: '2026-09-08', balance: 0.85 },
  // Statement ending 2026-10-07
  { date: '2026-09-11', balance: -999.15 },
  { date: '2026-09-14', balance: -1133.33 },
  { date: '2026-09-15', balance: 763.39 },
  { date: '2026-09-18', balance: 193.39 },
  { date: '2026-09-21', balance: 109.58 },
  { date: '2026-09-22', balance: 98.96 },
  { date: '2026-09-23', balance: -511.06 },
  { date: '2026-09-24', balance: -966.06 },
  { date: '2026-09-25', balance: 61.1 },
  { date: '2026-09-28', balance: 15.23 },
  { date: '2026-09-29', balance: -988.04 },
  { date: '2026-09-30', balance: -2715.61 },
  { date: '2026-10-01', balance: 1115.54 },
  { date: '2026-10-02', balance: 1141.54 },
  { date: '2026-10-05', balance: 1074.11 },
  { date: '2026-10-07', balance: 982.88 },
  // Statement ending 2026-11-06
  { date: '2026-10-08', balance: 972.85 },
  { date: '2026-10-09', balance: 732.26 },
  { date: '2026-10-13', balance: -63.54 },
  { date: '2026-10-14', balance: -2501.33 },
  { date: '2026-10-15', balance: 989.93 },
  { date: '2026-10-16', balance: 839.93 },
  { date: '2026-10-19', balance: 748.11 },
  { date: '2026-10-21', balance: 538.09 },
  { date: '2026-10-22', balance: 338.65 },
  { date: '2026-10-23', balance: 304.65 },
  { date: '2026-10-26', balance: 281.66 },
  { date: '2026-10-29', balance: -930.93 },
  { date: '2026-10-30', balance: 3024.17 },
  { date: '2026-11-02', balance: 856.14 },
  { date: '2026-11-03', balance: 816.85 },
  { date: '2026-11-04', balance: 830.87 },
  { date: '2026-11-05', balance: 246.45 },
]

/** Regular DFAS paycheck deposits since the deployed entitlements began. */
export const DFAS_PAYCHECKS: { date: LocalDate; amount: number; payday: 'first' | 'fifteenth' }[] = [
  { date: '2026-09-01', amount: 3304.69, payday: 'first' },
  { date: '2026-09-15', amount: 3326.25, payday: 'fifteenth' },
  { date: '2026-10-01', amount: 3957.59, payday: 'first' },
  { date: '2026-10-15', amount: 3491.26, payday: 'fifteenth' },
  { date: '2026-10-30', amount: 4005.1, payday: 'first' }, // 1 Nov, a Sunday
]

export interface Dip {
  start: LocalDate
  end: LocalDate
  low: number
  lowOn: LocalDate
}

/** Every run of consecutive printed days below zero. */
export function overdraftDips(days: DailyBalance[] = CHECKING_DAILY): Dip[] {
  const dips: Dip[] = []
  let cur: Dip | null = null
  for (const d of days) {
    if (d.balance < 0) {
      if (!cur) cur = { start: d.date, end: d.date, low: d.balance, lowOn: d.date }
      cur.end = d.date
      if (d.balance < cur.low) {
        cur.low = d.balance
        cur.lowOn = d.date
      }
    } else if (cur) {
      dips.push(cur)
      cur = null
    }
  }
  if (cur) dips.push(cur)
  return dips
}

/**
 * Share of a month's take-home that lands on the 1st, from the last two full months.
 * Observed ~53%: the 1st cheque runs about $480 above the 15th. The plan uses it so a
 * crowded 1st is not modelled as tighter than it really is.
 */
export function observedFirstShare(): number {
  const pairs: [number, number][] = [
    [3957.59, 3491.26], // Oct 1 / Oct 15
    [4005.1, 3491.26], // Nov 1 / Oct 15 (the Nov 15 cheque is not yet on a statement)
  ]
  const shares = pairs.map(([a, b]) => a / (a + b))
  return Math.round((shares.reduce((s, x) => s + x, 0) / shares.length) * 1000) / 1000
}

/** What the statements found that the plan has to answer. Each one is checked by a test. */
export const STATEMENT_FINDINGS = {
  /** Mortgage paid by check / card to the servicer: five at $1,381.79, one at $1,387.79. */
  mortgagePayment: 1381.79,
  mortgagePaymentsAugToNov: 6,
  /** $30 outgoing-wire fee on every Nth transfer (Sep, Oct, Nov). */
  wireFee: 30,
  /** Avant: two payments returned unpaid (Jul, Aug), $15 fee each; current since 1 Sep. */
  avantReturnedFees: 30,
  /** Not one payment to these in four months of statements. */
  unpaidFromThisAccount: ['Chase', 'Citi', 'Capital One'],
  /** No toll-authority payment anywhere in four months, after the back pay landed. */
  backPayLanded: { date: '2026-08-28', amount: 1359.46 },
} as const
