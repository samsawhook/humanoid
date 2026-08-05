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

export interface Debt {
  key: string
  label: string
  balance: number
  posture: DebtPosture
  /** Lower is paid first. */
  priority: number
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

export const DEBTS: Debt[] = [
  {
    key: 'capital_one',
    label: 'Capital One',
    balance: 3489,
    posture: 'active',
    priority: 10,
    note: 'Largest OPEN balance — the one that actually moves utilisation. VERIFY still open.',
  },
  {
    key: 'citi',
    label: 'Citi',
    balance: 1777,
    posture: 'active',
    priority: 20,
    note: 'VERIFY still open.',
  },
  {
    key: 'platinum',
    label: 'Platinum Card',
    balance: 1198.89,
    posture: 'active',
    priority: 30,
    note: 'VERIFY still open.',
  },
  {
    key: 'brightway',
    label: 'Brightway',
    balance: 568,
    posture: 'active',
    priority: 40,
    note: 'Clears in one payday. VERIFY still open.',
  },
  {
    key: 'credit_one',
    label: 'Credit One',
    balance: 454,
    posture: 'active',
    priority: 50,
    note: 'Smallest open balance. VERIFY still open.',
  },
  {
    key: 'chase',
    label: 'Chase',
    balance: 7290,
    posture: 'closed',
    priority: 500,
    note:
      'CLOSED. A closed account has no credit line, so paying it does nothing for ' +
      'utilisation — my earlier "Chase first, it helps the score most" was simply wrong. ' +
      'It ranks below every open account and above the dismissed ones: the balance is ' +
      'real and unlike Goldman and PSECU there is no limitations trap in paying it.',
  },
  {
    key: 'goldman',
    label: 'Goldman',
    balance: 22730,
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
    posture: 'sued_dismissed',
    priority: 910,
    note:
      'Sued, dismissed. Deprioritised deliberately. Do not make a payment without checking ' +
      'the limitations date first — a partial payment can restart the clock. A credit union ' +
      'may also have a right of setoff against accounts held there, so do not park cash at PSECU.',
  },
]

/** Everything the paydown is allowed to touch: open accounts, then closed ones. */
export function activeDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts
    .filter((d) => d.posture === 'active' || d.posture === 'closed')
    .sort((a, b) => a.priority - b.priority)
}

/** Open revolving accounts only — the balances that drive utilisation. */
export function openDebts(debts: Debt[] = DEBTS): Debt[] {
  return debts.filter((d) => d.posture === 'active').sort((a, b) => a.priority - b.priority)
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
