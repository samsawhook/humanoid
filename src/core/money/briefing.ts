/**
 * The briefing: the plan run end to end, summarised into the handful of numbers an
 * adviser would put in front of you, and re-run under variations so every suggestion
 * carries its own price tag.
 *
 * Nothing here decides anything. It runs the same allocator the rest of the money tab
 * uses, under different inputs, and reports the difference. A suggestion whose value
 * cannot be computed this way is not given a number — it is described instead.
 *
 * Interest on debts is NOT modelled anywhere in this directory (rates are mostly
 * unknown, and SCRA should cap them at 6%). So a dollar of debt paid and a dollar
 * saved count the same here, and the only return modelled is the SDP's 10%. That
 * understates the value of paying anything above 10%, and says so on the page.
 *
 * Pure. No clock, no network.
 */

import type { LocalDate } from '../types'
import { projectPaychecks, round2 } from './paychecks'
import {
  allocateAll,
  balanceClearedOn,
  summarize,
  type Allocation,
  type Obligation,
  type OneOff,
} from './allocation'
import {
  OBLIGATIONS,
  ONE_OFFS,
  EMERGENCIES,
  PLAN_START,
  AGREEMENT_MONTHLY,
} from './obligations'
import { DEBTS } from './debts'
import { projectSdp } from './sdp'
import { TIMELINE } from './rates'

export const BRIEFING_END: LocalDate = '2027-08-01'

/** What each Nth transfer actually invests; anything above it is a transfer fee. */
const NTH_PRINCIPAL = 500

/** Chase is paid on an agreement with no cap, so its balance is tracked here. */
const CHASE_BALANCE = DEBTS.find((d) => d.key === 'chase')!.balance

export interface PlanInputs {
  obligations: Obligation[]
  oneOffs: OneOff[]
}

export const BASE_INPUTS: PlanInputs = { obligations: OBLIGATIONS, oneOffs: ONE_OFFS }

export interface Outcome {
  allocations: Allocation[]
  billsUnpaid: number
  shortPaydays: LocalDate[]
  mortgageCurrent: LocalDate | null
  carPaidOff: LocalDate | null
  openCardsClear: LocalDate | null
  /** Emergency fund (buffer + rest) balance at the end, after any draws. */
  emergencyFund: number
  /** Cash left sitting in checking at the end. */
  checking: number
  lawFund: number
  sdpDeposited: number
  sdpInterest: number
  sdpPayout: number
  /** Nth Investments contributed over the horizon. An asset; no growth assumed. */
  invested: number
  /** Cash you hold or will receive: fund + checking + law fund + SDP payout. */
  comingHomeCash: number
  /** Payable debts left at the end — not Goldman/PSECU, not mortgage principal. */
  debtLeft: number
  /** Paid toward the boat project. Money into something you keep, not consumption. */
  boatFunded: number
  /** When the boat project is fully paid, if it is. */
  boatDone: LocalDate | null
  /**
   * comingHomeCash + invested + boatFunded − debtLeft. The one number moves are scored on.
   *
   * The boat counts because a move's freed money now lands there first: scoring it as
   * spending made every saving look worthless the moment the boat existed.
   */
  netPosition: number
}

function sumLines(allocations: Allocation[], pred: (key: string, group?: string) => boolean): number {
  return round2(
    allocations.reduce(
      (t, a) => t + a.lines.filter((l) => pred(l.key, l.capGroup)).reduce((u, l) => u + l.allocated, 0),
      0,
    ),
  )
}

function sdpDeposits(allocations: Allocation[]) {
  return allocations.flatMap((a) =>
    a.lines
      .filter((l) => l.key === 'sdp' && l.allocated > 0)
      .map((l) => ({ date: a.paycheck.payDate, amount: l.allocated })),
  )
}

