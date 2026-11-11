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
import type { WindfallClaim } from './windfall'
import { backPay, EXPECTED_BACK_PAY } from './drillPay'
import { TIMELINE } from './rates'
import { householdTotals, deployedActualsTotal, SENT_HOME } from './household'
import { SDP_CAP, SDP_LAST_DEPOSIT } from './sdp'
import { DEBTS, scheduledDebts, openDebts, totalBalance, totalMinimums } from './debts'

/**
 * Household running costs, split by profile and derived from the Monarch categories
 * rather than typed in as one number. `deployed` drops personal consumption and
 * raises what is sent home; see household.ts for the per-category multipliers.
 */
const HOME = householdTotals('home')

/** One month of household running costs. Capped, so it completes rather than billing forever. */
export const EMERGENCY_FUND_TARGET = 4500
/**
 * The first slice of it, ahead of the open cards. Last year's arrears started with no
 * cash at all: one bad month had nowhere to land. $1,000 in cash is the cheapest
 * insurance in this file, and it comes before anything that chases a return.
 */
export const STARTER_BUFFER = 1000

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
  DEBTS.filter((d) => d.posture === 'closed' && d.scheduledMonthly === undefined),
)

/** Closed accounts still bill a minimum: the credit line is gone, the balance is not. */
const CLOSED_DEBTS = DEBTS.filter(
  (d) => d.posture === 'closed' && d.scheduledMonthly === undefined,
)

/** Estimated monthly minimums. See minimumPayment() in debts.ts for the basis. */
export const OPEN_CARD_MINIMUMS = totalMinimums(openDebts())
export const CLOSED_CARD_MINIMUMS = totalMinimums(CLOSED_DEBTS)

/**
 * Debts already being paid on their own schedule, each with its own obligation line
 * below. Pulled out individually rather than summed: they have different creditors,
 * different consequences for missing one, and therefore different priorities. A single
 * "scheduled payments" total would have quietly merged Chase — which you are content to
 * miss — with Avant, which you are not.
 */
const debtBy = (key: string) => {
  const d = DEBTS.find((x) => x.key === key)
  if (!d) throw new Error(`unknown debt: ${key}`)
  return d
}

export const AGREEMENT_MONTHLY = debtBy('chase').scheduledMonthly ?? 0
export const AVANT_MONTHLY = debtBy('avant').scheduledMonthly ?? 0
export const AVANT_PAST_DUE = debtBy('avant').pastDue ?? 0
export const AVANT_BALANCE = debtBy('avant').balance

/** Sanity: every scheduled debt must have a line, or it silently goes unpaid. */
const SCHEDULED_KEYS = scheduledDebts().map((d) => d.key)

/**
 * Accumulated toll charges and late fees. Your estimate, ~$1,100.
 * Cleared early on purpose — see the note on the obligation.
 */
export const LATE_PAYMENTS_BALANCE = 1100

/** What the drill back pay is actually worth after tax. Computed, never typed in. */
export const EXPECTED_BACK_PAY_NET = backPay(EXPECTED_BACK_PAY).net

/**
 * The date the plan below was last re-based to reality. Every balance in this file is
 * "as of" this day, and the plan starts at the first payday after it.
 *
 * Re-based 2026-11-11 from a Monarch read plus your corrections. The August plan this
 * replaces is in git history and in the decision log (LIFE_DASH.md, Round 2) — it is
 * not kept alive here, because a plan that starts in the past re-pays bills that have
 * already been paid.
 */
export const PLAN_AS_OF = '2026-11-11' as const
/** First payday the plan allocates. 2026-11-15 is a Sunday, so it lands 2026-11-13. */
export const PLAN_START = '2026-11-15' as const

/**
 * One monthly mortgage payment: $1,381.79, from the checking statements — five of the
 * six payments Aug–Nov were exactly this (one was $1,387.79). See statements.ts.
 */
export const MORTGAGE_PAYMENT = 1381.79

