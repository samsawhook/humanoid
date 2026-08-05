/**
 * Your actual obligations. Edit this file; it is meant to be edited.
 *
 * Priority order below is a claim about what matters, not an accident of ordering:
 * cure the mortgage arrears first (the house is the largest asset and the only one
 * that can be foreclosed), then the vehicle (no truck, no drill), then living, then
 * unsecured debt, then savings. Change the numbers if you disagree — that is the
 * point of having them in one legible list.
 */

import type { Obligation } from './allocation'
import { TIMELINE } from './rates'

/**
 * Four months of double payments clears four months of arrears and keeps you current
 * at the same time: $1,300 × 2 per month × 4 months = $10,400, against roughly $5,200
 * of arrears plus $5,200 of current. Same arithmetic on the truck.
 */
export const MORTGAGE_CATCHUP_END = '2026-12-15'
export const CAR_CATCHUP_END = '2026-12-15'

export const OBLIGATIONS: Obligation[] = [
  {
    key: 'mortgage_catchup',
    label: 'Mortgage — catch-up (1st and 15th)',
    amountPerPaycheck: 1300,
    payDays: 'both',
    activeFrom: '2026-09-01',
    activeTo: MORTGAGE_CATCHUP_END,
    priority: 10,
    kind: 'arrears_catchup',
    note: '4 months behind. Double payments through December clear arrears and stay current.',
  },
  {
    key: 'mortgage_current',
    label: 'Mortgage — current',
    amountPerPaycheck: 1300,
    payDays: 'first',
    activeFrom: '2027-01-01',
    activeTo: null,
    priority: 10,
    kind: 'secured_recurring',
    note: 'Drops to a single payment once the arrears are cleared.',
  },
  {
    key: 'car_catchup',
    label: 'Car — catch-up (1st and 15th)',
    amountPerPaycheck: 330,
    payDays: 'both',
    activeFrom: '2026-09-01',
    activeTo: CAR_CATCHUP_END,
    priority: 20,
    kind: 'arrears_catchup',
  },
  {
    key: 'car_current',
    label: 'Car — current',
    amountPerPaycheck: 330,
    payDays: 'first',
    activeFrom: '2027-01-01',
    activeTo: null,
    priority: 20,
    kind: 'secured_recurring',
  },
  {
    key: 'childcare',
    label: 'Nannies',
    amountPerPaycheck: 750,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    /**
     * Above general household spend and below the secured catch-ups. The house and
     * the truck can be foreclosed and repossessed; nannies quit, and childcare failing
     * while you are deployed cascades into everything else. Reasonable people could
     * rank this above the car — change the number if you do.
     */
    priority: 25,
    kind: 'living',
    note:
      '$1,500/mo. Confirmed new spend — nothing resembling childcare appears anywhere ' +
      'in the Monarch history, so this is additive to the household line, not inside it.',
  },
  {
    key: 'living',
    label: 'Household running costs',
    /**
     * ~$1,400 per paycheck ≈ $2,800/mo. Derived from your Monarch history, which ran
     * ~$3,500/mo of total spend — with the mortgage and car payments backed out, since
     * those are their own lines above and would otherwise be counted twice.
     */
    amountPerPaycheck: 1400,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 30,
    kind: 'living',
    note: 'Estimated from Monarch, mortgage and car excluded to avoid double-counting.',
  },
  {
    key: 'debt_paydown',
    label: 'Unsecured debt paydown (avalanche: Goldman first)',
    amountPerPaycheck: 500,
    payDays: 'both',
    activeFrom: TIMELINE.czteStart,
    activeTo: null,
    priority: 40,
    kind: 'unsecured_debt',
    note: '~$48k across 8 accounts. Starts when the deployment pay does.',
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
    note: 'Liquid balances are near zero. This is the first thing that should exist.',
  },
]
