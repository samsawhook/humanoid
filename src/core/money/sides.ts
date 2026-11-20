/**
 * The paycheck cards from Sommer's side and from the household's — next to yours.
 *
 *  - Sommer: her take-home ($2,100 on the 1st and 15th, like yours) plus the cash you send
 *    in. Out: the whole regular $1,000 and any top-up to the nanny (your answer, 20 Nov),
 *    her bills (the back-home numbers, the same now — your answer, 20 Nov), and what is left
 *    split between her saving and her fun money.
 *  - Combined: your statement and hers as one household. The cash you send is a transfer
 *    between you, so "Wife & Kids" goes: the nanny lands in Childcare & kids, supplemental
 *    and Christmas money and your gifts in Gifts, her groceries in Food.
 *
 * Her bills are monthly, so each paycheck carries half of them.
 */

import { SOMMER_BUDGET, SOMMER_INCOME } from './returnBudget'
import type { PaycheckStatement, StatementLine } from './statement'

export type Owner = 'sam' | 'sommer'

export interface SideLine {
  label: string
  amount: number
  owner: Owner
  note?: string
}
export interface SideSection {
  key: string
  label: string
  lines: SideLine[]
  total: number
}
export interface SideStatement {
  /** Money coming in: pay (gross for you, take-home for her) and transfers. */
  income: SideSection
  /** Withheld from your pay (Combined only). */
  deductions?: SideSection
  sections: SideSection[]
  /** Your checking and savings change (Combined only): what is left in your accounts. */
  netCash?: SideSection
}

const r2 = (n: number) => Math.round(n * 100) / 100
const total = (ls: SideLine[]) => r2(ls.reduce((t, l) => t + l.amount, 0))
const section = (key: string, label: string, lines: SideLine[]): SideSection => ({ key, label, lines: lines.filter((l) => Math.abs(l.amount) > 0.004), total: total(lines) })

export const SIDE_ORDER: { key: string; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'car', label: 'Car' },
  { key: 'food', label: 'Food' },
  { key: 'childcare', label: 'Childcare & kids' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'personal', label: 'Personal spending' },
  { key: 'tech', label: 'Tech' },
  { key: 'debt', label: 'Debt payments' },
  { key: 'invest', label: 'Investing & saving' },
  { key: 'other', label: 'Other' },
]

/** Cash you send her (vs. things you buy her, like the robe and flowers). */
const isCashToHer = (l: StatementLine) => /^(support_home|nanny|christmas)/.test(l.key)
const isNanny = (l: StatementLine) => /^(support_home_deployed|nanny)/.test(l.key)

/** Her monthly lines, as (her category, label, monthly amount). */
const HER_PLACE: Record<string, string> = {
  'home:electric': 'home',
  'home:watergas': 'home',
  'home:wifi': 'home',
  'car:fuel': 'car',
  'sent:groceries': 'food',
  'sent:dog': 'home',
  'sent:amazon': 'home',
  'sent:baby': 'childcare',
}
function herBills(): { cat: string; label: string; monthly: number }[] {
  return SOMMER_BUDGET.flatMap((c) =>
    c.lines.filter((l) => l.share == null).map((l) => ({ cat: HER_PLACE[`${c.key}:${l.key}`] ?? c.key, label: l.label, monthly: l.amount })),
  )
}

/** Her paycheck: what is left after her half of the bills, split saving / fun. */
function herPaycheck() {
  const pay = r2(SOMMER_INCOME.amount / 2)
  const bills = herBills().map((b) => ({ ...b, amount: r2(b.monthly / 2) }))
  const left = r2(pay - bills.reduce((t, b) => t + b.amount, 0))
  return { pay, bills, save: r2(Math.max(0, left) / 2), fun: r2(Math.max(0, left) / 2), left }
}