/**
 * Missed payments still to make good, as of PLAN_AS_OF.
 *
 * "Nearly complete, ending January" (2026-11-11). Monarch shows two payments in
 * September and one in October, so the catch-up is paid in whole extra payments rather
 * than every month. Modelled as two to go, on the 15 December and 15 January cheques;
 * if the count is different, change it here — the end date is MORTGAGE_CATCHUP_LAST.
 */
export const MORTGAGE_ARREARS_PAYMENTS_LEFT = 2
/** Your call, 2026-11-11: the catch-up finishes in January. The last extra payment is the 15 January cheque. */
export const MORTGAGE_CATCHUP_LAST = '2027-01-15' as const
export const MORTGAGE_ARREARS_BALANCE =
  Math.round(MORTGAGE_ARREARS_PAYMENTS_LEFT * MORTGAGE_PAYMENT * 100) / 100

/** Your figure, 2026-11-11: "roughly $850 left". It pays off and the line disappears. */
export const CAR_LOAN_BALANCE = 850
/** Monthly instalment as Monarch saw it drafting in November. Was $330 in the August plan. */
export const CAR_PAYMENT = 355

/**
 * Money arriving outside the semi-monthly cycle.
 *
 * The paycheck projection can only see entitlements running at a monthly rate, so
 * anything lumpy — back pay, a refund, a bonus — has to be stated here or it simply
 * does not exist to the plan.
 */
export const ALL_ONE_OFFS: OneOff[] = [
  {
    key: 'drill_back_pay',
    label: '7 MUTAs + 3 duty days — back pay',
    /**
     * A GUESS, and marked as one everywhere it is shown. "Sometime this month" is all
     * anyone knows, so 21 August is a mid-range placeholder rather than a date to plan
     * against. Nothing with a deadline is funded out of it: the 14 August cheque pays
     * what it can pay on its own, and the windfall gets its own ordered plan for
     * whenever it actually lands. See windfall.ts.
     */
    date: '2026-08-21',
    amount: EXPECTED_BACK_PAY_NET,
    note:
      'Net of federal tax and FICA, on the conservative reading of the three 1380 days. ' +
      'See drillPay.ts — the other reading is worth about $344 more. Not CZTE: drills ' +
      'performed at home station before shipping are ordinary taxable wages.',
  },
]

/**
 * One-offs still to come. Anything dated before the plan starts has either landed and
 * been spent already or is not coming; feeding it to the allocator would inject money
 * into the first payday that is not in the account.
 */
/**
 * Assume things go wrong — your instruction, 2026-11-11: "assume a couple emergencies
 * happen". Neither is predicted; both are planned for. Amounts are typical of the two
 * things most likely to break while you are away — a vehicle and the house — and the
 * dates are placeholders spaced through the deployment. What matters is not when they
 * land but that the plan absorbs them without a missed bill.
 *
 * Each is paid from the emergency fund first; the fund refills through the waterfall.
 * Only what the fund cannot cover lands on checking.
 */
export const EMERGENCIES: OneOff[] = [
  {
    key: 'emergency_vehicle',
    label: 'Emergency — vehicle repair (assumed)',
    date: '2027-02-20',
    amount: -1500,
    drawsFrom: 'emergency_fund',
  },
  {
    key: 'emergency_house',
    label: 'Emergency — house or HVAC (assumed)',
    date: '2027-06-10',
    amount: -2500,
    drawsFrom: 'emergency_fund',
  },
]

export const ONE_OFFS: OneOff[] = [
  ...ALL_ONE_OFFS.filter((o) => o.date >= PLAN_AS_OF),
  ...EMERGENCIES,
]

/**
 * What the drill back pay buys, in order, whenever it turns up.
 *
 * HISTORY as of 2026-11-11: this was the August plan for the back pay. Kept because
 * the windfall model and its tests use it as a worked example; the live plan no longer
 * schedules the back pay (see ONE_OFFS).
 *
 * Ordered by consequence-of-delay rather than by size — see windfall.ts. The car is
 * deliberately NOT here despite being the obvious candidate: it is due on the 25th and
 * already fully funded by the 14 August cheque, so putting it on this list would be
 * paying it twice and would push something genuinely exposed further down.
 */
