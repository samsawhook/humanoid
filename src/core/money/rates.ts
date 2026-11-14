/**
 * Pay rates and the deployment entitlement timeline.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  Base pay, BAH, FSA, IDP and ODP are all confirmed figures as of 2026-08-05.
 *  BAS and the tax rates remain estimates — see the `confidence` field on each.
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
  /** FSA — 30 days from pre-mob start (2026-07-31). Confirmed. */
  fsaStart: '2026-08-30' as LocalDate,
  /** ODP — 60 days from pre-mob start (2026-07-31). Confirmed. */
  odpStart: '2026-09-29' as LocalDate,
  /**
   * Leaving theatre. Your read, 2026-11-14: "probably back in June". Was the 11-month
   * read (4 Aug). FSA, IDP and ODP stop here, and so do SDP deposits.
   * `date_confidence: low` — a planning assumption, not a fact.
   */
  expectedReturn: '2027-06-05' as LocalDate,
  /**
   * CZTE covers every month with a day in the zone, so all of June's pay is still
   * tax-free. From July it is taxed.
   */
  czteEnd: '2027-06-30' as LocalDate,
  /**
   * Released from active duty. Your guess, 2026-11-14: paid "with leave etc through July".
   * July pay is full base, BAH and BAS, but taxed — no CZTE, FSA, IDP or ODP.
   */
  refrad: '2027-07-31' as LocalDate,
  /** The last active-duty payday — the end of every deployed-pay projection. */
  lastPayday: '2027-08-01' as LocalDate,
  /** Hard ceiling from the orders. */
  ordersMaxEnd: '2027-10-04' as LocalDate,
} as const

export const ENTITLEMENTS: Entitlement[] = [
  {
    key: 'base_pay',
    label: 'Base pay — E-6, 10 yrs TIS',
    monthlyAmount: 4759.5,
    taxable: true,
    fica: true,
    activeFrom: null,
    activeTo: null,
    confidence: 'high',
    note: 'Confirmed 2026-08-05.',
  },
  {
    key: 'bah',
    label: 'BAH — with dependents, ZIP 78404',
    monthlyAmount: 2217,
    taxable: false,
    fica: false,
    activeFrom: null,
    activeTo: null,
    confidence: 'high',
    note: 'Confirmed 2026-08-05. Continues at the HOR rate throughout the deployment.',
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
    monthlyAmount: 300,
    taxable: false,
    fica: false,
    activeFrom: TIMELINE.fsaStart,
    activeTo: TIMELINE.expectedReturn,
    confidence: 'high',
    note: 'Confirmed 2026-08-05. Starts 30 days after pre-mob began.',
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
    confidence: 'high',
    note: 'Confirmed 2026-08-05. Starts 60 days after pre-mob began.',
  },
]

/**
 * Deductions — money that appears as an entitlement and is then taken back.
 *
 * Kept separate from entitlements rather than netted off them, because that is how an
 * LES reads and because gross should stay gross: BAS is still paid, it is simply
 * collected for meals. Netting it away would understate gross and quietly corrupt the
 * taxable-pay arithmetic.
 */
export interface Deduction {
  key: string
  label: string
  monthlyAmount: number
  /**
   * False keeps a deduction on file without taking it — for one the evidence says is
   * not happening but which nobody has confirmed against an LES. Defaults to true.
   */
  applied?: boolean
  activeFrom: LocalDate | null
  activeTo: LocalDate | null
  confidence: Confidence
  note: string
}

export const DEDUCTIONS: Deduction[] = [
  {
    key: 'sglv',
    label: 'SGLI / SGLV premium',
    monthlyAmount: 50,
    /** Runs throughout — it does not stop when you come home. */
    activeFrom: null,
    activeTo: null,
    confidence: 'medium',
    note:
      'Your figure, ~$50/mo. Covers the SGLI premium plus TSGLI and any family cover. ' +
      'Unlike the meal collection this never switches off, so it is in every paycheck.',
  },
  {
    key: 'tsp',
    label: 'TSP — 5% of base pay',
    /** 5% of $4,759.50. Your rate, 2026-11-11 — the most that earns the full match. */
    monthlyAmount: 237.98,
    activeFrom: null,
    activeTo: null,
    confidence: 'high',
    note:
      'Your figure: 5%, to take the full match. Roth vs traditional is not recorded. Under ' +
      'CZTE, Roth is the better side — the pay going in is already tax-free, and Roth ' +
      'keeps it tax-free coming out.',
  },
  {
    key: 'meal_collection',
    label: 'Meal collection (DFAC)',
    /** Collected at the BAS rate, so the two cancel while you are being fed. */
    monthlyAmount: 475,
    activeFrom: TIMELINE.deploymentStart,
    activeTo: TIMELINE.expectedReturn,
    /**
     * DOUBTFUL since 2026-11-11. Actual take-home is about $7,500/mo after every
     * deduction including TSP. With this collection the model nets about $6,950; without
     * it, about $7,425 — within 1% of what lands. So the evidence says it is not being
     * taken. Kept, switched off by `applied: false`, until an LES settles it.
     */
    confidence: 'low',
    applied: false,
    note:
      'You said BAS is deducted for DFAC. Modelled as a collection at the BAS rate, ' +
      'so BAS still shows as an entitlement and nets to zero — which is how the LES ' +
      'reads and keeps gross honest.',
  },
]

/**
 * Tax assumptions.
 *
 * CZTE for enlisted excludes ALL military pay earned in the zone from federal income
 * tax — it does not raise gross, it raises net, which is why it shows up here rather
 * than as an entitlement row. FICA is NOT excluded and keeps coming out of base pay.
 */
/**
 * Take-home as it actually lands, per month, after every deduction. Your figure,
 * 2026-11-11, and Monarch agrees (September: $7,603). The model is checked against it
 * rather than forced to it: if the two drift apart by more than a few percent, a rate
 * or a deduction above is wrong, and the test that compares them says so.
 */
export const OBSERVED_NET_MONTHLY = 7500

/**
 * The 1st cheque is bigger than the 15th — about 53% of the month lands on the 1st
 * (Oct: $3,958 / $3,491; Nov: $4,005 / $3,491, from the statements). The model splits
 * a month's net evenly, so this shifts the difference from the 15th to the 1st once
 * the deployed pay settled (CZTE onward). Monthly totals are unchanged. Checked against
 * `observedFirstShare()` in statements.ts by a test.
 */
export const FIRST_OF_MONTH_SHARE = 0.532

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
