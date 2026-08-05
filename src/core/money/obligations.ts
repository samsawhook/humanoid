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

import type { Obligation, OneOff } from './allocation'
import { backPay, EXPECTED_BACK_PAY } from './drillPay'
import { TIMELINE } from './rates'
import { householdTotals } from './household'
import { DEBTS, agreementDebts, openDebts, totalBalance, totalMinimums } from './debts'

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

/** Closed accounts still bill a minimum: the credit line is gone, the balance is not. */
const CLOSED_DEBTS = DEBTS.filter(
  (d) => d.posture === 'closed' && d.agreementMonthly === undefined,
)

/** Estimated monthly minimums. See minimumPayment() in debts.ts for the basis. */
export const OPEN_CARD_MINIMUMS = totalMinimums(openDebts())
export const CLOSED_CARD_MINIMUMS = totalMinimums(CLOSED_DEBTS)

/** Total monthly cost of every negotiated payment plan. Composed, never retyped. */
export const AGREEMENT_MONTHLY = agreementDebts().reduce(
  (s, d) => s + (d.agreementMonthly ?? 0),
  0,
)

/**
 * Accumulated toll charges and late fees. Your estimate, ~$1,100.
 * Cleared early on purpose — see the note on the obligation.
 */
export const LATE_PAYMENTS_BALANCE = 1100

/** What the drill back pay is actually worth after tax. Computed, never typed in. */
export const EXPECTED_BACK_PAY_NET = backPay(EXPECTED_BACK_PAY).net

/** Four months behind at roughly $1,300 a month. */
export const MORTGAGE_PAYMENT = 1300

export const MORTGAGE_ARREARS_BALANCE = 4 * MORTGAGE_PAYMENT
/** What is actually left on the auto loan — it pays off and the line disappears. */
export const CAR_LOAN_BALANCE = 1800

/**
 * Money arriving outside the semi-monthly cycle.
 *
 * The paycheck projection can only see entitlements running at a monthly rate, so
 * anything lumpy — back pay, a refund, a bonus — has to be stated here or it simply
 * does not exist to the plan.
 */
