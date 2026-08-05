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
  /**
   * A known one-off for the first payday this applies to — a part-week of childcare,
   * a pro-rata first bill. Cleaner than fighting the day-proration maths when you
   * already know what the first invoice says.
   */
  firstPeriodAmount?: number
  /**
   * A goal you set, not a bill you owe.
   *
   * The emergency fund and the debt paydown are figures chosen from ambition; the
   * mortgage is a figure chosen by the servicer. Underfunding the first is a plan
   * adjusting to reality, underfunding the second is a missed payment, and reporting
   * them in one number makes a solvent month read like a crisis. Targets still hold
   * their priority slot — they just do not count as obligations gone unpaid.
   */
  target?: boolean
  /**
   * Takes whatever is left rather than a fixed amount.
   *
   * The terminal line. Without one, "remainder" is a quiet pile of unassigned money —
   * and unassigned money is the money that disappears. A sweep gives every dollar a
   * named destination by construction.
   */
  sweep?: boolean
  execution?: 'automatic' | 'manual'
  /** Where it actually happens. Shown on the action, so there is no thinking to do. */
  howTo?: string
  /**
   * Total to pay across all paydays before this obligation stops — a balance rather
   * than a recurring charge. The car loan has $1,800 left on it; once that is paid
   * the line disappears instead of billing forever.
   */
  balanceCap?: number
  /**
   * Share one balance pool with other obligations carrying the same group.
   *
   * A credit card is attacked from two directions at once: a minimum payment you must
   * make, and whatever the paydown sweep adds on top. Both reduce the SAME balance, so
   * without this they would each run to the full cap and the plan would pay the card
   * twice. With it, the minimum is the floor, the sweep is the acceleration, and the
   * pair stops together when the real balance is gone.
   */
  capGroup?: string
  note?: string
}