export function runPlan(inputs: PlanInputs = BASE_INPUTS, end: LocalDate = BRIEFING_END): Outcome {
  const allocations = allocateAll(projectPaychecks(PLAN_START, end), inputs.obligations, inputs.oneOffs)
  const summary = summarize(allocations)
  const cleared = balanceClearedOn(allocations, inputs.obligations)
  const sdp = projectSdp(sdpDeposits(allocations))

  const remaining = (group: string) => {
    const c = cleared[group]
    return c ? Math.max(0, round2(c.cap - c.paid)) : 0
  }
  const chasePaid = sumLines(allocations, (k) => k === 'debt_agreements')
  const debtLeft = round2(
    remaining('open_cards') +
      remaining('closed_cards') +
      remaining('avant') +
      remaining('car_payoff') +
      remaining('mortgage_arrears') +
      remaining('late_payments') +
      Math.max(0, CHASE_BALANCE - chasePaid),
  )

  const emergencyFund = Math.max(0, cleared.emergency_fund?.paid ?? 0)
  const checking = allocations[allocations.length - 1]?.remainder ?? 0
  const lawFund = sumLines(allocations, (k) => k === 'future_fund')
  // What actually reaches the investment — not the $30 wire fee that rides along with it.
  const invested = round2(
    allocations.reduce(
      (t, a) =>
        t +
        a.lines
          .filter((l) => l.key === 'nth_investments')
          .reduce((u, l) => u + Math.min(l.allocated, NTH_PRINCIPAL), 0),
      0,
    ),
  )
  const comingHomeCash = round2(emergencyFund + checking + lawFund + sdp.payout)
  const boatFunded = sumLines(allocations, (k) => k === 'boat')

  return {
    allocations,
    billsUnpaid: summary.bindingShortfall,
    shortPaydays: summary.bindingShortPaydays,
    mortgageCurrent: cleared.mortgage_arrears?.clearedOn ?? null,
    carPaidOff: cleared.car_payoff?.clearedOn ?? null,
    openCardsClear: cleared.open_cards?.clearedOn ?? null,
    emergencyFund: round2(emergencyFund),
    checking: round2(checking),
    lawFund,
    sdpDeposited: sdp.deposited,
    sdpInterest: sdp.interest,
    sdpPayout: sdp.payout,
    invested,
    comingHomeCash,
    debtLeft,
    boatFunded,
    boatDone: cleared.boat?.clearedOn ?? null,
    netPosition: round2(comingHomeCash + invested + boatFunded - debtLeft),
  }
}

// ── Moves ────────────────────────────────────────────────────────────────────

export interface Move {
  key: string
  label: string
  /** What you would actually do. */
  action: string
  /** How sure the figure is — `estimate` when an input is my guess, not your number. */
  basis: 'computed' | 'estimate'
  apply: (inputs: PlanInputs) => PlanInputs
}

function adjust(
  inputs: PlanInputs,
  key: string,
  change: (o: Obligation) => Obligation | null,
): PlanInputs {
  return {
    ...inputs,
    obligations: inputs.obligations.flatMap((o) => {
      if (o.key !== key) return [o]
      const next = change(o)
      return next ? [next] : []
    }),
  }
}

/** Trim a monthly amount off your own spending, split across both paydays. */
const trimSpending = (monthly: number) => (inputs: PlanInputs) =>
  adjust(inputs, 'living_deployed', (o) => ({
    ...o,
    amountPerPaycheck: round2(o.amountPerPaycheck - monthly / 2),
  }))

export const MOVES: Move[] = [
  {
    key: 'wire_to_ach',
    label: 'Send Nth by ACH, not wire',
    action:
      'Every Nth transfer goes out as a wire, and Wells Fargo charges $30 each time. Ask the ' +
      'recipient for ACH details, or push it from the Bank of America side, and it is free.',
    basis: 'computed',
    apply: (i) => adjust(i, 'nth_investments', (o) => ({ ...o, amountPerPaycheck: 500 })),
  },
  {
    key: 'tolls_paid',
    label: 'Tolls already paid',
    action: 'Confirm the $1,100 of tolls and late fees went out of the August back pay.',
    basis: 'computed',
    apply: (i) => adjust(i, 'late_payments', () => null),
  },
  {
    key: 'nth_to_sdp',
    label: 'Pause Nth, fill the SDP',
    action:
      'If Nth Investments can be paused, send its $500/mo to the SDP until departure: ' +
      '10% guaranteed instead of market risk, and cash in hand when you land.',
    basis: 'computed',
    apply: (i) => adjust(i, 'nth_investments', () => null),
  },
  {
    key: 'extras_200',
    label: 'Extras home to $200/mo',
    action: 'Hold sporadic transfers home to about $200/mo instead of the $400 observed.',
    basis: 'computed',
    apply: (i) =>
      adjust(i, 'support_home_extras', (o) => ({ ...o, amountPerPaycheck: 100 })),
  },
  {
    key: 'hugedomains',
    label: 'Drop Hugedomains',
    action: 'Cancel or pay out the $99.79/mo Hugedomains plan.',
    basis: 'computed',
    apply: trimSpending(99.79),
  },
  {
    key: 'phone_line',
    label: 'Suspend your phone line',
    action: 'Suspend your own line while deployed (SCRA / T-Mobile military suspension). ~$40/mo is my estimate.',
    basis: 'estimate',
    apply: trimSpending(40),
  },
]

