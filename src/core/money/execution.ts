/**
 * How each budget line actually gets paid: from which account, to whom, automatically or
 * by hand, and when. Plus the payments you have already scheduled.
 *
 * The payday cards read this to say, under every line, either "auto · ~20th",
 * "scheduled Fri 27 Nov (you)", "✓ paid" — or, in bold, the thing still to do.
 *
 * Account names only; no account numbers in the repo.
 */

import type { LocalDate } from '../types'

export const CHECKING = 'WF Joint Checking'
export const SAVINGS = 'Savings (buffer)'

export interface PaymentInfo {
  /** Where the money leaves from. */
  from: string
  /** Who it goes to. */
  to: string
  how: 'automatic' | 'manual'
  /** When it goes, in words: "~20th", "every 2 weeks", "on payday". */
  when: string
  /** Day of the month it drafts, when known — used to date it on the card. */
  day?: number
  note?: string
  /** True while the line may not be going out at all and needs checking. */
  unconfirmed?: boolean
}

export const PAYMENT_INFO: Record<string, PaymentInfo> = {
  mortgage_current: {
    from: CHECKING,
    to: 'Navy Federal (mortgage)',
    how: 'manual',
    when: 'when the 1st-of-month pay lands (~2 business days early)',
  },
  arrears_catchup_payment: {
    from: CHECKING,
    to: 'Navy Federal (mortgage)',
    how: 'manual',
    when: 'when the 15th pay lands',
    note: 'Mark it "apply to the oldest past-due payment".',
  },
  support_home_deployed: { from: CHECKING, to: 'Home account', how: 'manual', when: 'on payday' },
  support_home_extras: { from: CHECKING, to: 'Home account', how: 'manual', when: 'on payday' },
  support_home_extras_2027: { from: CHECKING, to: 'Home account', how: 'manual', when: 'on payday' },
  christmas: { from: CHECKING, to: 'Home account', how: 'manual', when: 'on the 15 Dec payday' },
  living_deployed: {
    from: CHECKING,
    to: 'Debit card · T-Mobile AutoPay (21st) · subscriptions',
    how: 'automatic',
    when: 'through the period',
  },
  auto_liability: { from: CHECKING, to: 'GEICO', how: 'automatic', when: '$69 every 2 weeks' },
  debt_agreements: {
    from: CHECKING,
    to: 'Chase (payment agreement)',
    how: 'automatic',
    when: 'monthly',
    note: 'Posts as "CHECK", roughly $100.',
  },
  avant_payment: { from: CHECKING, to: 'Avant', how: 'automatic', when: '~20th', day: 20 },
  card_minimums_open: {
    from: CHECKING,
    to: 'WF Platinum · Credit One · Brightway',
    how: 'manual',
    when: 'by each due date',
    // From the statements (Jul–Nov): WF Platinum by online transfer (~10th–19th);
    // Brightway as "Mastercard Payment …28" (~9th–13th); Credit One by its own ACH,
    // "Credit One Bank Payment" (Jul 9 $215, Sep 1 $90, Oct 16 $150) — not yet in November.
    note: 'November so far: Brightway $25 (9 Nov), WF Platinum $47 (10 Nov). Credit One not yet — last paid $150 on 16 Oct.',
  },
  card_minimums_closed: {
    from: CHECKING,
    to: 'Citi · Capital One',
    how: 'manual',
    when: 'by each due date',
    unconfirmed: true,
    note: 'May not be going out right now — you are checking.',
  },
  nth_investments: {
    from: CHECKING,
    to: 'Bank of America (Nth) by ACH',
    how: 'automatic',
    when: 'early in the month',
    note: 'Set up the ACH before the 1 Dec transfer.',
  },
  late_payments: {
    from: CHECKING,
    to: 'Caine & Weiner (Progressive)',
    how: 'manual',
    when: 'once the settlement letter is in hand',
  },
  car_payoff_now: { from: CHECKING, to: 'Westlake', how: 'manual', when: 'done' },
  lawn_winter: { from: CHECKING, to: 'Lawn service (Cash App)', how: 'manual', when: '~$70 a cut, every ~4 weeks' },
  lawn_spring: { from: CHECKING, to: 'Lawn service (Cash App)', how: 'manual', when: '~$70 a cut, every ~2 weeks' },
  emergency_starter: { from: CHECKING, to: SAVINGS, how: 'manual', when: 'on payday' },
  emergency_fund: { from: CHECKING, to: SAVINGS, how: 'manual', when: 'on payday' },
  sdp: { from: CHECKING, to: 'SDP (finance)', how: 'manual', when: 'by allotment' },
  student_loan_payment: { from: CHECKING, to: 'Nelnet', how: 'automatic', when: '10th', day: 10 },
}

/** Payments you have already set up for a specific paycheck. */
export interface Scheduled {
  key: string
  /** scheduledDate of the paycheck it belongs to. */
  payday: LocalDate
  date: LocalDate
  by: 'you' | 'autopay'
}

export const SCHEDULED: Scheduled[] = [
  // Your note, 18 Nov: the October mortgage payment is scheduled for 27 Nov.
  { key: 'mortgage_current', payday: '2026-12-01', date: '2026-11-27', by: 'you' },
]

export function scheduledFor(key: string, payday: LocalDate): Scheduled | undefined {
  return SCHEDULED.find((s) => s.key === key && s.payday === payday)
}

/** What pays each part of "your own spending". */
export const SPENDING_INFO: Record<string, PaymentInfo> = {
  phone: { from: CHECKING, to: 'T-Mobile', how: 'automatic', when: 'AutoPay, 21st', day: 21 },
  software: { from: CHECKING, to: 'Subscriptions (Claude, Apple, Hugedomains…)', how: 'automatic', when: 'as they renew' },
  personal_local: { from: CHECKING, to: 'Debit card, Cash App', how: 'automatic', when: 'as you spend' },
  entertainment: { from: CHECKING, to: 'Debit card', how: 'automatic', when: 'as you spend' },
  home_services: { from: CHECKING, to: 'HVAC plan, lawn', how: 'automatic', when: 'as billed' },
  fuel: { from: CHECKING, to: 'Debit card', how: 'automatic', when: 'as you spend' },
}

/** One-time set-up tasks tied to a paycheck's line — shown as a to-do until done. */
export const SETUP_TODOS: { key: string; payday: LocalDate; text: string }[] = [
  { key: 'nth_investments', payday: '2026-12-01', text: 'Set up the ACH before this transfer (or it goes as a $30 wire)' },
]
