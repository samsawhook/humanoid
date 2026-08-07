/**
 * Unsecured debts, and the legal posture of each.
 *
 * A charged-off account that was sued on and dismissed is not the same object as a
 * live account in good standing, and treating them identically produces bad advice.
 * The avalanche method says "highest rate first" — which here would send every spare
 * dollar at Goldman, the single worst use of the money available.
 *
 * NOT LEGAL ADVICE. I am not a lawyer and this is a planning model. The statute of
 * limitations point below is well documented and consequential enough to state
 * plainly, but confirm it with someone qualified before acting on it.
 */

export type DebtPosture =
  /** Open revolving account. Paying this down lowers utilisation. */
  | 'active'
  /** Closed to further use. The balance is real; the credit line is gone. */
  | 'closed'
  /** Creditor sued and the case was dismissed. */
  | 'sued_dismissed'
  | 'charged_off'
  | 'in_collections'

/**
 * Revolving debt has a credit line, so paying it down moves utilisation and therefore
 * moves a score. An installment loan does not — the balance falls on a schedule and the
 * limit is not a thing. Keeping them apart matters because the whole argument for
 * ranking the open cards ahead of the cash reserve is a utilisation argument, and it
 * does not transfer to a personal loan.
 */
export type DebtInstrument = 'revolving' | 'installment'

export interface Debt {
  key: string
  label: string
  balance: number
  instrument: DebtInstrument
  posture: DebtPosture
  /** Lower is paid first. */
  priority: number
  /**
   * A monthly payment this debt is already being paid on — a negotiated arrangement or
   * a loan's contractual instalment.
   *
   * Changes what the debt *is*. Everything else here is discretionary: a balance where
   * you choose the rate. A scheduled payment is a commitment on a date, so the debt
   * leaves the paydown queue entirely and becomes a bill, like the mortgage. Leaving it
   * in both would fund the same balance twice.
   */
  scheduledMonthly?: number
  /**
   * Arrears on a scheduled debt — a payment already missed, owed on top of the next one.
   * Distinct from the balance, because curing it is what stops the delinquency ageing.
   */
  pastDue?: number
  /**
   * Annual rate, where known. Absent means genuinely unknown rather than zero — the
   * band it plausibly falls in is documented on the debt itself.
   */
  apr?: number
  note: string
}

/**
 * Texas limitations period for a debt claim is four years. Two things follow, and the
 * second is the one that catches people out:
 *
 *  1. Once a debt is time-barred, a creditor who sues can be defeated on that basis.
 *  2. **A partial payment or a written acknowledgment can restart the clock.** Paying
 *     a token amount on an old account, believing it responsible, can re-expose you
 *     to a suit you were otherwise safe from.
 *
 * Which means "pay a little on everything" is precisely the wrong strategy here, and
 * the instinct to leave these alone is the right one — for a better reason than
 * simply preferring to spend the money elsewhere.
 */
export const TEXAS_LIMITATIONS_YEARS = 4

/**
 * SCRA — the Servicemembers Civil Relief Act interest cap.
 *
 * Caps interest at 6% on obligations incurred BEFORE active duty began, for the whole
 * period of that duty. Three things about it are worth knowing precisely, because they
 * are what make this worth doing rather than a formality:
 *
 *  1. **It is retroactive to the first day of active duty**, not to the day you ask.
 *     Interest above 6% charged since 2026-07-31 must be forgiven — not deferred, not
 *     recalculated later. Applying in November still recovers August through October.
 *  2. **Forgiven, not deferred.** The excess above 6% is written off permanently. This
 *     is the rare case where the creditor does not get the money back afterwards.
 *  3. **It is not automatic.** You must invoke it, in writing, with a copy of the
 *     orders. Creditors are not required to notice you deployed.
 *
 * It only reaches pre-service obligations, so anything opened after 2026-07-31 is out
 * of scope. Chase is excluded here for a different reason: it is under a negotiated
 * agreement, and re-opening the terms risks the arrangement for a cap on a balance
 * whose payment is already fixed at $110. Leave that one alone.
 *
 * NOT LEGAL ADVICE.
 */