export interface MoveImpact {
  move: Move
  outcome: Outcome
  /** Change in net position at return. Positive is better. */
  delta: number
  /** Change in cash you hold or will receive at return. */
  cashDelta: number
  /** Change in debt left. Negative is better. */
  debtDelta: number
}

export function moveImpacts(base: Outcome = runPlan(), moves: Move[] = MOVES): MoveImpact[] {
  return moves
    .map((move) => {
      const outcome = runPlan(move.apply(BASE_INPUTS))
      return {
        move,
        outcome,
        delta: round2(outcome.netPosition - base.netPosition),
        cashDelta: round2(outcome.comingHomeCash - base.comingHomeCash),
        debtDelta: round2(outcome.debtLeft - base.debtLeft),
      }
    })
    .sort((a, b) => b.delta - a.delta)
}

/** Every move at once — what the whole list is worth together. */
export function allMoves(moves: Move[] = MOVES): Outcome {
  return runPlan(moves.reduce((inputs, m) => m.apply(inputs), BASE_INPUTS))
}

// ── Stress test ──────────────────────────────────────────────────────────────

export interface StressCase {
  key: string
  label: string
  emergencies: OneOff[]
}

export const STRESS_CASES: StressCase[] = [
  { key: 'none', label: 'Nothing goes wrong', emergencies: [] },
  { key: 'base', label: 'Two emergencies — the plan', emergencies: EMERGENCIES },
  {
    key: 'three',
    label: 'Three emergencies',
    emergencies: [
      ...EMERGENCIES,
      {
        key: 'emergency_third',
        label: 'Emergency — third (assumed)',
        date: '2027-04-05',
        amount: -2000,
        drawsFrom: 'emergency_fund',
      },
    ],
  },
  {
    key: 'early',
    label: 'One hits in December',
    emergencies: [
      {
        key: 'emergency_early',
        label: 'Emergency — during the catch-up (assumed)',
        date: '2026-12-20',
        amount: -2000,
        drawsFrom: 'emergency_fund',
      },
      ...EMERGENCIES,
    ],
  },
]

export function stressTest(cases: StressCase[] = STRESS_CASES) {
  const nonEmergency = ONE_OFFS.filter((o) => !EMERGENCIES.some((e) => e.key === o.key))
  return cases.map((c) => ({
    case: c,
    totalHit: round2(-c.emergencies.reduce((s, e) => s + e.amount, 0)),
    outcome: runPlan({ obligations: OBLIGATIONS, oneOffs: [...nonEmergency, ...c.emergencies] }),
  }))
}

// ── Shapes for the charts ────────────────────────────────────────────────────

/** Where the money goes, grouped into the six things a person thinks in. */
export const BUCKETS = [
  { key: 'housing', label: 'Mortgage', keys: ['mortgage_current', 'arrears_catchup_payment', 'mortgage_arrears'] },
  { key: 'home', label: 'Sent home', keys: ['support_home_deployed', 'support_home_extras', 'childcare', 'christmas'] },
  { key: 'you', label: 'Your spending', keys: ['living_deployed', 'boat'] },
  {
    key: 'debt',
    label: 'Debt payments',
    keys: [
      'car_payoff',
      'card_minimums_open',
      'card_minimums_closed',
      'avant_payment',
      'avant_past_due',
      'debt_agreements',
      'late_payments',
      'debt_paydown_open',
      'debt_paydown_closed',
    ],
  },
  { key: 'invest', label: 'Investing', keys: ['nth_investments'] },
  { key: 'save', label: 'Saved', keys: ['emergency_starter', 'emergency_fund', 'sdp', 'future_fund'] },
] as const