export const BACK_PAY_CLAIMS: WindfallClaim[] = [
  {
    key: 'august_mortgage_topup',
    label: 'Top the August arrears payment up to a full month',
    /**
     * The 14 August cheque frees roughly $510 on its own. A servicer applies partials
     * from suspense once they total a monthly payment, so finishing the month is worth
     * more than the same money spread anywhere else.
     */
    cap: 790,
    because:
      'The only claim with a hard date. Around four payments behind is where a servicer ' +
      'may make its first foreclosure filing, and completing August buys a month back.',
    howTo:
      'Send it marked "for arrears — apply to the oldest outstanding payment", not as a ' +
      'principal prepayment. Confirm it left suspense.',
  },
  {
    key: 'tolls',
    label: 'Tolls and late fees',
    cap: LATE_PAYMENTS_BALANCE,
    because:
      'Escalates administratively rather than by interest: violations block a ' +
      'registration renewal, and that is not solvable from overseas. It also needs a US ' +
      'phone and card, so it is far easier before you ship than after.',
    howTo: 'Toll authority first — confirm no registration hold exists — then the rest.',
  },
  {
    key: 'next_arrears',
    label: 'Straight at the next arrears payment',
    /** Uncapped in practice; the remaining arrears are the ceiling. */
    cap: MORTGAGE_ARREARS_BALANCE,
    because:
      'Nothing else has a deadline, so anything above the first two claims goes where ' +
      'it shortens the delinquency clock.',
    howTo: 'Same servicer instruction as above.',
  },
]

