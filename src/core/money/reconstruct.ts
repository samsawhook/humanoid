/**
 * The 1 Nov paycheck, rebuilt from what actually happened — the Wells Fargo statement
 * ending 6 Nov and your 14 Nov screenshots. It predates the plan (which starts 15 Nov),
 * so there is no budget here: every line is a real transaction, grouped the same way as
 * the planned cards, and it reconciles to the bank's own balances.
 *
 * Window: the 1 Nov pay posted Fri 30 Oct and was spendable ~Wed 28 Oct; the 15 Nov pay
 * was spendable ~Wed 11 Nov. So: everything from 28 Oct to 10 Nov.
 * Checking: $281.66 at the end of 27 Oct → $27.11 at the end of 10 Nov.
 *
 * Generic descriptions only: no card or account numbers, no merchant names that place you.
 */

import type { LocalDate } from '../types'
import type { Actual } from './actuals'
import { MORTGAGE_PRINCIPAL_EST, groupInvesting, type PaycheckStatement, type StatementLine, type StatementSection } from './statement'
import { projectPaycheck } from './paychecks'

export const NOV1 = {
  payday: '2026-11-01' as LocalDate,
  deposit: 4005.1,
  depositDate: '2026-10-30' as LocalDate,
  checkingBefore: 281.66,
  checkingAfter: 27.11,
}

type Cat = 'home' | 'car' | 'sent' | 'personal' | 'tech' | 'debt' | 'invest' | 'in'
interface Txn {
  date: LocalDate
  amount: number
  description: string
  cat: Cat
  /** Line within the category. */
  line: string
}

const T = (date: string, amount: number, description: string, cat: Cat, line: string): Txn => ({
  date: date as LocalDate,
  amount,
  description,
  cat,
  line,
})

