/**
 * What to do with money whose amount AND arrival date are both guesses.
 *
 * The regular allocator answers "what do I do on the 1st and the 15th" — it works
 * because those dates are known and those amounts are known. Back pay is neither. It is
 * "sometime this month" for "about $1,354, unless the 1380 days read the other way, in
 * which case about $1,698".
 *
 * The wrong response to that is to pick a date, wire a deadline-bearing payment to it,
 * and hope. A payment that only works if a guess is right is not a plan. So nothing with
 * a deadline is funded out of a windfall here. Instead the windfall gets an **ordered
 * list of claims**, each with a cap, resolved against whatever actually turns up:
 *
 *   - If more arrives than expected, the list keeps going and the surplus has a home.
 *   - If less arrives, the list stops partway and the things that got cut are named.
 *   - If it arrives late, nothing breaks, because nothing was scheduled against it.
 *
 * Order is by consequence-of-delay, not by size. Something that escalates on a date
 * outranks something that escalates over months, which outranks something that merely
 * accrues interest.
 *
 * Pure. No clock, no dates — the caller supplies the amount, and the plan is the same
 * whenever it lands.
 */

import { round2 } from './paychecks'

export interface WindfallClaim {
  key: string
  label: string
  /** Most this claim can absorb. The rest flows to the next one. */
  cap: number
  /** Why it sits here and not lower. Shown, because the order is the whole argument. */
  because: string
  howTo?: string
}

export interface WindfallLine {
  key: string
  label: string
  cap: number
  because: string
  howTo?: string
  amount: number
  /** True when the claim got something but not all of it. */
  partial: boolean
  /** Still owed on this claim after the windfall. */
  remaining: number
}

export interface WindfallPlan {
  amount: number
  lines: WindfallLine[]
  /** Claims that got nothing at all — the honest statement of what this does not cover. */
  unfunded: WindfallClaim[]
  /** Left after every claim is satisfied. Only non-zero if the windfall beat the list. */
  surplus: number
}

/**
 * Walk the claims in order until the money runs out.
 *
 * Every claim appears in the result even when it gets nothing, because "what this does
 * not cover" is the more useful half of the answer.
 */
export function windfallPlan(amount: number, claims: WindfallClaim[]): WindfallPlan {
  let left = round2(Math.max(0, amount))
  const lines: WindfallLine[] = []
  const unfunded: WindfallClaim[] = []

  for (const claim of claims) {
    const take = round2(Math.min(left, Math.max(0, claim.cap)))
    left = round2(left - take)

    if (take <= 0) {
      unfunded.push(claim)
      continue
    }

    lines.push({
      key: claim.key,
      label: claim.label,
      cap: claim.cap,
      because: claim.because,
      ...(claim.howTo ? { howTo: claim.howTo } : {}),
      amount: take,
      partial: take < claim.cap - 0.005,
      remaining: round2(claim.cap - take),
    })
  }

  return { amount: round2(amount), lines, unfunded, surplus: left }
}

/**
 * How the plan changes across the range of plausible amounts.
 *
 * The point of showing several is that the ORDER is the decision, and the order does not
 * change with the amount — only how far down the list you get. Seeing the low case and
 * the high case side by side makes that obvious in a way one figure never does.
 */
export function windfallSensitivity(
  amounts: number[],
  claims: WindfallClaim[],
): { amount: number; plan: WindfallPlan }[] {
  return amounts.map((amount) => ({ amount, plan: windfallPlan(amount, claims) }))
}