export const SCRA_INTEREST_CAP = 0.06

export interface ScraTarget {
  creditor: string
  /** Matching `Debt.key`, where this is one of the tracked balances. */
  debtKey?: string
  reason: string
}

export const SCRA_TARGETS: ScraTarget[] = [
  {
    creditor: 'Avant',
    debtKey: 'avant',
    reason:
      'DO THIS ONE FIRST. Instalment loan, $4,928.97, at a personal-loan rate you have ' +
      'described as high. Every point above 6% is about $49 a year here, so the cap is ' +
      'worth roughly $200-$1,500 a year — more than every card on this list combined, ' +
      'and unlike a card the balance does not shrink on its own.',
  },
  {
    creditor: 'Wells Fargo Platinum',
    debtKey: 'platinum',
    reason:
      'Open account, $1,198.89, and the largest live credit line. Confirmed 2026-08-05 ' +
      'to be the same account as "Wells Fargo" — one card, so one letter.',
  },
  { creditor: 'Citi', debtKey: 'citi', reason: 'Closed account, $1,777 balance still accruing.' },
  {
    creditor: 'Capital One',
    debtKey: 'capital_one',
    reason: 'Closed account, $3,489 — the largest balance the cap can reach.',
  },
  { creditor: 'Brightway', debtKey: 'brightway', reason: 'Open account, $568.' },
  { creditor: 'Credit One', debtKey: 'credit_one', reason: 'Open account, $454.' },
]

/**
 * Deliberately excluded. Kept as data rather than an omission so the reasoning survives
 * being forgotten.
 */
export const SCRA_EXCLUDED: ScraTarget[] = [
  {
    creditor: 'Chase',
    debtKey: 'chase',
    reason:
      'Your call, and it stands. The arrangement is old and the account closed, so ' +
      'there is less to protect than I first assumed — but there is also less to gain: ' +
      'the payment is fixed at $110 regardless of the rate, so a cap changes nothing ' +
      'about your cashflow. Low upside either way. Leave it.',
  },
  {
    creditor: 'Goldman / PSECU',
    reason:
      'Both sued and dismissed. Do not initiate contact of any kind — see the ' +
      'limitations note above. Invoking SCRA means writing to them.',
  },
]

