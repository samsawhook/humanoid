/**
 * Your actual obligations. Edit this file; it is meant to be edited.
 *
 * The priority order is a claim about what matters, and one thing in it is
 * deliberately unusual:
 *
 *   **The mortgage arrears catch-up sits LAST, not first.**
 *
 * Curing arrears matters, but it is the only line here whose *rate* is genuinely
 * yours to choose — the servicer wants the money, not a particular monthly figure.
 * So it is the pressure gauge: everything else is paid at its real cost, and
 * whatever survives flows into the arrears. The number that falls out is "how fast
 * can I actually cure this", which is a measurement rather than a wish. Paying the
 * *current* mortgage on time is a separate line and stays at the top, because
 * missing that is what creates new arrears.
 */

import type { Obligation } from './allocation'
import { TIMELINE } from './rates'
import { householdTotals } from './household'

/**
 * Household running costs, split by profile and derived from the Monarch categories
 * rather than typed in as one number. `deployed` drops personal consumption and
 * raises what is sent home; see household.ts for the per-category multipliers.
 */
const HOME = householdTotals('home')
const DEPLOYED = householdTotals('deployed')

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
    activeFrom: '2026-08-09',
    activeTo: null,
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
      '$750 on each of your paydays from 2026-08-09, so the first charge lands ' +
      '2026-08-14. Not prorated — paid on your pay dates, not accrued daily. ' +
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
    payDays: 'first',
    activeFrom: null,
    activeTo: null,
    priority: 35,
    kind: 'secured_recurring',
    execution: 'automatic',
    note: '$461/mo, paid on the 1st.',
  },
  {
    key: 'debt_paydown',
    label: 'Unsecured debt paydown (live accounts only)',
    amountPerPaycheck: 500,
    payDays: 'both',
    activeFrom: TIMELINE.czteStart,
    activeTo: null,
    priority: 40,
    kind: 'unsecured_debt',
    execution: 'manual',
    howTo: 'Pay the live accounts in order — Chase first. NEVER Goldman or PSECU; see debts.ts.',
    note:
      'Targets the six LIVE accounts (~$14.8k), not Goldman or PSECU. Those were sued ' +
      'on and dismissed; paying them is a legal decision, not a scheduling one. See debts.ts.',
  },
  {
    key: 'emergency_fund',
    label: 'Emergency fund — rebuild to one month',
    amountPerPaycheck: 250,
    payDays: 'both',
    activeFrom: TIMELINE.czteStart,
    activeTo: null,
    priority: 50,
    kind: 'savings',
    execution: 'manual',
    howTo: 'Move to a separate account you do not carry a card for.',
    note: 'Liquid balances are near zero. This is the first thing that should exist.',
  },
  {
    key: 'mortgage_arrears',
    label: 'Mortgage — arrears catch-up',
    /**
     * The ask is a full extra payment per payday; what actually gets paid is whatever
     * survives everything above it. Being last is the entire design — see the file
     * header. `balanceCap` stops it the moment the arrears are cured rather than
     * billing forever.
     */
    amountPerPaycheck: 1300,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 60,
    kind: 'arrears_catchup',
    balanceCap: MORTGAGE_ARREARS_BALANCE,
    execution: 'manual',
    howTo: 'Extra principal payment to the servicer, marked for arrears — not as a prepayment.',
    note:
      'THE PRESSURE GAUGE. Last in priority on purpose: everything else is paid at ' +
      'its real cost and this absorbs what is left, so the clearance date is a ' +
      'measurement rather than a hope.',
  },
]
