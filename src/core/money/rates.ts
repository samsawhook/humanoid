/**
 * Pay rates and the deployment entitlement timeline.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  EVERY DOLLAR FIGURE IN THIS FILE IS AN ESTIMATE UNTIL MARKED `high`.
 *  Two of them are load-bearing and I am NOT confident in them — `basePay` and
 *  `bah`. Correct those two from an LES or the 2026 DFAS tables and every
 *  downstream number in the app is right. Nothing else needs to change.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * This file is deliberately data-shaped and boring. It is the thing you will come
 * back to edit, so it should never require reading any other file to understand.
 */

import type { LocalDate } from '../types'

export type Confidence = 'high' | 'medium' | 'low'

export interface Entitlement {
  key: string
  label: string
  /** Monthly amount in dollars. Semi-monthly paychecks get half. */
  monthlyAmount: number
  /**
   * Subject to federal income tax before CZTE is applied.
   * Allowances (BAH, BAS, FSA) are never taxable. Base pay and special pays are.
   */
  taxable: boolean
  /** Subject to FICA. In practice: base pay only. */
  fica: boolean
  activeFrom: LocalDate | null
  activeTo: LocalDate | null
  confidence: Confidence
  note: string
}

/**
 * Dates driving the entitlement timeline, all derived from what you told me.
 * Timing matters as much as the amounts, so every one of these is explicit and
 * dated rather than computed from a vague offset.
 */
export const TIMELINE = {
  /** Pre-mob started. */
  premobStart: '2026-07-31' as LocalDate,
  /** Ship out — "30 days" from 2026-08-05. */
  deploymentStart: '2026-09-04' as LocalDate,
  /**
   * CZTE begins. You said 30 days from now, which lands on the ship date — correct,
   * since the exclusion attaches to being in the zone.
   */
  czteStart: '2026-09-04' as LocalDate,
  /** HDP and IDP attach on arrival in theater. */
  theaterArrival: '2026-09-04' as LocalDate,
  /**
   * FSA — "30 days in". AMBIGUOUS: I read this as 30 days after departure, not 30
   * days from today. If you meant from today, change to 2026-09-04.
   */
  fsaStart: '2026-10-04' as LocalDate,
  /**
   * ODP — "60 days from start". AMBIGUOUS: "start" could be pre-mob (→ 2026-09-29)
   * or deployment (→ 2026-11-03). I used deployment. Change this line if wrong.
   */
  odpStart: '2026-11-03' as LocalDate,
  /**
   * Expected return. 400-day orders, but you said last time ran 10–11 months, so this
   * is the 11-month read. `date_confidence: low` — it is a planning assumption, not a
   * fact, and the system treats self-imposed dates as movable.
   */
  expectedReturn: '2027-08-04' as LocalDate,
  /** Hard ceiling from the orders. */
  ordersMaxEnd: '2027-10-04' as LocalDate,
} as const

export const ENTITLEMENTS: Entitlement[] = [
  {
    key: 'base_pay',
    label: 'Base pay — E-6, 10 yrs TIS',
    monthlyAmount: 4900,
    taxable: true,
    fica: true,
    activeFrom: null,
    activeTo: null,
    confidence: 'low',
    note: 'CONFIRM. Biggest single number in the model. Read it off an LES.',
  },
  {
    key: 'bah',
    label: 'BAH — with dependents, ZIP 78404',
    monthlyAmount: 1750,
    taxable: false,
    fica: false,
    activeFrom: null,
    activeTo: null,
    confidence: 'low',
    note: 'CONFIRM. Continues at the HOR rate throughout the deployment.',
  },
  {
    key: 'bas',
    label: 'BAS — enlisted',
    monthlyAmount: 475,
    taxable: false,
    fica: false,
    activeFrom: null,
    activeTo: null,
    confidence: 'medium',
    note: 'Flat enlisted rate; moves a little each year.',
  },
  {
    key: 'fsa',
    label: 'FSA — Family Separation Allowance',
    monthlyAmount: 250,
    taxable: false,
    fica: false,
    activeFrom: TIMELINE.fsaStart,
    activeTo: TIMELINE.expectedReturn,
    confidence: 'high',
    note: 'Has been $250/mo for a long time. Start date is the uncertain part, not the amount.',
  },
  {
    key: 'idp',
    label: 'IDP / HFP — Imminent Danger Pay',
    monthlyAmount: 225,
    taxable: true,
    fica: false,
    activeFrom: TIMELINE.theaterArrival,
    activeTo: TIMELINE.expectedReturn,
    confidence: 'high',
    note:
      'You called this "HDP is $225". $225/mo is the standard IDP/HFP rate, so I have ' +
      'labelled it IDP. If you are also drawing a separate HDP-L, add it as its own row.',
  },
  {
    key: 'odp',
    label: 'ODP — $100 tier',
    monthlyAmount: 100,
    taxable: true,
    fica: false,
    activeFrom: TIMELINE.odpStart,
    activeTo: TIMELINE.expectedReturn,
    confidence: 'medium',
    note: 'Your figure. $100 matches an HDP-L tier; confirm which entitlement this is.',
  },
]

/**
 * Tax assumptions.
 *
 * CZTE for enlisted excludes ALL military pay earned in the zone from federal income
 * tax — it does not raise gross, it raises net, which is why it shows up here rather
 * than as an entitlement row. FICA is NOT excluded and keeps coming out of base pay.
 */
export const TAX = {
  /**
   * Effective federal income tax rate on taxable pay outside CZTE. A blunt instrument
   * standing in for withholding; adjust once you can see an actual LES.
   */
  effectiveFederalRate: 0.1,
  /** Social Security 6.2% + Medicare 1.45%. Applies to base pay, CZTE or not. */
  ficaRate: 0.0765,
  /** Texas. */
  stateRate: 0,
  confidence: 'medium' as Confidence,
}
