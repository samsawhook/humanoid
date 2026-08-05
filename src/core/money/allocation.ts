/**
 * What money goes where, per paycheck, before it lands.
 *
 * The point of this module is the question "what do I do with the 1st and the 15th"
 * answered *in advance*, in priority order, with the shortfall stated out loud rather
 * than smoothed away. Nothing here silently drops an obligation to make the numbers
 * work — same rule as the planner refusing to silently drop a goal.
 *
 * Pure. Takes paychecks and obligations, returns allocations.
 */

import type { LocalDate } from '../types'
import { compareLocalDates, localDaysBetween } from '../time/localDay'
import { round2, type Paycheck } from './paychecks'

export type PayDaySelector = 'both' | 'first' | 'fifteenth'

export type ObligationKind =
  | 'arrears_catchup'
  | 'secured_recurring'
  | 'living'
  | 'unsecured_debt'
  | 'savings'

export interface Obligation {
  key: string
  label: string
  /** Dollars taken from EACH qualifying paycheck. */
  amountPerPaycheck: number
  payDays: PayDaySelector
  activeFrom: LocalDate | null
  activeTo: LocalDate | null
  /** Lower is paid first. Ties broken by declaration order. */
  priority: number
  kind: ObligationKind
  /**
   * Charge only for the part of the pay period the obligation was actually running.
   *
   * Off by default, because most obligations are lump sums attached to a payday — a
   * mortgage payment due on the 1st is $1,300 whether the month had 28 days or 31.
   * Turn it on for things that accrue daily, like childcare: a nanny starting on the
   * 9th costs seven fifteenths of a half-month, not a half-month.
   */
  prorate?: boolean
  /**
   * Whether this moves on its own or you have to make it move.
   *
   * The distinction the whole action list rests on: an allocation table tells you
   * where the money should go, but only some of those rows require you to open an app
   * on the 1st and press send. Those are the ones that get missed.
   */
  execution?: 'automatic' | 'manual'
  /** Where it actually happens. Shown on the action, so there is no thinking to do. */
  howTo?: string
  /**
   * Total to pay across all paydays before this obligation stops — a balance rather
   * than a recurring charge. The car loan has $1,800 left on it; once that is paid
   * the line disappears instead of billing forever.
   */
  balanceCap?: number
  note?: string
}

export interface AllocationLine {
  key: string
  label: string
  execution: 'automatic' | 'manual'
  howTo?: string
  /** After proration. This is what the payday is actually asked for. */
  requested: number
  /** Set when proration reduced the ask, so a part-period charge is legible. */
  proratedFrom?: number
  allocated: number
  shortfall: number
  kind: ObligationKind
}

export interface Allocation {
  paycheck: Paycheck
  lines: AllocationLine[]
  totalRequested: number
  totalAllocated: number
  /** Money left after everything that could be paid, was. */
  remainder: number
  /** Money that was owed and could not be covered. The number that matters. */
  totalShortfall: number
}

function appliesOn(obligation: Obligation, paycheck: Paycheck): boolean {
  const day = Number(paycheck.scheduledDate.slice(8, 10))
  if (obligation.payDays === 'first' && day !== 1) return false
  if (obligation.payDays === 'fifteenth' && day !== 15) return false

  const on = paycheck.scheduledDate
  if (obligation.activeFrom && compareLocalDates(on, obligation.activeFrom) < 0) return false
  if (obligation.activeTo && compareLocalDates(on, obligation.activeTo) > 0) return false
  return true
}

/**
 * How much a prorated obligation actually costs for one pay period: the full
 * per-paycheck amount scaled by the share of the period it was running.
 *
 * A nanny starting on the 9th, against a period covering the 1st to the 15th, is
 * seven days out of fifteen.
 */
function requestedAmount(obligation: Obligation, paycheck: Paycheck): number {
  if (!obligation.prorate) return obligation.amountPerPaycheck

  const periodDays = localDaysBetween(paycheck.periodStart, paycheck.periodEnd) + 1
  if (periodDays <= 0) return obligation.amountPerPaycheck

  const start =
    obligation.activeFrom && compareLocalDates(obligation.activeFrom, paycheck.periodStart) > 0
      ? obligation.activeFrom
      : paycheck.periodStart
  const end =
    obligation.activeTo && compareLocalDates(obligation.activeTo, paycheck.periodEnd) < 0
      ? obligation.activeTo
      : paycheck.periodEnd

  const coveredDays = localDaysBetween(start, end) + 1
  if (coveredDays <= 0) return 0
  if (coveredDays >= periodDays) return obligation.amountPerPaycheck

  return round2((obligation.amountPerPaycheck * coveredDays) / periodDays)
}

/**
 * Strict priority, not proportional. A partial mortgage payment and a partial car
 * payment is worse than one whole payment — cure the roof first, then the truck.
 */