export function sommerSide(st: PaycheckStatement): SideStatement {
  const sent = st.spending.find((s) => s.key === 'sent')?.lines.filter(isCashToHer) ?? []
  const h = herPaycheck()
  const by = (cat: string): SideLine[] => h.bills.filter((b) => b.cat === cat).map((b) => ({ label: b.label, amount: b.amount, owner: 'sommer' }))
  const fromYou = (ls: StatementLine[]): SideLine[] => ls.map((l) => ({ label: `${l.label} — from Sam`, amount: l.amount, owner: 'sam' }))
  const sections = [
    section('childcare', 'Childcare & kids', [...fromYou(sent.filter(isNanny)), ...by('childcare')]),
    section('home', 'Home', by('home')),
    section('car', 'Car', by('car')),
    section('food', 'Food', by('food')),
    section('gifts', 'Gifts', fromYou(sent.filter((l) => !isNanny(l)))),
    section('invest', 'Investing & saving', [{ label: 'Her saving — half of what is left', amount: h.save, owner: 'sommer' }]),
    section('personal', 'Personal spending', [{ label: 'Her fun money — the other half', amount: h.fun, owner: 'sommer' }]),
  ]
  return {
    income: section('income', 'Money in', [
      { label: 'Sommer — take-home pay', amount: h.pay, owner: 'sommer', note: '$63k a year; $2,100 on the 1st and 15th.' },
      ...sent.map((l): SideLine => ({ label: `From Sam — ${l.label}`, amount: l.amount, owner: 'sam' })),
    ]),
    sections: order(sections),
  }
}

export function combinedSide(st: PaycheckStatement): SideStatement {
  const h = herPaycheck()
  const buckets: Record<string, SideLine[]> = {}
  const put = (cat: string, l: SideLine) => (buckets[cat] ??= []).push(l)
  for (const s of st.spending) {
    for (const l of s.lines) {
      if (l.nonCash) continue
      const cat = s.key === 'sent' ? (isNanny(l) ? 'childcare' : 'gifts') : SIDE_ORDER.some((o) => o.key === s.key) ? s.key : 'other'
      put(cat, { label: l.label, amount: l.amount, owner: 'sam' })
    }
  }
  for (const l of st.investing.lines) if (!l.nonCash) put('invest', { label: l.label, amount: l.amount, owner: 'sam' })
  for (const b of h.bills) put(b.cat, { label: b.label, amount: b.amount, owner: 'sommer' })
  put('invest', { label: 'Her saving', amount: h.save, owner: 'sommer' })
  put('personal', { label: 'Her fun money', amount: h.fun, owner: 'sommer' })
  return {
    income: section('income', 'Money in — your gross, her take-home', [
      ...st.gross.lines.filter((l) => !l.nonCash).map((l): SideLine => ({ label: l.label, amount: l.amount, owner: 'sam' })),
      { label: 'Sommer — take-home pay', amount: h.pay, owner: 'sommer' },
    ]),
    deductions: section('deductions', 'Deductions (yours)', st.deductions.lines.filter((l) => !l.nonCash).map((l) => ({ label: l.label, amount: l.amount, owner: 'sam' as const }))),
    sections: order(SIDE_ORDER.map((o) => section(o.key, o.label, buckets[o.key] ?? []))),
    netCash: section('cash', 'Net cash — your checking & savings', st.netCash.lines.filter((l) => !l.nonCash).map((l) => ({ label: l.label, amount: l.amount, owner: 'sam' as const }))),
  }
}

function order(ss: SideSection[]): SideSection[] {
  return SIDE_ORDER.map((o) => ss.find((s) => s.key === o.key)).filter((s): s is SideSection => !!s && s.lines.length > 0)
}

/** The month: the two paychecks' sides summed, line by line. */
export function sumSides(list: SideStatement[]): SideStatement {
  const merge = (ss: (SideSection | undefined)[]): SideSection | undefined => {
    const first = ss.find(Boolean)
    if (!first) return undefined
    const lines: SideLine[] = []
    for (const s of ss) for (const l of s?.lines ?? []) {
      const same = lines.find((x) => x.label === l.label && x.owner === l.owner)
      if (same) same.amount = r2(same.amount + l.amount)
      else lines.push({ ...l })
    }
    return section(first.key, first.label, lines)
  }
  const keys = SIDE_ORDER.map((o) => o.key)
  return {
    income: merge(list.map((x) => x.income))!,
    deductions: merge(list.map((x) => x.deductions)),
    sections: order(keys.map((k) => merge(list.map((x) => x.sections.find((s) => s.key === k)))).filter((s): s is SideSection => !!s)),
    netCash: merge(list.map((x) => x.netCash)),
  }
}

/** In minus everything out: zero when the side ties. */
export function residual(s: SideStatement): number {
  return r2(s.income.total - (s.deductions?.total ?? 0) - s.sections.reduce((t, x) => t + x.total, 0) - (s.netCash?.total ?? 0))
}
