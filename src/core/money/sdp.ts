/**
 * The Savings Deposit Program — the best risk-free return you will ever be offered,
 * and a textbook window (LIFE_DASH.md, "Windows, not just deadlines").
 *
 * 10 U.S.C. § 1035. While deployed to a designated area and drawing IDP/HFP, a member
 * may deposit up to $10,000 with DoD and earn 10% a year, compounded quarterly. There
 * is no market risk and no catch. The window is what makes it rare:
 *
 *  - **Opens** after 30 consecutive days in theatre (you are well past it).
 *  - **Deposits stop** when you leave theatre. Money not deposited by then can never be.
 *  - **Interest keeps accruing for 90 days** after you leave, then stops.
 *  - **Paid out automatically** within 120 days of leaving — straight into your account,
 *    which is exactly when the deployment income stops. The SDP is not just a yield;
 *    it is the cushion for coming home, earning 10% while it waits.
 *  - **Emergency withdrawal** is possible with command approval, so it is not locked —
 *    but it is not a checking account either. The cash buffer stays in cash.
 *
 * Deposits: by allotment in myPay, or cash/cheque at the finance office. Confirm
 * eligibility with finance before the first one; nothing here is a substitute for that.
 *
 * Pure. Every date comes in as an argument.
 */

import type { LocalDate } from '../types'
import { addLocalDays, localDaysBetween } from '../time/localDay'
import { round2 } from './paychecks'
import { TIMELINE } from './rates'

export const SDP_CAP = 10_000
export const SDP_RATE = 0.1
/** Interest stops 90 days after departure from theatre. */
export const SDP_ACCRUAL_TAIL_DAYS = 90

/**
 * Last day deposits can be made. Departure from theatre is not the same as the
 * expected return home, but it is the best date the plan has; move it when you know.
 */
export const SDP_LAST_DEPOSIT: LocalDate = TIMELINE.expectedReturn

export interface SdpDeposit {
  date: LocalDate
  amount: number
}

export interface SdpProjection {
  deposited: number
  interest: number
  /** Principal plus interest, paid out after you leave. */
  payout: number
  accrualEnds: LocalDate
}

/**
 * Interest on a stream of deposits, compounded quarterly at 10%, up to the day accrual
 * stops. Each deposit earns from the day it lands.
 *
 * Fractional quarters compound smoothly — `(1 + r/4)^(days/91.25)` — rather than in
 * steps. DFAS credits interest at quarter end, so the real figure lands within a few
 * dollars of this; it is a projection, and labelled as one wherever it is shown.
 */
export function projectSdp(
  deposits: SdpDeposit[],
  departure: LocalDate = SDP_LAST_DEPOSIT,
): SdpProjection {
  const accrualEnds = addLocalDays(departure, SDP_ACCRUAL_TAIL_DAYS)
  let deposited = 0
  let interest = 0
  for (const d of deposits) {
    if (d.amount <= 0) continue
    const days = Math.max(0, localDaysBetween(d.date, accrualEnds))
    deposited += d.amount
    interest += d.amount * (Math.pow(1 + SDP_RATE / 4, days / 91.25) - 1)
  }
  return {
    deposited: round2(deposited),
    interest: round2(interest),
    payout: round2(deposited + interest),
    accrualEnds,
  }
}