export const ONE_OFFS: OneOff[] = [
  {
    key: 'drill_back_pay',
    label: '7 MUTAs + 3 duty days — back pay',
    /**
     * Dated to the 14 August pay run, because back pay normally settles on a scheduled
     * payday and because this is what funds the full arrears payment that same day.
     *
     * This is the one optimistic date in the file, and it is load-bearing: the 14
     * August cheque frees about $510 on its own, so without the back pay the full
     * $1,300 payment below is roughly $790 short and the model will say so. If it has
     * not landed by the 14th, send what you have and send the rest on receipt.
     */
    date: '2026-08-14',
    amount: EXPECTED_BACK_PAY_NET,
    note:
      'Net of federal tax and FICA, on the conservative reading of the three 1380 days. ' +
      'See drillPay.ts — the other reading is worth about $344 more. Not CZTE: drills ' +
      'performed at home station before shipping are ordinary taxable wages.',
  },
]

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
    note:
      'DUE ON THE 1st, and funded from the 1st cheque — same-day, which is the tightest ' +
      'timing in the whole file. The forward reserve exists largely to protect this: it ' +
      'holds money back on the 15th so the 1st can clear. Paid first, always, because ' +
      'missing this is what creates new arrears. SCRA is active — verify the 6% cap.',
  },
  {
    key: 'car_payoff',
    label: 'Auto loan — payoff',
    /**
     * $330 a MONTH, not per payday, and DUE ON THE 25th — so it is funded from the
     * 15th cheque, which leaves ten days of margin instead of paying it three weeks
     * early from the 1st. That also takes $330 off the 1st, which is the crowded
     * payday: the mortgage falls there too.
     */
    amountPerPaycheck: 330,
    payDays: 'fifteenth',
    activeFrom: null,
    activeTo: null,
    priority: 20,
    kind: 'secured_recurring',
    balanceCap: CAR_LOAN_BALANCE,
    execution: 'automatic',
    howTo: 'Autopay. On the final payment, confirm it closes the loan rather than leaving $2 behind.',
    note:
      '$330/mo, due the 25th, paid from the 15th cheque. $1,800 left, capped at the ' +
      'balance, so it clears and then stops — roughly six payments. SCRA is active on ' +
      'this loan; the 6% cap should already be applied — verify it on the statement.',
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
    activeTo: TIMELINE.premobStart,
    priority: 30,
    kind: 'living',
    execution: 'automatic',
    note:
      'Derived from Monarch categories, excluding support sent home. See household.ts. ' +
      'Ends at PRE-MOB, not at the deployment date: you left home on 2026-07-31, so the ' +
      'at-home spending profile stops there. This line is effectively already over.',
  },
  {
    key: 'living_deployed',
    label: 'Household running costs (deployed)',
    amountPerPaycheck: DEPLOYED.categoryTotal / 2,
    payDays: 'both',
    activeFrom: TIMELINE.premobStart,
    activeTo: null,
    priority: 30,
    kind: 'living',
    execution: 'automatic',
    note:
      'Personal consumption collapses once you leave; the household’s does not. Runs ' +
      'from PRE-MOB (2026-07-31) rather than the deployment date — you are already away, ' +
      'so the deployed profile is the live one now, not a future state.',
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
    activeTo: TIMELINE.premobStart,
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
    activeFrom: TIMELINE.premobStart,
    activeTo: null,
    priority: 28,
    kind: 'living',
    execution: 'manual',
    howTo: 'Transfer to the joint account. Set a standing order before you ship — this is the one that hurts if it slips.',
    note:
      'Modelled 40% higher: while away this becomes the funding channel, not a top-up. ' +
      'Runs from pre-mob, since you are already gone.',
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
    key: 'card_minimums_open',
    label: 'Card minimums — open accounts',
    /**
     * A bill, not a strategy. Paying the minimum clears nothing on its own — on a
     * subprime card it barely covers the interest — but missing one is a delinquency,
     * and a delinquency on a live account undoes exactly the thing the paydown is
     * trying to buy. So it ranks with the mortgage, not with the waterfall.
     *
     * Shares `capGroup` with the paydown sweep, so the minimum and the acceleration
     * draw down ONE balance and stop together. Without that the plan would pay these
     * cards twice.
     */
    amountPerPaycheck: OPEN_CARD_MINIMUMS,
    payDays: 'fifteenth',
    activeFrom: null,
    activeTo: null,
    priority: 37,
    kind: 'unsecured_debt',
    balanceCap: OPEN_DEBT_BALANCE,
    capGroup: 'open_cards',
    execution: 'manual',
    howTo: 'Wells Fargo Platinum, Brightway, Credit One. Autopay the minimum on each so it cannot be missed.',
    note:
      'ESTIMATED at the greater of $35 or 2% of balance — the floor binds on all three. ' +
      'Replace with statement figures when you have them.',
  },
  {
    key: 'card_minimums_closed',
    label: 'Card minimums — closed accounts',
    /**
     * The one people forget. Citi and Capital One are closed to further use, but the
     * balances are live and still bill a minimum every month. Closing an account ends
     * the credit line, not the obligation.
     */
    amountPerPaycheck: CLOSED_CARD_MINIMUMS,
    payDays: 'fifteenth',
    activeFrom: null,
    activeTo: null,
    priority: 37,
    kind: 'unsecured_debt',
    balanceCap: CLOSED_DEBT_BALANCE,
    capGroup: 'closed_cards',
    execution: 'manual',
    howTo: 'Citi and Capital One. Autopay the minimum on each.',
    note:
      'ESTIMATED. Capital One is the only one where the percentage beats the floor. ' +
      'Chase is not here — its agreement IS its minimum, and it has its own line.',
  },
  {
    key: 'late_payments',
    label: 'Late payments cleanup — tolls and fees',
    /**
     * Roughly $1,100 of accumulated toll charges and late fees. Small, and exactly the
     * kind of balance that is easy to leave until later — which is why it is ranked as
     * a bill rather than put in the waterfall behind $5,200 of arrears.
     *
     * Timing is deliberate and it is the one thing here I would not defer: Texas toll
     * charges escalate administratively rather than by interest. Unpaid tolls become
     * violations, violations block registration renewal, and a blocked registration is
     * a problem you cannot solve from overseas. The absolute cost is trivial; the cost
     * of it becoming someone else's problem while you are deployed is not.
     *
     * The drill back pay lands this month and covers it outright, so in practice this
     * is funded by money the waterfall never sees.
     */
    /**
     * In the WATERFALL, immediately behind the arrears — not a fixed bill above them.
     *
     * It sat above the arrears at first, and that was wrong in a way worth recording:
     * the forward reserve dutifully held money back every fortnight to protect this
     * $1,100, which meant the arrears could never accumulate the $1,300 they needed and
     * the delinquency clock kept running. Tolls escalate over months; a 120-day
     * delinquency escalates on a date. When both want the same dollar, the deadline wins.
     */
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 45,
    kind: 'unsecured_debt',
    balanceCap: LATE_PAYMENTS_BALANCE,
    execution: 'manual',
    howTo:
      'Pay the toll authority first and confirm no registration hold exists, then the ' +
      'remaining late fees. Do this before you ship — it needs a US phone and a card.',
    note:
      '$1,100, taken in one go as soon as the mortgage is out of danger. Second in the ' +
      'waterfall rather than first, because the escalation path here is administrative ' +
      'and measured in months, where the mortgage is measured in days.',
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
  {
    key: 'arrears_first_payment',
    label: 'Mortgage — one full arrears payment, now',
    /**
     * A one-off bill rather than part of the waterfall, because it is not "whatever is
     * left" — it is a specific act with a specific purpose: put one whole payment on
     * the file before 1 September, while it is still curable.
     *
     * Shares the arrears balance via `capGroup`, so this and the sweep draw down the
     * same $5,200. Without that it would be a fifth payment on a four-payment debt.
     */
    amountPerPaycheck: MORTGAGE_PAYMENT,
    payDays: 'fifteenth',
    activeFrom: null,
    /** Only ever fires once: the 15 August cheque, which lands on the 14th. */
    activeTo: '2026-08-31',
    priority: 39,
    /**
     * A BILL, not a gauge line — deliberately not `arrears_catchup`, even though it is
     * an arrears payment. The gauge kind means two things in this model: the forward
     * reserve may throttle it, and its unmet ask is excluded from the shortfall
     * headline because asking for more than it can get is how it measures slack.
     * Neither is true here. This is a fixed amount that has to happen, and if it cannot
     * be paid that is a real miss the page should shout about.
     */
    kind: 'secured_recurring',
    balanceCap: MORTGAGE_ARREARS_BALANCE,
    capGroup: 'mortgage_arrears',
    execution: 'manual',
    howTo:
      'Send the full ' +
      '$1,300 marked "for arrears — apply to the oldest outstanding payment". Not as a ' +
      'principal prepayment, or it will be applied forward instead of backward.',
    note:
      'Funded by the drill back pay landing the same day. One whole payment buys back a ' +
      'month of the delinquency count outright, which no amount of dribbling does.',
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
    /**
     * Skips the 14 August cheque. That payday sends ONE clean full payment via
     * `arrears_first_payment`; a second, partial transfer to the same servicer on the
     * same day is just a confusing pair of entries on the statement. Whatever is left
     * that day falls through the waterfall instead.
     */
    activeFrom: '2026-08-16',
    activeTo: null,
    priority: 40,
    kind: 'arrears_catchup',
    balanceCap: MORTGAGE_ARREARS_BALANCE,
    execution: 'manual',
    howTo:
      'Send it marked "for arrears — apply to oldest outstanding payment", never as a ' +
      'principal prepayment. MAKE ONE BEFORE 1 SEPTEMBER, whatever the size.',
    note:
      'THE 120-DAY LINE. Around four payments behind is where a servicer may make its ' +
      'first foreclosure filing, which is why this is first in the waterfall and takes ' +
      'everything free from the very first cheque — a payment landing before 1 September ' +
      'is worth more than a larger one landing later, because it is evidence of ' +
      'performance while the file is still curable. Paying the CURRENT mortgage on time ' +
      'is a separate line at the top of the file; missing that adds a month back.',
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
    /** Same balance as the minimums above — the sweep accelerates, it does not duplicate. */
    capGroup: 'open_cards',
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
    capGroup: 'closed_cards',
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
