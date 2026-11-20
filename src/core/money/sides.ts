/**
 * The paycheck from Sommer's side and from the household's, as statements in the same
 * shape as yours, so they render in the same card with the same advisor comparisons.
 *
 *  - Sommer: her take-home ($2,100 on the 1st and 15th, like yours) plus the cash you send
 *    in. Out: the whole regular $1,000 and any top-up to the nanny (your answer, 20 Nov),
 *    her bills (the back-home numbers, the same now — your answer, 20 Nov), then what is
 *    left split between her savings and her fun money.
 *  - Combined: your statement and hers as one household. The cash you send is a transfer
 *    between you, so "Wife & Kids" goes: the nanny lands in Childcare & kids, supplemental
 *    and Christmas money and your gifts in Gifts, her groceries in Food.
 *
 * Her bills are monthly, so each paycheck carries half of them.
 */

import { SOMMER_BUDGET, SOMMER_INCOME } from './returnBudget'
import type { PaycheckStatement, StatementLine, StatementSection } from './statement'

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (ls: StatementLine[]) => r2(ls.filter((l) => !l.nonCash).reduce((t, l) => t + l.amount, 0))
const section = (key: string, label: string, lines: StatementLine[]): StatementSection => {
  const ls = lines.filter((l) => Math.abs(l.amount) > 0.004 || l.nonCash)
  return { key, label, lines: ls, total: sum(ls) }
}
const line = (key: string, label: string, amount: number, note?: string): StatementLine => ({ key, label, amount: r2(amount), txns: [], note })

/** The household's spending categories, in card order. */
export const SIDE_ORDER: { key: string; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'car', label: 'Car' },
  { key: 'food', label: 'Food' },
  { key: 'childcare', label: 'Childcare & kids' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'personal', label: 'Personal spending' },
  { key: 'tech', label: 'Tech' },
  { key: 'debt', label: 'Debt payments' },
  { key: 'other', label: 'Other' },
]

/** Cash you send her (vs. things you buy her, like the robe and flowers). */
const isCashToHer = (l: StatementLine) => /^(support_home|nanny|christmas)/.test(l.key)
const isNanny = (l: StatementLine) => /^(support_home_deployed|nanny)/.test(l.key)

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

/** Her paycheck: half of each monthly bill, then what is left split savings / fun. */
function herPaycheck() {
  const pay = r2(SOMMER_INCOME.amount / 2)
  const bills = SOMMER_BUDGET.flatMap((c) =>
    c.lines
      .filter((l) => l.share == null)
      .map((l) => ({ cat: HER_PLACE[`${c.key}:${l.key}`] ?? c.key, line: line(`w_${l.key}`, l.label, l.amount / 2, 'Her side — half the monthly bill each paycheck.') })),
  )
  const left = r2(pay - bills.reduce((t, b) => t + b.line.amount, 0))
  const half = r2(Math.max(0, left) / 2)
  return {
    pay,
    bills,
    savings: line('w_savings', 'Her savings — half of what is left', half),
    fun: line('w_fun', 'Her fun money — the other half', half),
  }
}

function finish(payday: string, gross: StatementSection, deductions: StatementSection, spending: StatementSection[], investing: StatementSection, netCash: StatementSection, takeHome: number): PaycheckStatement {
  const netIncome = r2(gross.total - deductions.total)
  const spent = spending.reduce((t, s) => t + s.total, 0)
  return {
    payday,
    gross,
    deductions,
    netIncome,
    spending: SIDE_ORDER.map((o) => spending.find((s) => s.key === o.key)).filter((s): s is StatementSection => !!s && s.lines.length > 0),
    freeCashFlow: r2(netIncome - spent),
    investing,
    netCash,
    balanceSheet: section('balance', 'Balance sheet', []),
    takeHome: r2(takeHome),
  }
}

export function sommerStatement(st: PaycheckStatement): PaycheckStatement {
  const sent = st.spending.find((s) => s.key === 'sent')?.lines.filter(isCashToHer) ?? []
  const h = herPaycheck()
  const by = (cat: string) => h.bills.filter((b) => b.cat === cat).map((b) => b.line)
  const fromSam = (l: StatementLine): StatementLine => ({ ...line(l.key, `${l.label} — from Sam`, l.amount), note: 'Paid from what you send.' })
  const spending = [
    section('home', 'Home', by('home')),
    section('car', 'Car', by('car')),
    section('food', 'Food', by('food')),
    section('childcare', 'Childcare & kids', [...sent.filter(isNanny).map(fromSam), ...by('childcare')]),
    section('gifts', 'Gifts', sent.filter((l) => !isNanny(l)).map(fromSam)),
    section('personal', 'Personal spending', [h.fun]),
  ]
  const gross = section('gross', 'Money in — her take-home and what you send', [
    line('w_pay', 'Sommer — take-home pay', h.pay, '$63k a year; $2,100 on the 1st and 15th.'),
    ...sent.map((l) => line(`in_${l.key}`, `From Sam — ${l.label}`, l.amount)),
  ])
  return finish(
    st.payday,
    gross,
    section('deductions', 'Deductions (taken before her pay lands)', []),
    spending,
    section('invest', 'Investing', []),
    section('cash', 'Net cash', [h.savings]),
    gross.total,
  )
}

export function combinedStatement(st: PaycheckStatement): PaycheckStatement {
  const h = herPaycheck()
  const buckets: Record<string, StatementLine[]> = {}
  const put = (cat: string, l: StatementLine) => (buckets[cat] ??= []).push(l)
  for (const s of st.spending)
    for (const l of s.lines) {
      const cat = s.key === 'sent' ? (isNanny(l) ? 'childcare' : 'gifts') : SIDE_ORDER.some((o) => o.key === s.key) ? s.key : 'other'
      put(cat, l)
    }
  for (const b of h.bills) put(b.cat, b.line)
  put('personal', h.fun)
  const spending = SIDE_ORDER.map((o) => section(o.key, o.label, buckets[o.key] ?? []))
  const gross = section('gross', 'Gross — your pay and her take-home', [...st.gross.lines, line('w_pay', 'Sommer — take-home pay', h.pay, '$63k a year; $2,100 on the 1st and 15th.')])
  return finish(
    st.payday,
    gross,
    st.deductions,
    spending,
    st.investing,
    section('cash', st.netCash.label, [...st.netCash.lines, h.savings]),
    st.takeHome + h.pay,
  )
}

/**
 * Her checking before the first paycheck here. Not known — assumed $0 until you give it, so
 * the liquidity test leans on what she builds, not on a balance we haven't seen.
 */
export const HER_CHECKING_START = 0
/** Her savings before the first paycheck here: likewise assumed $0. */
export const HER_SAVINGS_START = 0

/** In minus everything out: zero when the statement ties. */
export function residual(s: PaycheckStatement): number {
  return r2(s.gross.total - s.deductions.total - s.spending.reduce((t, x) => t + x.total, 0) - s.investing.total - s.netCash.total)
}