export const NOV1_TXNS: Txn[] = [
  // The month's first mortgage payment is housing; a second one in the same month is debt
  // catch-up (your rule, 19 Nov). November had one. The Westlake payment was on a loan
  // that was behind: arrears.
  T('2026-11-02', 1381.79, 'Check #5 — Navy Federal mortgage', 'home', 'Mortgage'),
  T('2026-11-02', 355.0, 'Westlake — auto loan payment', 'debt', 'Arrears & catch-up'),
  T('2026-10-29', 1150.0, 'Venmo to Sommer — nanny + top-up', 'sent', 'Nanny + top-up'),
  T('2026-11-05', 200.0, 'Venmo to Sommer — supplemental', 'sent', 'Supplemental'),
  T('2026-11-02', 26.65, 'Squarespace', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-02', 99.79, 'Hugedomains (sawhook.com)', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-02', 21.78, 'Google Workspace', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-03', 32.48, 'Apple', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-09', 106.6, 'Anthropic (Claude)', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-09', 16.23, 'Apple', 'tech', 'Subscriptions — AI, email & domains, Apple'),
  T('2026-11-02', 113.91, "Levi's", 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-02', 130.72, 'Adidas', 'personal', 'Personal local (PX, food, shopping, outings)'),
  /**
   * Money back from friends counts against personal spending, not as income (your rule,
   * 19 Nov). This posts as "Money Transfer … From Samuel Sawhook" — a cash-out from your own
   * Cash App balance — two days after the Adidas order you were repaid for.
   */
  T('2026-11-04', -152.66, 'Repaid — Cash App cash-out (the Adidas order, +$21.94 more)', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-10-29', 53.88, 'Restaurant', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-10-29', 8.71, 'Restaurant', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-10-30', 50.0, 'Venmo to a friend ($25 + $25)', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-02', 11.71, 'Local purchase', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-02', 12.52, 'Local food ($6.26 × 2)', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-02', 14.16, 'Outlet store', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-03', 6.81, 'Local food', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-04', 11.98, 'Local purchases ($3.27 + $8.71)', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-05', 7.08, 'Local purchase', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-09', 5.72, 'Starbucks', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-09', 8.17, 'Outlet store', 'personal', 'Personal local (PX, food, shopping, outings)'),
  T('2026-11-09', 10.62, 'Museum (an outing)', 'personal', 'Personal local (PX, food, shopping, outings)'),
  // The cost of sending the $500 to Nth by wire — investing, not personal (your call, 19 Nov).
  T('2026-11-05', 30.0, 'Wells Fargo wire fee — the Nth transfer', 'invest', 'Nth — wire fee'),
  T('2026-11-09', 25.0, 'Brightway (Mastercard ending 28)', 'debt', 'Card minimums — open accounts'),
  T('2026-11-10', 47.0, 'Online transfer to WF Platinum card', 'debt', 'Card minimums — open accounts'),
  T('2026-11-05', 500.0, 'Wire to Bank of America (Nth / Falconer)', 'invest', 'Nth Venture — your business (wire)'),
]

/** Money in that is not this paycheck's pay. */
export const NOV1_OTHER_IN = {
  dfas: { date: '2026-11-04' as LocalDate, amount: 26, description: 'DFAS — small adjustment' },
}

const r2 = (n: number) => Math.round(n * 100) / 100

const LABEL: Record<Cat, string> = {
  home: 'Home',
  car: 'Car',
  sent: 'Wife & Kids',
  personal: 'Personal spending',
  tech: 'Tech',
  debt: 'Debt payments',
  invest: 'Investing',
  in: '',
}

function asActual(t: Txn): Actual {
  return { date: t.date, amount: t.amount, description: t.description, payday: NOV1.payday, status: 'posted' }
}

function sectionOf(cat: Cat, txns: Txn[]): StatementSection {
  const lines: StatementLine[] = []
  for (const t of txns.filter((x) => x.cat === cat)) {
    let l = lines.find((x) => x.label === t.line)
    if (!l) {
      l = { key: `${cat}:${t.line}`, label: t.line, amount: 0, spent: 0, txns: [] }
      lines.push(l)
    }
    l.amount = r2(l.amount + t.amount)
    l.spent = l.amount
    l.txns.push(asActual(t))
  }
  for (const l of lines) l.txns.sort((a, b) => (a.date < b.date ? -1 : 1))
  return { key: cat, label: LABEL[cat], lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) }
}

/** The 1 Nov paycheck as a statement, from the modelled gross down to the bank's balances. */
export function nov1Statement(): PaycheckStatement {
  const p = projectPaycheck(NOV1.payday)
  const diff = r2(NOV1.deposit - p.net)
  const gross: StatementSection = {
    key: 'gross',
    label: 'Gross income',
    lines: [
      ...p.lines.map((l) => ({ key: l.key, label: l.label, amount: l.amount, txns: [] as Actual[] })),
      {
        key: 'dfas_diff',
        label: 'Actual deposit vs modelled pay',
        amount: diff,
        txns: [{ date: NOV1.depositDate, amount: NOV1.deposit, description: 'DFAS deposit', payday: NOV1.payday, status: 'posted' }],
      },
      {
        key: 'dfas_adj',
        label: NOV1_OTHER_IN.dfas.description,
        amount: NOV1_OTHER_IN.dfas.amount,
        txns: [{ ...NOV1_OTHER_IN.dfas, payday: NOV1.payday, status: 'posted' }],
      },
    ],
    total: 0,
  }
  gross.total = r2(gross.lines.reduce((s, l) => s + l.amount, 0))
  const tsp = p.deductions.find((d) => d.key === 'tsp')?.amount ?? 0
  const ss = r2(p.fica * (6.2 / 7.65))
  const dLines: StatementLine[] = [
    { key: 'fed', label: 'Federal income tax (CZTE: $0)', amount: r2(p.federalTax), txns: [] },
    { key: 'fica_ss', label: 'FICA — Social Security', amount: ss, txns: [] },
    { key: 'fica_med', label: 'FICA — Medicare', amount: r2(p.fica - ss), txns: [] },
    ...p.deductions.filter((d) => d.key !== 'tsp').map((d) => ({ key: d.key, label: d.label, amount: d.amount, txns: [] })),
    { key: 'split', label: 'Pay timing (DFAS pays more on the 1st, less on the 15th)', amount: r2(-(p.splitAdjustment ?? 0)), txns: [] },
  ]
  const deductions: StatementSection = {
    key: 'deductions',
    label: 'Deduction expenses',
    lines: dLines,
    total: r2(dLines.reduce((s, l) => s + l.amount, 0)),
  }
  const netIncome = r2(gross.total - deductions.total)
  const spending = (['home', 'car', 'sent', 'personal', 'tech', 'debt'] as Cat[])
    .map((c) => sectionOf(c, NOV1_TXNS))
    .filter((s) => s.lines.length)
  const freeCashFlow = r2(netIncome - spending.reduce((s, x) => s + x.total, 0))
  const nth = sectionOf('invest', NOV1_TXNS)
  const investing: StatementSection = {
    key: 'invest',
    label: 'Investing',
    lines: groupInvesting([
      { key: 'tsp', label: 'TSP — your 5% of base pay (Roth, withheld)', amount: tsp, txns: [], note: '5% of base pay, not of gross — so about 2.9% of gross.' },
      { key: 'tsp_match', label: 'TSP — 5% match on base pay (from the Army, not your pay)', amount: tsp, nonCash: true, txns: [] },
      ...nth.lines,
    ]),
    total: r2(tsp + nth.total),
  }
  const checkingChange = r2(NOV1.checkingAfter - NOV1.checkingBefore)
  const netCash: StatementSection = {
    key: 'cash',
    label: 'Net cash',
    lines: [
      { key: 'checking', label: `Change to checking ($${NOV1.checkingBefore} → $${NOV1.checkingAfter})`, amount: checkingChange, txns: [] },
    ],
    total: r2(checkingChange),
  }
  const debt = spending.find((s) => s.key === 'debt')?.total ?? 0
  const car = 0
  const bsLines: StatementLine[] = [
    { key: 'bs_cash', label: 'Cash (checking)', amount: netCash.total, txns: [] },
    { key: 'bs_tsp', label: 'TSP (your 5% + the match)', amount: r2(tsp * 2), txns: [] },
    { key: 'bs_nth', label: 'Nth Venture — your business, at cost (the wire fee is a cost, not an asset)', amount: r2(nth.lines.filter((l) => !/fee/i.test(l.label)).reduce((t, l) => t + l.amount, 0)), txns: [] },
    { key: 'bs_debt', label: 'Debt paid down (incl. some interest — approx.)', amount: r2(debt + car), txns: [] },
    { key: 'bs_mortgage', label: 'Mortgage principal (approx.)', amount: MORTGAGE_PRINCIPAL_EST, txns: [] },
  ]
  return {
    payday: NOV1.payday,
    gross,
    deductions,
    netIncome,
    spending,
    freeCashFlow,
    investing,
    netCash,
    balanceSheet: { key: 'bs', label: 'Balance sheet impact', lines: bsLines, total: r2(bsLines.reduce((s, l) => s + l.amount, 0)) },
    takeHome: NOV1.deposit,
  }
}
