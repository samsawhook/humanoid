/**
 * Your actual obligations. Edit this file; it is meant to be edited.
 *
 * It has two halves, and they work differently on purpose.
 *
 * **Bills** come first: mortgage, truck, nannies, household, support home, Nth, and the
 * Chase agreement. Each asks for a specific figure on a specific payday because someone
 * else chose that figure. If one goes unpaid the model says so out loud.
 *
 * **The waterfall** comes second, and asks for no figure at all. Each line takes ALL
 * the free money until its balance is cleared, then disappears and hands the whole
 * flow to the next:
 *
 *     arrears → open unsecured → emergency fund → closed unsecured → law school
 *
 * That shape matters more than it looks. Fixed monthly targets I invented — "$500 a
 * payday at the cards", "$250 a payday to savings" — quietly competed with the arrears
 * and lost the plan about $800/mo of real slack to three claims that each got a third
 * of what they needed. Sweeps finish things instead: one balance at a time, in an order
 * you chose, with the clearance dates falling out as measurements rather than wishes.
 *
 * Nothing below the bills can report a shortfall, because nothing below the bills is
 * owed a particular amount. The only question the model answers down there is "in what
 * order", and the answer is yours.
 */

import type { Obligation } from './allocation'
import { TIMELINE } from './rates'
import { householdTotals } from './household'
import { DEBTS, agreementDebts, openDebts, totalBalance } from './debts'

/**
 * Household running costs, split by profile and derived from the Monarch categories
 * rather than typed in as one number. `deployed` drops personal consumption and
 * raises what is sent home; see household.ts for the per-category multipliers.
 */
const HOME = householdTotals('home')
const DEPLOYED = householdTotals('deployed')

/** One month of household running costs. Capped, so it completes rather than billing forever. */
export const EMERGENCY_FUND_TARGET = 4500

/**
 * The three accounts that are genuinely still open — the only balances that carry a
 * credit line and therefore the only ones where paying down moves utilisation.
 */
export const OPEN_DEBT_BALANCE = totalBalance(openDebts())
/**
 * Citi and Capital One. Real balances on closed accounts: worth clearing, but they buy
 * no score improvement, so they queue behind the cash reserve rather than ahead of it.
 *
 * Chase is NOT in this figure despite also being closed — it is under a $110/mo
 * agreement, so it is paid as a bill above. Counting it here as well would fund the
 * same balance twice. Goldman and PSECU are excluded entirely: sued on and dismissed.
 */
export const CLOSED_DEBT_BALANCE = totalBalance(
  DEBTS.filter((d) => d.posture === 'closed' && d.agreementMonthly === undefined),
)

/** Total monthly cost of every negotiated payment plan. Composed, never retyped. */
export const AGREEMENT_MONTHLY = agreementDebts().reduce(
  (s, d) => s + (d.agreementMonthly ?? 0),
  0,
)

/** Four months behind at roughly $1,300 a month. */
export const MORTGAGE_ARREARS_BALANCE = 5200
/** What is actually left on the auto loan — it pays off and the line disappears. */
export const CAR_LOAN_BALANCE = 1800