export interface AllocationLine {
  key: string
  label: string
  /** True when this line took the remainder rather than asking for a set figure. */
  swept?: boolean
  /** True when this is a goal you set rather than a bill you owe. See `Obligation.target`. */
  target?: boolean
  /** Balance pool this line draws down, when it shares one. See `Obligation.capGroup`. */
  capGroup?: string
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
  /** Cash carried in from the previous payday, INCLUDING any one-off that landed. */
  openingBuffer: number
  /** One-off money that arrived since the last payday. Part of `openingBuffer`. */
  oneOffs?: OneOff[]
  /**
   * Money left after everything that could be paid, was — and therefore carried
   * forward to the next payday. Not "spare": it is what funds the 1st, which is
   * front-loaded with the mortgage and the truck while the 15th is comparatively light.
   */
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

/** The pressure gauge's kind. Excluded from binding shortfall; squeezed by the reserve. */
const GAUGE: ObligationKind = 'arrears_catchup'

/**
 * Lines that exist to absorb slack rather than to pay a bill on a date.
 *
 * The arrears gauge, the savings targets and the terminal sweep are all "whatever is
 * left" lines: paying one of them less this fortnight costs time, not a missed payment.
 * They are exactly the lines the forward reserve is allowed to squeeze, so that none of
 * them can drain the buffer a later payday's actual bills depend on.
 *
 * Applying this to the gauge alone — as an earlier version did — silently made the
 * arrears the only throttled claim, so reordering it above the savings targets changed
 * nothing. Whichever of the three is ranked first should get the slack.
 */
function isDiscretionary(o: Obligation): boolean {
  return o.sweep === true || o.target === true || o.kind === GAUGE
}

export interface AllocateOptions {
  /** Cumulative paid per obligation key so far. Only matters for `balanceCap`. */
  paidSoFar?: Record<string, number>
  /** Which obligations have already been billed at least once, for firstPeriodAmount. */
  seen?: Set<string>
  /** Cash carried in from the previous payday. */
  openingBuffer?: number
  /**
   * The most the discretionary lines may take. Everything above that stays in the
   * buffer for a later payday that would otherwise come up short.
   */
  drainCeiling?: number
}

/**
 * Strict priority, not proportional. A partial mortgage payment and a partial car
 * payment is worse than one whole payment — cure the roof first, then the truck.
 */
export function allocate(
  paycheck: Paycheck,
  obligations: Obligation[],
  opts: AllocateOptions = {},
): Allocation {
  const { paidSoFar = {}, seen = new Set<string>(), openingBuffer = 0 } = opts
  let drainLeft = opts.drainCeiling ?? Infinity

  const due = obligations
    .filter((o) => appliesOn(o, paycheck))
    .sort((a, b) => a.priority - b.priority)

  let available = round2(paycheck.net + openingBuffer)
  const lines: AllocationLine[] = []
  /**
   * Running balance drawn down WITHIN this payday, on top of what prior paydays paid.
   *
   * `paidSoFar` only advances between paydays, so a minimum and a sweep sharing one
   * balance would both read the same stale figure and together overshoot the cap. This
   * makes the second one see what the first just took.
   */
  const paidHere: Record<string, number> = {}

  for (const o of due) {
    const discretionary = isDiscretionary(o)
    const ceiling = discretionary ? Math.min(available, drainLeft) : available

    let requested = o.sweep
      ? Math.max(0, ceiling)
      : o.firstPeriodAmount !== undefined && !seen.has(o.key)
        ? o.firstPeriodAmount
        : requestedAmount(o, paycheck)
    seen.add(o.key)

    const capKey = o.capGroup ?? o.key
    let capRemaining = Infinity
    if (o.balanceCap !== undefined) {
      const alreadyPaid = round2((paidSoFar[capKey] ?? 0) + (paidHere[capKey] ?? 0))
      capRemaining = round2(o.balanceCap - alreadyPaid)
      if (capRemaining <= 0) continue // balance cleared; the line is gone, not zeroed
      requested = Math.min(requested, capRemaining)
    }


    if (requested <= 0) continue

    const allocated = round2(Math.max(0, Math.min(ceiling, requested)))
    available = round2(available - allocated)
    paidHere[capKey] = round2((paidHere[capKey] ?? 0) + allocated)
    if (discretionary) drainLeft = round2(drainLeft - allocated)

    lines.push({
      key: o.key,
      label: o.label,
      ...(o.capGroup ? { capGroup: o.capGroup } : {}),
      ...(o.sweep ? { swept: true } : {}),
      ...(o.target ? { target: true } : {}),
      execution: o.execution ?? 'manual',
      ...(o.howTo ? { howTo: o.howTo } : {}),
      requested,
      ...(!o.sweep && requested !== o.amountPerPaycheck
        ? { proratedFrom: o.amountPerPaycheck }
        : {}),
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
    openingBuffer: round2(openingBuffer),
    remainder: round2(available),
    totalShortfall: round2(lines.reduce((s, l) => s + l.shortfall, 0)),
  }
}

/**
 * Money that arrives outside the semi-monthly cycle: drill back pay, a tax refund, a
 * bonus. Real income the paycheck projection cannot see, because it is not an
 * entitlement running at a monthly rate.
 *
 * Applied to the buffer of the first payday on or after its date, which is what
 * actually happens — it lands in the account and is spent from there, in the same
 * priority order as everything else.
 */
export interface OneOff {
  key: string
  label: string
  date: LocalDate
  amount: number
  note?: string
}

/** One forward walk, carrying the buffer between paydays. */
function walk(
  paychecks: Paycheck[],
  obligations: Obligation[],
  ceilingAt: (index: number) => number,
  onAllocated: (a: Allocation) => void = () => {},
  oneOffs: OneOff[] = [],
): Allocation[] {
  const paidSoFar: Record<string, number> = {}
  const seen = new Set<string>()
  let buffer = 0
  const out: Allocation[] = []
  const pending = [...oneOffs].sort((a, b) => compareLocalDates(a.date, b.date))
  paychecks.forEach((p, i) => {
    // Anything that landed since the last payday is in the account now.
    const arrived: OneOff[] = []
    while (pending.length > 0 && compareLocalDates(pending[0]!.date, p.payDate) <= 0) {
      arrived.push(pending.shift()!)
    }
    buffer = round2(buffer + arrived.reduce((s, o) => s + o.amount, 0))

    const a = allocate(p, obligations, {
      paidSoFar,
      seen,
      openingBuffer: buffer,
      drainCeiling: ceilingAt(i),
    })
    if (arrived.length > 0) a.oneOffs = arrived
    for (const line of a.lines) {
      const capKey = line.capGroup ?? line.key
      paidSoFar[capKey] = round2((paidSoFar[capKey] ?? 0) + line.allocated)
    }
    buffer = a.remainder
    onAllocated(a)
    out.push(a)
  })
  return out
}

/**
 * Two passes, because the 1st and the 15th are not independent.
 *
 * The 1st carries the mortgage and the truck; the 15th carries comparatively little.
 * Allocating each paycheck in isolation makes the 1st look insolvent while the 15th
 * hands its surplus to the arrears — a fake shortfall paid for with real money.
 *
 *  - **Forward pass** funds every committed obligation, letting the leftover carry.
 *  - **Backward pass** takes the suffix minimum of those buffers. Draining `x` at one
 *    payday lowers every later buffer by `x`, so the most that can safely leave on
 *    payday `i` is the smallest buffer from `i` onward. Anything more would create a
 *    shortfall later that the money on hand could have prevented.
 *  - **Second forward pass** replays with that ceiling, so the gauge and the sweep
 *    take only what is genuinely spare.
 *
 * Same shape as the planner's own two-pass: backward for what is required, forward for
 * what is available, and the gap stated rather than smoothed away.
 */
export function allocateAll(
  paychecks: Paycheck[],
  obligations: Obligation[],
  oneOffs: OneOff[] = [],
): Allocation[] {
  const committed = walk(paychecks, obligations, () => 0, () => {}, oneOffs)

  const suffixMin: number[] = new Array(committed.length)
  let running = Infinity
  for (let i = committed.length - 1; i >= 0; i--) {
    running = Math.min(running, committed[i]!.remainder)
    suffixMin[i] = running
  }

  let drained = 0
  return walk(
    paychecks,
    obligations,
    (i) => Math.max(0, round2((suffixMin[i] ?? 0) - drained)),
    (a) => {
      drained = round2(
        drained +
          a.lines
            .filter((l) => l.kind === GAUGE || l.swept || l.target)
            .reduce((s, l) => s + l.allocated, 0),
      )
    },
    oneOffs,
  )
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
  const seenGroups = new Set<string>()
  for (const o of obligations) {
    if (o.balanceCap === undefined) continue
    const capKey = o.capGroup ?? o.key
    // A shared pool is one balance, so report it once rather than per contributor.
    if (seenGroups.has(capKey)) continue
    seenGroups.add(capKey)

    let paid = 0
    let clearedOn: LocalDate | null = null
    for (const a of allocations) {
      const contributed = a.lines
        .filter((l) => (l.capGroup ?? l.key) === capKey)
        .reduce((s, l) => s + l.allocated, 0)
      if (contributed === 0) continue
      paid = round2(paid + contributed)
      if (clearedOn === null && paid >= o.balanceCap - 0.005) clearedOn = a.paycheck.payDate
    }
    out[capKey] = { cap: o.balanceCap, paid, clearedOn }
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
   * Shortfall on bills you actually owe — excluding the pressure gauge and excluding
   * savings targets.
   *
   * The arrears line deliberately asks for more than it can get; that is how it measures
   * slack. The savings targets are ambitions, and an ambition going partly unfunded is
   * the plan meeting reality, not a payment missed. Counting either as a failure would
   * make the headline read like a crisis while every real obligation was covered. This
   * is the number that actually means "something did not get paid".
   */
  bindingShortfall: number
  bindingShortPaydays: LocalDate[]
  firstBindingShortPayday: LocalDate | null
  /** How far short the savings targets fell. A gap to argue with, not a bill missed. */
  targetShortfall: number
}

/**
 * Average monthly cash left after every committed bill — the size of the pot that the
 * savings targets, the arrears gauge and the law-school sweep are all competing for.
 *
 * Deliberately excludes targets, the gauge and the sweep: including any of them would
 * fold a claim on the pot into the measurement of the pot.
 */
export function steadyMonthlySlack(allocations: Allocation[]): number {
  if (allocations.length === 0) return 0
  const total = allocations.reduce((s, a) => {
    const bills = a.lines
      .filter((l) => l.kind !== GAUGE && !l.swept && !l.target)
      .reduce((t, l) => t + l.requested, 0)
    return s + (a.paycheck.net - bills)
  }, 0)
  // Two paydays a month, so the per-month figure is the per-payday average doubled.
  return round2((total / allocations.length) * 2)
}

export function summarize(allocations: Allocation[]): CashflowSummary {
  const short = allocations.filter((a) => a.totalShortfall > 0)
  const bindingOf = (a: Allocation) =>
    round2(
      a.lines
        .filter((l) => l.kind !== GAUGE && !l.target)
        .reduce((s, l) => s + l.shortfall, 0),
    )
  const bindingShort = allocations.filter((a) => bindingOf(a) > 0)

  return {
    targetShortfall: round2(
      allocations.reduce(
        (s, a) => s + a.lines.filter((l) => l.target).reduce((t, l) => t + l.shortfall, 0),
        0,
      ),
    ),
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