export function allocate(
  paycheck: Paycheck,
  obligations: Obligation[],
  /** Cumulative paid per obligation key so far. Only matters for `balanceCap`. */
  paidSoFar: Record<string, number> = {},
): Allocation {
  const due = obligations
    .filter((o) => appliesOn(o, paycheck))
    .sort((a, b) => a.priority - b.priority)

  let available = paycheck.net
  const lines: AllocationLine[] = []

  for (const o of due) {
    let requested = requestedAmount(o, paycheck)

    if (o.balanceCap !== undefined) {
      const remaining = round2(o.balanceCap - (paidSoFar[o.key] ?? 0))
      if (remaining <= 0) continue // balance cleared; the line is gone, not zeroed
      requested = Math.min(requested, remaining)
    }

    if (requested <= 0) continue

    const allocated = round2(Math.max(0, Math.min(available, requested)))
    available = round2(available - allocated)
    lines.push({
      key: o.key,
      label: o.label,
      execution: o.execution ?? 'manual',
      ...(o.howTo ? { howTo: o.howTo } : {}),
      requested,
      ...(requested !== o.amountPerPaycheck ? { proratedFrom: o.amountPerPaycheck } : {}),
      allocated,
      shortfall: round2(requested - allocated),
      kind: o.kind,
    })
  }

  const totalRequested = round2(lines.reduce((s, l) => s + l.requested, 0))
  const totalAllocated = round2(lines.reduce((s, l) => s + l.allocated, 0))

  return {
    paycheck,
    lines,
    totalRequested,
    totalAllocated,
    remainder: round2(available),
    totalShortfall: round2(lines.reduce((s, l) => s + l.shortfall, 0)),
  }
}

export function allocateAll(paychecks: Paycheck[], obligations: Obligation[]): Allocation[] {
  // Balances are cumulative across paydays, so this has to walk them in order.
  const paidSoFar: Record<string, number> = {}
  return paychecks.map((p) => {
    const a = allocate(p, obligations, paidSoFar)
    for (const line of a.lines) {
      paidSoFar[line.key] = round2((paidSoFar[line.key] ?? 0) + line.allocated)
    }
    return a
  })
}

/**
 * When each capped balance is fully paid — the answer to "when is the car gone" and
 * "when are the arrears actually cured at the rate I can afford."
 */
export function balanceClearedOn(
  allocations: Allocation[],
  obligations: Obligation[],
): Record<string, { cap: number; paid: number; clearedOn: LocalDate | null }> {
  const out: Record<string, { cap: number; paid: number; clearedOn: LocalDate | null }> = {}
  for (const o of obligations) {
    if (o.balanceCap === undefined) continue
    let paid = 0
    let clearedOn: LocalDate | null = null
    for (const a of allocations) {
      const line = a.lines.find((l) => l.key === o.key)
      if (!line) continue
      paid = round2(paid + line.allocated)
      if (clearedOn === null && paid >= o.balanceCap - 0.005) clearedOn = a.paycheck.payDate
    }
    out[o.key] = { cap: o.balanceCap, paid, clearedOn }
  }
  return out
}

export interface PaydayAction {
  key: string
  label: string
  amount: number
  howTo?: string
  /** True when the amount is less than was owed — you are choosing what to underpay. */
  partial: boolean
  shortfall: number
}

/**
 * What you personally have to do on a given payday.
 *
 * Automatic lines are excluded — they are real money but not real tasks, and putting
 * them on a list trains you to skim it. Anything paid at less than the full ask is
 * flagged, because a partial payment is a decision and should not slip past as a tick.
 */
export function paydayActions(allocation: Allocation): PaydayAction[] {
  return allocation.lines
    .filter((l) => l.execution === 'manual' && l.allocated > 0)
    .map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.allocated,
      ...(l.howTo ? { howTo: l.howTo } : {}),
      partial: l.shortfall > 0,
      shortfall: l.shortfall,
    }))
}

export interface CashflowSummary {
  paychecks: number
  totalNet: number
  totalObligations: number
  totalShortfall: number
  totalRemainder: number
  /** Paydays that could not cover everything owed. */
  shortPaydays: LocalDate[]
  firstShortPayday: LocalDate | null
  /**
   * Shortfall on everything EXCEPT the pressure gauge.
   *
   * The arrears line deliberately asks for more than it can get — that is how it
   * measures available slack. Counting its unmet ask as a failure would make the
   * headline read like a crisis when every real obligation is covered. This is the
   * number that actually means "something did not get paid".
   */
  bindingShortfall: number
  bindingShortPaydays: LocalDate[]
  firstBindingShortPayday: LocalDate | null
}

/** The gauge kind, excluded from binding shortfall. */
const GAUGE: ObligationKind = 'arrears_catchup'

export function summarize(allocations: Allocation[]): CashflowSummary {
  const short = allocations.filter((a) => a.totalShortfall > 0)
  const bindingOf = (a: Allocation) =>
    round2(a.lines.filter((l) => l.kind !== GAUGE).reduce((s, l) => s + l.shortfall, 0))
  const bindingShort = allocations.filter((a) => bindingOf(a) > 0)

  return {
    bindingShortfall: round2(allocations.reduce((s, a) => s + bindingOf(a), 0)),
    bindingShortPaydays: bindingShort.map((a) => a.paycheck.payDate),
    firstBindingShortPayday: bindingShort[0]?.paycheck.payDate ?? null,
    paychecks: allocations.length,
    totalNet: round2(allocations.reduce((s, a) => s + a.paycheck.net, 0)),
    totalObligations: round2(allocations.reduce((s, a) => s + a.totalRequested, 0)),
    totalShortfall: round2(allocations.reduce((s, a) => s + a.totalShortfall, 0)),
    totalRemainder: round2(allocations.reduce((s, a) => s + a.remainder, 0)),
    shortPaydays: short.map((a) => a.paycheck.payDate),
    firstShortPayday: short[0]?.paycheck.payDate ?? null,
  }
}