export const OBLIGATIONS: Obligation[] = [
  {
    key: 'mortgage_current',
    label: 'Mortgage — current month',
    amountPerPaycheck: 1300,
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 10,
    kind: 'secured_recurring',
    execution: 'automatic',
    howTo: 'Escrowed with the servicer. Confirm it drafted — do not send it twice.',
    note: 'Paid first, always. Missing this is what creates new arrears.',
  },
  {
    key: 'car_payoff',
    label: 'Auto loan — payoff',
    /** $330 a MONTH, not per payday. It bills once, on the 1st. */
    amountPerPaycheck: 330,
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 20,
    kind: 'secured_recurring',
    balanceCap: CAR_LOAN_BALANCE,
    execution: 'automatic',
    howTo: 'Autopay. On the final payment, confirm it closes the loan rather than leaving $2 behind.',
    note:
      '$330/mo on the 1st. $1,800 left, capped at the balance, so it clears and then ' +
      'stops — roughly six payments.',
  },
  {
    key: 'childcare',
    label: 'Nannies',
    amountPerPaycheck: 750,
    payDays: 'both',
    activeFrom: '2026-08-07',
    activeTo: null,
    /** First payday covers one week, not two — the nannies start on the 7th. */
    firstPeriodAmount: 375,
    /**
     * Above household spend, below the secured lines. The house forecloses and the
     * truck gets repossessed; nannies quit, and childcare failing while you are
     * deployed cascades into everything else.
     */
    priority: 25,
    kind: 'living',
    execution: 'manual',
    howTo: 'Send to the nannies on the day the pay lands.',
    note:
      '$750 on each of your paydays from 2026-08-07; the first charge lands 2026-08-14 ' +
      'at $375, being one week rather than two. Not day-prorated after that — paid on ' +
      'your pay dates. ' +
      'Confirmed new spend: nothing resembling childcare appears anywhere in the ' +
      'Monarch history, so this is additive to the household line, not inside it.',
  },
  {
    key: 'living_home',
    label: 'Household running costs (at home)',
    amountPerPaycheck: HOME.categoryTotal / 2,
    payDays: 'both',
    activeFrom: null,
    activeTo: TIMELINE.deploymentStart,
    priority: 30,
    kind: 'living',
    execution: 'automatic',
    note: 'Derived from Monarch categories, excluding support sent home. See household.ts.',
  },
  {
    key: 'living_deployed',
    label: 'Household running costs (deployed)',
    amountPerPaycheck: DEPLOYED.categoryTotal / 2,
    payDays: 'both',
    activeFrom: TIMELINE.deploymentStart,
    activeTo: null,
    priority: 30,
    kind: 'living',
    execution: 'automatic',
    note: 'Personal consumption collapses on deployment; the household’s does not.',
  },
  {
    key: 'support_home',
    label: 'Support sent home',
    /**
     * Monarch's "Gifts" line — the largest discretionary outflow in your history, and
     * the one most likely to be mis-modelled. Split out so it is visible and arguable
     * rather than buried inside a household average.
     */
    amountPerPaycheck: HOME.support / 2,
    payDays: 'both',
    activeFrom: null,
    activeTo: TIMELINE.deploymentStart,
    priority: 28,
    kind: 'living',
    execution: 'manual',
    howTo: 'Transfer to the joint account.',
    note: '$754/mo, 12-month Monarch average.',
  },
  {
    key: 'support_home_deployed',
    label: 'Support sent home (deployed)',
    amountPerPaycheck: DEPLOYED.support / 2,
    payDays: 'both',
    activeFrom: TIMELINE.deploymentStart,
    activeTo: null,
    priority: 28,
    kind: 'living',
    execution: 'manual',
    howTo: 'Transfer to the joint account. Set a standing order before you ship — this is the one that hurts if it slips.',
    note: 'Modelled 40% higher: while away this becomes the funding channel, not a top-up.',
  },
  {
    key: 'nth_investments',
    label: 'Nth Investments',
    amountPerPaycheck: 461,
    payDays: 'fifteenth',
    activeFrom: null,
    activeTo: null,
    priority: 35,
    kind: 'secured_recurring',
    execution: 'automatic',
    note: '$461/mo, billed on the 15th.',
  },
  {
    key: 'debt_agreements',
    label: 'Chase — payment agreement',
    /**
     * A bill, not a paydown. Every other unsecured balance here is one you choose a
     * rate for; this one has a rate someone else set and a default clause attached, so
     * it sits with the mortgage and the truck rather than in the waterfall.
     *
     * ASSUMPTION: billed on the 1st. You told me the amount, not the date — if it
     * actually drafts mid-month, change `payDays` to 'fifteenth'. It shifts which
     * payday carries it, not the monthly cost.
     */
    amountPerPaycheck: AGREEMENT_MONTHLY,
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 36,
    kind: 'unsecured_debt',
    execution: 'manual',
    howTo: 'Chase, agreed monthly amount. Missing it usually voids the arrangement.',
    note:
      '$110/mo against $7,290. That does not clear it inside the deployment and is not ' +
      'meant to — the agreement keeps the account quiet and out of collections. Ranked ' +
      'above the waterfall because defaulting on an arrangement costs more than the ' +
      'payment does.',
  },
  /**
   * ────────────────────────────────────────────────────────────────────────────
   *  THE WATERFALL. Everything below this point takes ALL available free dollars,
   *  not a chosen monthly figure.
   *
   *  Each line sweeps whatever survives the bills above it until its balance is
   *  cleared, then vanishes and hands the whole flow to the next. No line asks for
   *  an amount I invented, so none of them can report a phantom shortfall — the
   *  only question the model answers is "in what order", and that order is yours:
   *
   *     arrears → open unsecured → emergency fund → closed unsecured → law school
   *
   *  Cure the house first. Then the three accounts that still have a credit line,
   *  because those are the only ones that move a score. Then a cash reserve, so the
   *  next surprise does not recreate the arrears. Then the closed balances, which
   *  are real debts but buy nothing back. Whatever outlives all of that is the law
   *  school fund.
   *
   *  Chase is not in this queue. It is under an agreement and therefore a bill.
   * ────────────────────────────────────────────────────────────────────────────
   */
  {
    key: 'mortgage_arrears',
    label: 'Mortgage — arrears catch-up',
    /**
     * First claim on every free dollar, and capped at the balance so it stops the
     * moment the house is current rather than billing forever. Still the pressure
     * gauge — the clearance date falls out of the plan rather than setting it — but
     * now it is measuring the top of the waterfall instead of the bottom.
     */
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 40,
    kind: 'arrears_catchup',
    balanceCap: MORTGAGE_ARREARS_BALANCE,
    execution: 'manual',
    howTo: 'Extra principal payment to the servicer, marked for arrears — not as a prepayment.',
    note:
      'Takes everything free until the house is current. Paying the CURRENT mortgage ' +
      'on time is a separate line at the top of the file; missing that is what creates ' +
      'new arrears in the first place.',
  },
  {
    key: 'debt_paydown_open',
    label: 'Unsecured debt — open accounts',
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 50,
    kind: 'unsecured_debt',
    balanceCap: OPEN_DEBT_BALANCE,
    execution: 'manual',
    howTo:
      'Platinum, then Brightway, then Credit One. These three are the only accounts ' +
      'with a live credit line. NEVER Goldman or PSECU.',
    note:
      'Capped at the real balance of the open accounts, so it clears and stops. ' +
      'Smaller than it looks — which is the argument for putting it ahead of the ' +
      'emergency fund rather than behind it: it is over quickly.',
  },
  {
    key: 'emergency_fund',
    label: 'Emergency fund — rebuild to one month',
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 60,
    kind: 'savings',
    /** Still a figure I picked rather than a balance anyone is owed. */
    target: true,
    balanceCap: EMERGENCY_FUND_TARGET,
    execution: 'manual',
    howTo: 'Move to a separate account you do not carry a card for.',
    note:
      'One month of household running costs. Liquid balances are near zero, and no ' +
      'reserve is what turns an ordinary bad month into arrears.',
  },
  {
    key: 'debt_paydown_closed',
    label: 'Unsecured debt — closed accounts',
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 70,
    kind: 'unsecured_debt',
    balanceCap: CLOSED_DEBT_BALANCE,
    execution: 'manual',
    howTo: 'Citi, Capital One, Chase. NEVER Goldman or PSECU — see debts.ts.',
    note:
      'Real balances on closed accounts: worth clearing, but there is no credit line ' +
      'to free up, so they queue behind the cash reserve. Goldman and PSECU are not ' +
      'in this figure — they were sued on and dismissed, and paying them is a legal ' +
      'decision rather than a scheduling one.',
  },
  {
    key: 'future_fund',
    label: 'Law school fund — everything left',
    /**
     * The terminal line: it takes whatever survives, so the remainder is always zero
     * and every dollar has a named destination. Unassigned money is the money that
     * disappears, and this is the first year of your life where a surplus exists at
     * all — it should not be discovered accidentally at the end of a month.
     */
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 999,
    kind: 'savings',
    execution: 'manual',
    howTo: 'Move to the law-school account the same day. If it stays in checking, it is spent.',
    note:
      'Sweeps the remainder. Zero on most paydays while the arrears run; it starts ' +
      'filling once those clear.',
  },
]