export const OBLIGATIONS: Obligation[] = [
  {
    key: 'mortgage_current',
    label: 'Mortgage — current month',
    amountPerPaycheck: MORTGAGE_PAYMENT,
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
     * $355 a MONTH, drafted around the 1st — the statements show Westlake pulling on
     * 1 Nov, after two September drafts covered September and October. Funded from the
     * 1st cheque, which runs ~$480 larger than the 15th.
     */
    amountPerPaycheck: CAR_PAYMENT,
    payDays: 'first',
    /** November's $355 drafted on 1 Nov, so the first payment from the plan is 1 Dec. */
    activeFrom: '2026-11-16',
    activeTo: null,
    priority: 20,
    kind: 'secured_recurring',
    balanceCap: CAR_LOAN_BALANCE,
    execution: 'automatic',
    howTo: 'Autopay. On the final payment, confirm it closes the loan rather than leaving $2 behind.',
    note:
      '$355/mo, drafted around the 1st. About $850 left as of ' +
      '2026-11-11, capped at the balance, so it clears and then stops: December, ' +
      'January, and a ~$140 final payment in February. SCRA is active on this loan; ' +
      'verify the 6% cap on the statement.',
  },
  {
    key: 'childcare',
    label: 'Nannies (paid directly)',
    amountPerPaycheck: 750,
    payDays: 'both',
    activeFrom: '2026-08-07',
    /**
     * Ended at the 2026-11-11 re-base. The nannies are paid at home out of the $1,000
     * you send every payday (`support_home_deployed`), so a separate line here would
     * pay them twice.
     */
    activeTo: PLAN_AS_OF,
    priority: 25,
    kind: 'living',
    execution: 'manual',
    note: 'Folded into the $1,000-per-payday transfer home from 2026-11-11.',
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
    label: 'Your own spending (deployed)',
    /**
     * OBSERVED, not modelled: what actually left your accounts Sep–Nov 2026, by
     * category. See DEPLOYED_ACTUALS in household.ts. The August version of this line
     * was the at-home household scaled by guessed multipliers — about $1,733/mo against
     * roughly $1,000 actual — and most of what it was estimating (groceries, utilities,
     * pets) is now paid at home out of the money you send.
     */
    amountPerPaycheck: deployedActualsTotal() / 2,
    payDays: 'both',
    activeFrom: TIMELINE.premobStart,
    activeTo: null,
    priority: 30,
    kind: 'living',
    execution: 'automatic',
    note:
      'Observed Sep–Nov 2026 — subscriptions, phone, PX, food, the odd trip. Two months ' +
      'of data, so re-read it after a third.',
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
    label: 'Sent home — nannies and household',
    amountPerPaycheck: SENT_HOME.perPaycheck,
    payDays: 'both',
    activeFrom: TIMELINE.premobStart,
    activeTo: null,
    /**
     * Where the nannies used to sit, and for the same reason: childcare failing while
     * you are deployed cascades into everything else. Above your own spending, below
     * the house and the truck.
     */
    priority: 25,
    kind: 'living',
    execution: 'manual',
    howTo: 'Transfer $1,000 home the day the pay lands. Covers the nannies and the household.',
    note:
      'Your figure, 2026-11-11: $1,000 every payday, and it covers the nannies. Replaces ' +
      'the August model of $750 nannies plus a 1.4× support estimate — together about ' +
      '$2,560/mo against the $2,000 you actually send.',
  },
  {
    key: 'support_home_extras',
    label: 'Sent home — extras',
    amountPerPaycheck: SENT_HOME.extrasMonthly / 2,
    payDays: 'both',
    activeFrom: PLAN_AS_OF,
    activeTo: null,
    /** Below your own spending: this is the line that flexes when a payday is tight. */
    priority: 31,
    kind: 'living',
    execution: 'manual',
    howTo: 'Christmas, a trip, a specific problem. Not a standing transfer.',
    note: SENT_HOME.extrasBasis,
  },
  {
    key: 'nth_investments',
    label: 'Nth Investments (+ $30 wire fee)',
    /**
     * $500 sent by outgoing WIRE, and Wells Fargo charges $30 for each one — on the
     * statements in September, October and November. So it costs $530 to invest $500:
     * a 6% drag before the money does anything. An ACH transfer would be free; see the
     * `wire_to_ach` move in briefing.ts.
     */
    amountPerPaycheck: 530,
    /** Confirmed 2026-11-11 to be the Bank of America transfer, which posts early in the month. */
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 35,
    kind: 'secured_recurring',
    execution: 'automatic',
    note: '$500/mo to Bank of America — Oct and Nov in Monarch. Was modelled at $461 on the 15th.',
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
    key: 'avant_past_due',
    label: 'Avant — cure the missed payment',
    /**
     * $250.02 already missed on a LIVE instalment loan. Ranked above the ordinary
     * payment and above the card minimums, because a delinquency that keeps ageing is
     * reported every month it stays open, and this is small enough to end outright.
     * One cheap action that stops a recurring harm.
     */
    amountPerPaycheck: AVANT_PAST_DUE,
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 34,
    kind: 'unsecured_debt',
    balanceCap: AVANT_PAST_DUE,
    capGroup: 'avant',
    execution: 'manual',
    howTo: 'Pay the past-due amount separately from the regular instalment so it is applied to the arrears.',
    note: 'One-off. Clears on the first payday it can and the line disappears.',
  },
  {
    key: 'avant_payment',
    label: 'Avant personal loan — monthly',
    /**
     * Contractual instalment on a live loan, so it is a bill like the mortgage rather
     * than a paydown target. Ranked with the card minimums: missing it damages a live
     * account, but nothing here forecloses.
     */
    amountPerPaycheck: AVANT_MONTHLY,
    /** Avant drafts around the 20th–23rd (statements), so it is the 15th cheque's bill. */
    payDays: 'fifteenth',
    activeFrom: null,
    activeTo: null,
    priority: 37,
    kind: 'unsecured_debt',
    balanceCap: AVANT_BALANCE,
    capGroup: 'avant',
    execution: 'manual',
    howTo: 'Autopay it. High rate and no credit line, so there is nothing clever to do here — just do not miss it.',
    note:
      '$210/mo against $4,928.97. RATE UNKNOWN and described as high, which makes the ' +
      'SCRA cap the highest-value single action available: every point above 6% is ' +
      'about $49 a year at this balance.',
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
    /**
     * LAST of the bills, and therefore the designated give.
     *
     * It sat above the card minimums until you pointed out it is a closed account on an
     * old arrangement and missing one is not the end of the world. That is a judgement
     * about consequences, and it belongs in the priority order rather than in a note:
     * on a payday that cannot cover everything, this is the line that should yield —
     * before the nannies, before the household, before a live credit line.
     */
    priority: 39,
    kind: 'unsecured_debt',
    execution: 'manual',
    howTo: 'Chase, agreed monthly amount.',
    note:
      '$110/mo against $7,290 — it does not clear inside the deployment and is not meant ' +
      'to. Your read: closed account, old arrangement, missing one is survivable. So it ' +
      'ranks last among the bills and yields first when a payday is tight. Still ABOVE ' +
      'the waterfall, because $110 a month is cheap insurance against the account waking ' +
      'up; just not above the roof, the nannies, or a live credit line.',
  },
  {
    key: 'arrears_catchup_payment',
    label: 'Mortgage — second full payment (catch-up)',
    /**
     * What you are actually doing: whole extra payments on top of the current one,
     * finishing in January. A bill on a date, not a sweep —
     * the August plan swept partials at the arrears and projected May 2027; paying in
     * whole months beat it by five.
     *
     * Shares the arrears balance via `capGroup`, so it stops by itself once the missed
     * payments are made good rather than becoming a prepayment.
     */
    amountPerPaycheck: MORTGAGE_PAYMENT,
    payDays: 'fifteenth',
    /** Starts with the 15 December cheque; the 15 November one is left to rebuild the buffer. */
    activeFrom: '2026-11-16',
    activeTo: MORTGAGE_CATCHUP_LAST,
    priority: 38,
    /** A bill, not the gauge: if it cannot be paid in full the page should say so. */
    kind: 'secured_recurring',
    balanceCap: MORTGAGE_ARREARS_BALANCE,
    capGroup: 'mortgage_arrears',
    execution: 'manual',
    howTo:
      'Send the full payment marked "for arrears — apply to the oldest outstanding ' +
      'payment", not as a principal prepayment. Confirm it left suspense.',
    note:
      'Extra full payment on the 15th. Two left as of 2026-11-11 (15 Dec, 15 Jan), ' +
      'then current and the line disappears.',
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
     * Backstop only. The fixed catch-up bill above is what cures the arrears; this
     * takes spare money at them only if that bill ever comes up short.
     */
    /**
     * Off until the scheduled catch-up is over. You pay in WHOLE payments; letting the
     * sweep send spare partials in November turned January's payment into $50.
     */
    activeFrom: '2027-01-16',
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
    key: 'emergency_starter',
    label: 'Cash buffer — first $1,000',
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 47,
    kind: 'savings',
    target: true,
    balanceCap: STARTER_BUFFER,
    /** The first slice of the emergency fund: one balance, filled in two stages. */
    capGroup: 'emergency_fund',
    execution: 'manual',
    howTo: 'A savings account with no card attached. Not the SDP — this has to be reachable tonight.',
    note:
      'Liquidity before yield. Every other line below is worth more on paper; none of ' +
      'them helps the night something breaks.',
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
    key: 'sdp',
    label: 'Savings Deposit Program — 10%, deployed only',
    amountPerPaycheck: 0,
    sweep: true,
    payDays: 'both',
    activeFrom: null,
    /** Deposits close when you leave theatre. A window, not a deadline. */
    activeTo: SDP_LAST_DEPOSIT,
    priority: 55,
    kind: 'savings',
    target: true,
    balanceCap: SDP_CAP,
    execution: 'manual',
    howTo:
      'Start an SDP allotment in myPay (or deposit at finance) and set it to whatever ' +
      'this line shows. Confirm eligibility with finance before the first deposit.',
    note:
      '10% guaranteed, up to $10,000, compounded quarterly — only while deployed. Ahead ' +
      'of the rest of the emergency fund and the closed cards because those can be done ' +
      'any time and this cannot. It pays itself out within 120 days of leaving theatre, ' +
      'which is when the deployment pay stops: the SDP becomes the cash for coming home. ' +
      'See sdp.ts.',
  },
  {
    key: 'emergency_fund',
    label: 'Emergency fund — rest of one month',
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
    capGroup: 'emergency_fund',
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