export const DEBTS: Debt[] = [
  // ── Open revolving. Only these move utilisation, and there is not much of it. ──
  {
    key: 'platinum',
    label: 'Wells Fargo Platinum',
    balance: 1198.89,
    instrument: 'revolving',
    posture: 'active',
    priority: 10,
    note:
      'Largest open balance, and the largest live credit line — so the single biggest ' +
      'utilisation lever you have. Open status confirmed 2026-08-05. This is the ' +
      '"Wells Fargo" account: one card, not two.',
  },
  {
    key: 'brightway',
    label: 'Brightway',
    balance: 568,
    instrument: 'revolving',
    posture: 'active',
    priority: 20,
    note: 'Clears in roughly one payday. Open status confirmed 2026-08-05.',
  },
  {
    key: 'credit_one',
    label: 'Credit One',
    balance: 454,
    instrument: 'revolving',
    posture: 'active',
    priority: 30,
    note: 'Smallest open balance — clears first. Open status confirmed 2026-08-05.',
  },

  {
    key: 'avant',
    label: 'Avant personal loan',
    balance: 4928.97,
    /**
     * An INSTALMENT loan, not a card. It has no credit line, so paying it down does
     * nothing for utilisation — which is why it sits outside the open-card bucket even
     * though it is very much live.
     */
    instrument: 'installment',
    posture: 'active',
    priority: 5,
    /** Contractual payment, so this is a bill rather than a paydown target. */
    scheduledMonthly: 210,
    /** One missed payment, owed on top of the next one. Cure this first. */
    pastDue: 250.02,
    /**
     * UNKNOWN, and left unknown rather than guessed. You said only that it is high.
     * Avant's published range runs roughly 10% to 36%; at this balance every point is
     * about $49 a year, so the SCRA cap is worth somewhere between $200 and $1,500 a
     * year depending where in that band you actually sit. Find the rate — it is the
     * single most valuable unknown left in this file.
     */
    apr: undefined,
    note:
      'Live instalment loan: $4,928.97 principal, $210/mo contractual, $250.02 past due. ' +
      'High rate, exact figure unknown. The highest-value SCRA target you have — a rate ' +
      'cap on a five-figure-ish balance at a personal-loan rate beats a cap on any of ' +
      'the cards, and unlike the cards the balance does not fall on its own.',
  },

  // ── Closed. Real balances, no credit line, so no utilisation benefit. ──
  // Ordered smallest first: closing accounts outright shortens the report, and with
  // no rate information to avalanche on, fewer open lines is the available win.
  {
    key: 'citi',
    label: 'Citi',
    balance: 1777,
    instrument: 'revolving',
    posture: 'closed',
    priority: 500,
    note: 'CLOSED. Paying it does nothing for utilisation, but it clears an account.',
  },
  {
    key: 'capital_one',
    label: 'Capital One',
    balance: 3489,
    instrument: 'revolving',
    posture: 'closed',
    priority: 510,
    note: 'CLOSED.',
  },
  {
    key: 'chase',
    label: 'Chase',
    balance: 7290,
    instrument: 'revolving',
    posture: 'closed',
    priority: 520,
    /** Confirmed 2026-08-05. Under a negotiated payment plan. */
    scheduledMonthly: 110,
    note:
      'CLOSED, and the largest of them — but under a $110/mo agreement, which takes it ' +
      'out of the paydown queue and into the bills. At $110 against $7,290 this runs ' +
      'well past the deployment; the agreement is about keeping it quiet, not clearing ' +
      'it. Your read is that the arrangement is old enough that missing one is ' +
      'survivable, so it ranks LAST among the bills and is the first thing to yield on ' +
      'a tight payday.',
  },
  {
    key: 'goldman',
    label: 'Goldman',
    balance: 22730,
    instrument: 'revolving',
    posture: 'sued_dismissed',
    priority: 900,
    note:
      'Sued, dismissed. Deprioritised deliberately. Do not make a token payment without ' +
      'checking the limitations date first — a partial payment can restart the clock.',
  },
  {
    key: 'psecu',
    label: 'PSECU',
    balance: 10922,
    instrument: 'revolving',
    posture: 'sued_dismissed',
    priority: 910,
    note:
      'Sued, dismissed. Deprioritised deliberately. Do not make a payment without checking ' +
      'the limitations date first — a partial payment can restart the clock. A credit union ' +
      'may also have a right of setoff against accounts held there, so do not park cash at PSECU.',
  },
]

/**
 * Minimum payments — ESTIMATED.
 *
 * Card issuers set these as "the greater of a flat floor or a percentage of the
 * balance", and the exact terms vary by issuer. The floor is what binds on every one of
 * your balances except Capital One, so the floor is the number that matters here.
 *
 * Two things worth knowing about the resulting figure:
 *
 *  1. **A closed account still bills a minimum.** Citi and Capital One are shut to
 *     further use, but the balance is live and a missed minimum is still a delinquency.
 *     Closing an account stops the credit line, not the obligation.
 *  2. **Paying only minimums never clears anything.** On a subprime card the minimum is
 *     close to the interest, which is why these are modelled as bills that keep the
 *     accounts current while the paydown sweep does the actual clearing. The minimum is
 *     the floor; the sweep is the acceleration. They share one balance — see `capGroup`.
 *
 * Replace with the real numbers off a statement when you have them. These are estimates
 * and they round up rather than down.
 */
