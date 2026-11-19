/**
 * Tech, item by item — from the Wells Fargo statements (Jul–Nov 2026), your bank-app
 * screenshots and the T-Mobile bill issued 7 Nov 2026. Nothing from Monarch. Everything drafts from WF Joint Checking by debit card.
 *
 * Each item sits on the paycheck whose spending window holds its draft day: the 1st's money
 * is spendable from ~the 27th, the 15th's from ~the 11th. So almost every subscription
 * lands on the 1st, and the phone on the 15th.
 *
 * No numbers that identify an account or a place.
 */

import type { LocalDate } from '../types'

export interface TechItem {
  key: string
  name: string
  /** What it is, in a few words. */
  what: string
  amount: number
  /** Day of the month it drafts. */
  day?: number
  /** Which paycheck carries it. */
  payday?: 'first' | 'fifteenth'
  /** Matches its payments in the actuals. */
  match?: RegExp
  /** What the statements show. */
  seen?: string
  from?: LocalDate
  to?: LocalDate
  note?: string
}

export const SUBSCRIPTIONS: TechItem[] = [
  {
    key: 'hugedomains',
    name: 'Hugedomains — sawhook.com',
    what: 'domain, lease-to-own',
    amount: 99.79,
    day: 31,
    payday: 'first',
    match: /Hugedomains/i,
    seen: '31 Aug, 30 Sep, 31 Oct',
    note: 'Keeping (your call). Ask when it is paid off — it should drop to a yearly renewal.',
  },
  {
    key: 'squarespace',
    name: 'Squarespace',
    what: 'website',
    amount: 26.65,
    day: 30,
    payday: 'first',
    match: /Squarespace|Sqsp/i,
    seen: '30 Jul, 30 Aug, 30 Sep, 30 Oct',
  },
  {
    key: 'google',
    name: 'Google Workspace',
    what: 'email',
    amount: 21.78,
    day: 1,
    payday: 'first',
    match: /Google/i,
    seen: '13 Aug $60.81, 8 Oct $27.60, 1 Nov $21.78 — the amount has been coming down',
  },
  {
    key: 'apple_32',
    name: 'Apple — $32.48 (Super Grok)',
    what: '$30 + 8.25% Texas sales tax, through the App Store',
    amount: 32.48,
    day: 2,
    payday: 'first',
    seen: '2 Nov only',
    to: '2026-11-30',
    note: 'Cancelled 19 Nov (your note) — no charge from December.',
  },
  {
    key: 'apple_14',
    name: 'Apple — $14.06 (Monarch, monthly)',
    what: '$12.99 + tax through the App Store — replaced by Monarch yearly on 8 Oct',
    amount: 14.06,
    day: 6,
    payday: 'first',
    seen: '6 Jul, 12 Aug, 6 Sep — none since',
    to: '2026-10-07',
    note: 'Stopped: you went to the yearly plan — $106.39 on 8 Oct (your note, 19 Nov).',
  },
  {
    key: 'apple_16',
    name: 'Apple — $16.23 (Apple TV+)',
    what: '$14.99 + 8.25% Texas sales tax — entertainment',
    amount: 16.23,
    day: 8,
    payday: 'first',
    seen: '8 Jul, 6 Oct, 9 Nov',
    to: '2026-11-30',
    note: 'Cancelled 19 Nov (your note) — no charge from December.',
  },
  {
    key: 'anthropic',
    name: 'Anthropic — Claude',
    what: 'AI',
    amount: 106.6,
    day: 8,
    payday: 'first',
    match: /Anthropic|Claude/i,
    seen: '8 Oct, 9 Nov',
  },
  { key: 'apple_3', name: 'Apple — iCloud+ 200GB', what: 'storage', amount: 2.99, day: 25, payday: 'fifteenth', seen: '25th every month, Jul–Oct' },
]

/**
 * Yearly, not monthly — on the calendar rather than a paycheck: NordVPN ($100, 28 Jan, its own
 * line on the 1 Feb card) and Monarch Money ($106.39, "Recurring Payment" 8 Oct 2026 on the
 * statements; next 8 Oct 2027, after the deployment plan ends).
 */
export const YEARLY: TechItem[] = [
  { key: 'nordvpn', name: 'NordVPN', what: 'VPN, yearly', amount: 100, day: 28, note: 'Renews 28 Jan (your note).' },
  { key: 'monarch', name: 'Monarch Money', what: 'budgeting app, yearly', amount: 106.39, day: 8, seen: '8 Oct 2026', note: 'Renews ~8 Oct 2027.' },
]

const sumOf = (items: TechItem[]) => Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100
/** The subscriptions still running on a date (a cancelled one drops off after its `to`). */
export function subscriptionsOn(date: string): TechItem[] {
  return SUBSCRIPTIONS.filter((i) => (!i.from || date >= i.from) && (!i.to || date <= i.to))
}
const ongoing = subscriptionsOn('2026-12-15')
export const SUBSCRIPTIONS_ON_FIRST = sumOf(ongoing.filter((i) => i.payday === 'first'))
export const SUBSCRIPTIONS_ON_FIFTEENTH = sumOf(ongoing.filter((i) => i.payday === 'fifteenth'))
export const SUBSCRIPTIONS_MONTHLY = sumOf(ongoing)

/**
 * The T-Mobile bill, part by part (bill issued 7 Nov 2026: Go5G Military, 2 voice lines).
 * AutoPay on the 21st, from the 15th paycheck.
 */
export const PHONE_BILL: TechItem[] = [
  { key: 'plan', name: 'Go5G Military — 2 lines', what: 'plan, unlimited', amount: 100 },
  {
    key: 'iphone',
    name: 'iPhone 14 — device payment',
    what: 'installment 18 of 24; $157.49 left',
    amount: 26.25,
    to: '2027-05-31',
    note: 'Last installment on the May bill.',
  },
  { key: 'p360', name: 'Protection 360', what: '$19.00 + $1.71 tax', amount: 20.71 },
  {
    key: 'pass',
    name: 'International pass — 30 days',
    what: '30GB + unlimited calls while deployed',
    amount: 75,
    from: '2026-11-18',
    to: '2027-06-05',
    note: 'Added 18 Nov (your call). Cancel it when you are home.',
  },
]

/** The November bill's one-time charges: calls while roaming, before the pass. */
export const PHONE_ROAMING_NOV: TechItem = {
  key: 'roaming',
  name: 'Calls while roaming — one time',
  what: '170 min at $0.50 + $15.01 fees + $8.38 tax',
  amount: 108.39,
  note: 'Gone from December: the pass covers calls.',
}

export function phoneBillOn(date: string): TechItem[] {
  return PHONE_BILL.filter((i) => (!i.from || date >= i.from) && (!i.to || date <= i.to))
}
/** Plan + device + protection + pass: what AutoPay takes each month while deployed. */
export const PHONE_DEPLOYED = sumOf(phoneBillOn('2026-12-15'))
/** From June: the device is paid off and the pass is cancelled. */
export const PHONE_HOME = sumOf(phoneBillOn('2027-06-15'))
