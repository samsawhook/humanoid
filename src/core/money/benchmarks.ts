/**
 * How a month's spending compares, category by category, as a share of GROSS pay:
 *
 *  - Typical for your age: US households whose head is 25–34. Approximate, from the BLS
 *    Consumer Expenditure Survey (2023), the Fed's household debt-service ratio and
 *    Vanguard's How America Saves (2024). Rounded: they are a sense of scale, not a grade.
 *  - Advisor rule: the rule of thumb a planner would quote.
 *  - Your target: what a robo-advisor would hold you to in THIS phase (deployed, debt to
 *    clear, an emergency fund to build), with the plan's fixed commitments taken as given.
 *
 * Military gross includes untaxed allowances (BAH, BAS), so every share here is a little
 * lower than the same spending would be on a civilian salary.
 */

import { EMERGENCY_FUND_TARGET } from './obligations'
import type { PaycheckStatement } from './statement'

export type BenchStatus = 'on' | 'over' | 'under' | 'fixed' | 'info'

export interface BenchRow {
  key: string
  label: string
  /** Your share of gross, %. */
  you: number
  typical: string
  advisor: string
  target: string
  status: BenchStatus
  /** One line on the status. */
  verdict: string
}

interface Rule {
  key: string
  label: string
  typical: string
  advisor: string
  target: string
  /** Compare against a ceiling or a floor, in % of gross. */
  max?: number
  min?: number
  fixed?: string
}

const RULES: Rule[] = [
  {
    key: 'deductions',
    label: 'Deduction expenses',
    typical: '≈16% (income tax + FICA)',
    advisor: '—',
    target: '—',
    fixed: 'Low because the combat-zone exclusion takes federal tax to $0.',
  },
  {
    key: 'home',
    label: 'Home',
    typical: '≈25% (housing)',
    advisor: '≤ 28% of gross (the 28/36 rule)',
    target: '≤ 28%',
    max: 28,
  },
  {
    key: 'car',
    label: 'Car',
    typical: '≈13% (transportation)',
    advisor: '≤ 10–15% all-in',
    target: '≤ 10%',
    max: 10,
  },
  {
    key: 'sent',
    label: 'Wife & Kids',
    typical: 'Childcare alone ≈ 10% for families paying for it',
    advisor: 'Childcare ≤ 7% (the HHS affordability line)',
    target: 'As planned — $1,200 a paycheck + supplemental',
    fixed: 'Fixed by your call: it runs the household while you are away, so it is more than childcare.',
  },
  {
    key: 'personal',
    label: 'Personal spending',
    typical: '≈15% (food out, fun, clothes, phone, subscriptions)',
    advisor: 'Wants ≤ 30% of take-home (50/30/20)',
    target: '≤ 12%',
    max: 12,
  },
  {
    key: 'debt',
    label: 'Debt payments',
    typical: '≈5% (non-mortgage debt service)',
    advisor: 'Housing + all debt ≤ 36% of gross',
    target: '≥ 8% until the cards are clear',
    min: 8,
  },
  {
    key: 'invest',
    label: 'Investing',
    typical: '≈7% yours, ≈12% with the match',
    advisor: '15% of gross, match included',
    target: '≥ 15% with the match',
    min: 15,
  },
  {
    key: 'cash',
    label: 'Net cash (saved)',
    typical: '≈5% (personal saving rate)',
    advisor: '3–6 months of expenses in cash',
    target: `≥ 5% until the emergency fund holds $${EMERGENCY_FUND_TARGET.toLocaleString()}`,
    min: 5,
  },
]

const r1 = (n: number) => Math.round(n * 10) / 10

export function benchmarkRows(st: PaycheckStatement): BenchRow[] {
  const g = st.gross.total
  if (g <= 0) return []
  const pct = (n: number) => r1((n / g) * 100)
  const sec = (k: string) => st.spending.find((s) => s.key === k)?.total ?? 0
  const match = st.investing.lines.filter((l) => l.nonCash).reduce((s, l) => s + l.amount, 0)
  const you: Record<string, number> = {
    deductions: pct(st.deductions.total),
    home: pct(sec('home')),
    car: pct(sec('car')),
    sent: pct(sec('sent')),
    personal: pct(sec('personal')),
    debt: pct(sec('debt')),
    invest: pct(st.investing.total + match),
    cash: pct(st.netCash.total),
  }
  const homeAndDebt = r1(you.home! + you.debt!)
  return RULES.map((r) => {
    const v = you[r.key]!
    let status: BenchStatus = 'info'
    let verdict = r.fixed ?? ''
    if (r.fixed) status = r.key === 'sent' ? 'fixed' : 'info'
    else if (r.max !== undefined) {
      status = v <= r.max ? 'on' : 'over'
      verdict = v <= r.max ? `${r1(r.max - v)} pts of room` : `${r1(v - r.max)} pts over`
    } else if (r.min !== undefined) {
      status = v >= r.min ? 'on' : 'under'
      verdict = v >= r.min ? `${r1(v - r.min)} pts ahead` : `${r1(r.min - v)} pts short`
    }
    if (r.key === 'debt') verdict += ` · housing + debt ${homeAndDebt}% (rule ≤ 36%)`
    if (r.key === 'car') {
      const payoff = st.spending.find((x) => x.key === 'car')?.lines.find((l) => l.key.startsWith('car_payoff'))
      if (payoff && payoff.amount > 0) {
        const without = pct((st.spending.find((x) => x.key === 'car')?.total ?? 0) - payoff.amount)
        verdict += ` · includes the one-time $${payoff.amount.toFixed(2)} payoff; ${without}% without it`
        if (r.max !== undefined && without <= r.max) status = 'on'
      }
    }
    if (r.key === 'invest') verdict += ` · incl. ${pct(match)}% match`
    return { key: r.key, label: r.label, you: v, typical: r.typical, advisor: r.advisor, target: r.target, status, verdict }
  })
}