export const MINIMUM_PAYMENT_FLOOR = 35
export const MINIMUM_PAYMENT_RATE = 0.02

/** Estimated monthly minimum on one balance. */
export function minimumPayment(debt: Debt): number {
  if (debt.scheduledMonthly !== undefined) return debt.scheduledMonthly
  return Math.max(MINIMUM_PAYMENT_FLOOR, Math.ceil(debt.balance * MINIMUM_PAYMENT_RATE))
}

/** Total monthly minimums across a set of balances. */
export function totalMinimums(debts: Debt[]): number {
  return Math.round(debts.reduce((s, d) => s + minimumPayment(d), 0) * 100) / 100
}

/**
 * Everything the paydown is allowed to touch: open accounts, then closed ones.
 *
 * Debts under a payment agreement are excluded — not because they are unimportant, but
 * because they are already being paid on a schedule. Leaving one here would have the
 * paydown and the agreement both funding the same balance.
 */
export function activeDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts
    .filter(
      (d) =>
        (d.posture === 'active' || d.posture === 'closed') && d.scheduledMonthly === undefined,
    )
    .sort((a, b) => a.priority - b.priority)
}

/** Debts already being paid on a schedule. These are bills, not paydown targets. */
export function scheduledDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts
    .filter((d) => d.scheduledMonthly !== undefined)
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Open REVOLVING accounts only — the balances that drive utilisation.
 *
 * Both filters matter. `posture` excludes closed cards, which have a balance but no
 * credit line. `instrument` excludes the Avant loan, which is very much open but is an
 * instalment: paying it down frees no limit, so the utilisation argument that puts this
 * bucket ahead of the cash reserve simply does not apply to it.
 */
export function openDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts
    .filter((d) => d.posture === 'active' && d.instrument === 'revolving')
    .sort((a, b) => a.priority - b.priority)
}

/** Never touched by the paydown: the two that were sued on and dismissed. */
export function deprioritisedDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts
    .filter((d) => d.posture === 'sued_dismissed')
    .sort((a, b) => a.priority - b.priority)
}

export function totalBalance(debts: Debt[]): number {
  return Math.round(debts.reduce((s, d) => s + d.balance, 0) * 100) / 100
}

export interface PaydownStep {
  debt: Debt
  paid: number
  remaining: number
  clearedAfterPayments: number | null
}

/**
 * Walk a fixed per-payday amount down the active debts in priority order.
 *
 * Deprioritised debts are never touched — not because they do not exist, but because
 * paying them is a decision with legal consequences that belongs to you, not to a
 * scheduling algorithm.
 */
export function simulatePaydown(
  perPaycheck: number,
  paychecks: number,
  debts: Debt[] = DEBTS,
): { steps: PaydownStep[]; totalPaid: number; allClearedAfter: number | null } {
  const targets = activeDebts(debts).map((debt) => ({ debt, remaining: debt.balance, paid: 0, cleared: null as number | null }))
  let totalPaid = 0

  for (let n = 1; n <= paychecks; n++) {
    let available = perPaycheck
    for (const t of targets) {
      if (available <= 0) break
      if (t.remaining <= 0) continue
      const pay = Math.min(available, t.remaining)
      t.remaining = round2(t.remaining - pay)
      t.paid = round2(t.paid + pay)
      available = round2(available - pay)
      totalPaid = round2(totalPaid + pay)
      if (t.remaining <= 0 && t.cleared === null) t.cleared = n
    }
  }

  const allCleared = targets.every((t) => t.cleared !== null)
    ? Math.max(...targets.map((t) => t.cleared!))
    : null

  return {
    steps: targets.map((t) => ({
      debt: t.debt,
      paid: t.paid,
      remaining: t.remaining,
      clearedAfterPayments: t.cleared,
    })),
    totalPaid,
    allClearedAfter: allCleared,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