export type BucketKey = (typeof BUCKETS)[number]['key']

export interface MonthRow {
  month: string
  net: number
  byBucket: Record<BucketKey, number>
  /** Net pay not spent this month — carried in checking. Negative when it drew down. */
  carried: number
}

export function monthlyComposition(allocations: Allocation[]): MonthRow[] {
  const rows = new Map<string, MonthRow>()
  for (const a of allocations) {
    // By the scheduled 1st/15th, not the weekend-shifted deposit date, or May's 1st lands in April.
    const month = a.paycheck.scheduledDate.slice(0, 7)
    const row =
      rows.get(month) ??
      ({
        month,
        net: 0,
        byBucket: { housing: 0, home: 0, you: 0, debt: 0, invest: 0, save: 0 },
        carried: 0,
      } as MonthRow)
    row.net = round2(row.net + a.paycheck.net)
    for (const l of a.lines) {
      const bucket = BUCKETS.find((b) => (b.keys as readonly string[]).includes(l.key))
      if (bucket) row.byBucket[bucket.key] = round2(row.byBucket[bucket.key] + l.allocated)
    }
    rows.set(month, row)
  }
  for (const row of rows.values()) {
    const spent = Object.values(row.byBucket).reduce((s, v) => s + v, 0)
    row.carried = round2(row.net - spent)
  }
  return [...rows.values()]
}

export interface TrajectoryPoint {
  date: LocalDate
  /** Emergency fund + checking + SDP deposited + law fund. */
  cash: number
  /** Payable debts left (same definition as Outcome.debtLeft). */
  debt: number
}

export function trajectory(outcome: Outcome, obligations: Obligation[] = OBLIGATIONS): TrajectoryPoint[] {
  const out: TrajectoryPoint[] = []
  for (let i = 0; i < outcome.allocations.length; i++) {
    const upTo = outcome.allocations.slice(0, i + 1)
    const cleared = balanceClearedOn(upTo, obligations)
    const remaining = (g: string) => {
      const c = cleared[g]
      if (c) return Math.max(0, c.cap - c.paid)
      const cap = Math.max(
        0,
        ...obligations.filter((o) => (o.capGroup ?? o.key) === g && o.balanceCap !== undefined).map((o) => o.balanceCap!),
      )
      return cap
    }
    const chasePaid = sumLines(upTo, (k) => k === 'debt_agreements')
    const debt =
      remaining('open_cards') +
      remaining('closed_cards') +
      remaining('avant') +
      remaining('car_payoff') +
      remaining('mortgage_arrears') +
      remaining('late_payments') +
      Math.max(0, CHASE_BALANCE - chasePaid)
    const ef = Math.max(0, cleared.emergency_fund?.paid ?? 0)
    const cash =
      ef +
      (upTo[upTo.length - 1]?.remainder ?? 0) +
      sumLines(upTo, (k) => k === 'sdp') +
      sumLines(upTo, (k) => k === 'future_fund')
    out.push({ date: upTo[upTo.length - 1]!.paycheck.payDate, cash: round2(cash), debt: round2(debt) })
  }
  return out
}

/** The tightest payday: least cash left after its bills. */
export function tightestPayday(outcome: Outcome): { date: LocalDate; left: number } | null {
  let best: { date: LocalDate; left: number } | null = null
  for (const a of outcome.allocations) {
    if (!best || a.remainder < best.left) best = { date: a.paycheck.payDate, left: a.remainder }
  }
  return best
}

export const HORIZON = {
  start: PLAN_START,
  end: BRIEFING_END,
  departure: TIMELINE.expectedReturn,
  chaseMonthly: AGREEMENT_MONTHLY,
}

/** Payable debt today, before the first payday — the same definition as Outcome.debtLeft. */
export function openingDebt(obligations: Obligation[] = OBLIGATIONS): number {
  const cap = (g: string) =>
    Math.max(
      0,
      ...obligations
        .filter((o) => (o.capGroup ?? o.key) === g && o.balanceCap !== undefined)
        .map((o) => o.balanceCap!),
    )
  return round2(
    cap('open_cards') +
      cap('closed_cards') +
      cap('avant') +
      cap('car_payoff') +
      cap('mortgage_arrears') +
      cap('late_payments') +
      CHASE_BALANCE,
  )
}
