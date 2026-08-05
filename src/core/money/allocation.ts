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
import { compareLocalDates } from '../time/localDay'
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
  note?: string
}

export interface AllocationLine {
  key: string
  label: string
  requested: number
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
 * Strict priority, not proportional. A partial mortgage payment and a partial car
 * payment is worse than one whole payment — cure the roof first, then the truck.
 */
export function allocate(paycheck: Paycheck, obligations: Obligation[]): Allocation {
  const due = obligations
    .filter((o) => appliesOn(o, paycheck))
    .sort((a, b) => a.priority - b.priority)

  let available = paycheck.net
  const lines: AllocationLine[] = []

  for (const o of due) {
    const allocated = round2(Math.max(0, Math.min(available, o.amountPerPaycheck)))
    available = round2(available - allocated)
    lines.push({
      key: o.key,
      label: o.label,
      requested: o.amountPerPaycheck,
      allocated,
      shortfall: round2(o.amountPerPaycheck - allocated),
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
  return paychecks.map((p) => allocate(p, obligations))
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
}

export function summarize(allocations: Allocation[]): CashflowSummary {
  const short = allocations.filter((a) => a.totalShortfall > 0)
  return {
    paychecks: allocations.length,
    totalNet: round2(allocations.reduce((s, a) => s + a.paycheck.net, 0)),
    totalObligations: round2(allocations.reduce((s, a) => s + a.totalRequested, 0)),
    totalShortfall: round2(allocations.reduce((s, a) => s + a.totalShortfall, 0)),
    totalRemainder: round2(allocations.reduce((s, a) => s + a.remainder, 0)),
    shortPaydays: short.map((a) => a.paycheck.payDate),
    firstShortPayday: short[0]?.paycheck.payDate ?? null,
  }
}
