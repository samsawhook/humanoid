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
  /** The dollars behind it. */
  amount: number
  typical: string
  advisor: string
  target: string
  status: BenchStatus
  /** One line on the status. */
  verdict: string
  /** The three outside voices: an allocation each, as % of gross, with the reason. */
  robo: Voice & { status: BenchStatus }
  ramsey: Voice
  kiyosaki: Voice
  /** The same comparisons condensed: one number or range each, a light, and the commentary for a hover. */
  cells: BenchCell[]
  /** Your share less one-time payments (a payoff, a catch-up). */
  adjusted: number
}

export type Light = 'green' | 'yellow' | 'red' | 'none'

export interface BenchCell {
  key: 'typical' | 'advisor' | 'robo' | 'ramsey' | 'kiyosaki' | 'target'
  label: string
  text: string
  tip: string
  light: Light
}

/** Short, comparable versions of the typical figure and the advisor rule, per category. */
const SHORT: Record<string, { typical?: number; advisor?: { text: string; min?: number; max?: number } }> = {
  deductions: { typical: 16 },
  home: { typical: 25, advisor: { text: '≤28%', max: 28 } },
  car: { typical: 13, advisor: { text: '10–15%', max: 15 } },
  sent: { typical: 10, advisor: { text: '≤7%', max: 7 } },
  personal: { typical: 11, advisor: { text: '≤27%', max: 27 } },
  tech: { typical: 4, advisor: { text: '3–5%', min: 3, max: 5 } },
  debt: { typical: 5, advisor: { text: '≤36% w/ home' } },
  invest: { typical: 12, advisor: { text: '≥15%', min: 15 } },
  business: { typical: 0 },
  cash: { typical: 5, advisor: { text: '3–6 mo' } },
}

const r1x = (n: number) => Math.round(n * 10) / 10

/** Within a bound: green; a little outside (≤2 pts): yellow; further: red. */
function lightBound(v: number, min?: number, max?: number): Light {
  if (min === undefined && max === undefined) return 'none'
  const off = Math.max(0, min !== undefined ? min - v : 0, max !== undefined ? v - max : 0)
  return off <= 0 ? 'green' : off <= 2 ? 'yellow' : 'red'
}
/** Near a point: within 2 pts green, within 5 yellow, beyond red. */
function lightPoint(v: number, p: number): Light {
  const d = Math.abs(v - p)
  return d <= 2 ? 'green' : d <= 5 ? 'yellow' : 'red'
}

export interface Voice {
  /** Allocation, % of gross. */
  pct: number
  why: string
  min?: number
  max?: number
}

/**
 * Three other opinions, each a full allocation that sums to 100% of gross.
 *
 * ROBO — what an automated planner would set from your profile alone, NOT from this plan:
 * 31, deployed and tax-free until July, one child and a household to run, ~$18k of
 * consumer debt at card rates, ~$250 of cash, and an uncertain income from August. Its
 * order: take the free match; build a runway for the return; clear card-rate debt (a
 * guaranteed ~25%) before investing past the match; keep any single private holding small.
 *
 * RAMSEY and KIYOSAKI — paraphrased from their published advice and applied to you. Not
 * quotes, and neither has seen your numbers. Ramsey: Baby Step 1 ($1,000), then Step 2
 * (debt snowball, smallest balance first, all investing paused). Kiyosaki: buy assets that
 * pay you, treat the house and car as liabilities, bad debt out, good debt only for
 * cash-flowing assets, and be wary of holding savings in dollars.
 */
export const VOICES: Record<string, { robo: Voice; ramsey: Voice; kiyosaki: Voice }> = {
  deductions: {
    robo: { pct: 5, why: 'Fixed. Tax-free pay is the best Roth money you will ever have.' },
    ramsey: { pct: 5, why: 'Fixed.' },
    kiyosaki: { pct: 5, why: 'A legal tax edge — exactly what he preaches. Use it.' },
  },
  home: {
    robo: { pct: 17, max: 25, why: 'Mortgage only; hold it under 25%. No upgrade until the return settles.' },
    ramsey: { pct: 17, why: 'Under his 25%-of-take-home line. Catch up, never miss again.' },
    kiyosaki: { pct: 17, why: '"Your house is a liability." Don’t upgrade; rent it out when you move.' },
  },
  car: {
    robo: { pct: 2, max: 5, why: 'Insurance and fuel. No new car payment.' },
    ramsey: { pct: 2, why: 'Paid off — keep it that way. Cash cars only.' },
    kiyosaki: { pct: 2, why: 'A liability. Insurance only; no car payment.' },
  },
  sent: {
    robo: { pct: 33, max: 35, why: 'Essential: the household runs on it. Supplemental is the flex.' },
    ramsey: { pct: 30, why: 'The Four Walls first — food, utilities, shelter, care. Extras wait.' },
    kiyosaki: { pct: 30, why: 'Support the family; pay for extras from asset income, not pay.' },
  },
  personal: {
    robo: { pct: 3, max: 4, why: 'Deployed costs are low; hold the line.' },
    ramsey: { pct: 1, why: '"Rice and beans" until the debt is gone.' },
    kiyosaki: { pct: 2, why: 'Pay yourself first; luxuries come from what your assets earn.' },
  },
  tech: {
    robo: { pct: 4, max: 5, why: 'Keep the phone and pass; cut subscriptions to what earns its keep — AI, email, the domain.' },
    ramsey: { pct: 2, why: 'Cancel the subscriptions and streaming; cheapest phone plan until debt-free.' },
    kiyosaki: { pct: 3, why: 'AI, email and the domain are tools of the business — run them through Nth.' },
  },
  debt: {
    robo: { pct: 12, min: 12, why: 'Avalanche: highest rate first. Paying 25% debt beats any return.' },
    ramsey: { pct: 29, why: 'Snowball everything into Credit One, then Brightway, then Platinum…' },
    kiyosaki: { pct: 13, why: 'Kill bad (consumer) debt — but keep building the business meanwhile.' },
  },
  invest: {
    robo: { pct: 6, min: 5.5, max: 9, why: 'TSP 5% of base for the full match. More only once the cards and the runway are done.' },
    ramsey: { pct: 0, why: 'Pause all investing, the match included, until debt-free. Then 15% to Roth.' },
    kiyosaki: { pct: 3, why: 'Keep the match; he’s wary of paper retirement funds you don’t control.' },
  },
  business: {
    robo: {
      pct: 6,
      why: 'Treat it as a fixed bill while its creditors are owed. Set a date for it to cover its own creditors; if not, restructure.',
    },
    ramsey: { pct: 6, why: 'Pay what you personally owe. No new borrowing for it; it has to pay for itself.' },
    kiyosaki: {
      pct: 22,
      why: 'The B quadrant — the right game. But until it pays you it’s a liability: fix its cash flow first.',
    },
  },
  cash: {
    robo: { pct: 12, min: 12, why: 'Build 3 months of runway before August — income after the return is uncertain.' },
    ramsey: { pct: 8, why: 'Baby Step 1: $1,000 starter fund now. Then everything to debt.' },
    kiyosaki: { pct: 3, why: '"Savers are losers": a small buffer; hold the rest in real assets.' },
  },
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
    typical: '≈11% (food out, clothes, personal care)',
    advisor: 'Wants ≤ 30% of take-home (50/30/20), tech included',
    target: '≤ 7%',
    max: 7,
  },
  {
    key: 'tech',
    label: 'Tech',
    typical: '≈4% (phone, streaming, software)',
    advisor: 'Phone + subscriptions ≈ 3–5%',
    target: '≤ 7% (phone with the pass, AI, email, domain)',
    max: 7,
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
    label: 'Investing (TSP)',
    typical: '≈7% yours, ≈12% with the match',
    advisor: '15% of gross for retirement, match included',
    target: '5% of base pay + the 5% match',
    min: 5.5,
  },
  {
    key: 'business',
    label: 'Nth — your business',
    typical: 'Most households: 0%',
    advisor: 'Owner capital: only what you can afford to lose; debts you guarantee count as your debt',
    target: '$500/mo, never skipped',
    fixed: 'Fixed by your call: it builds the business and pays its creditors while it isn’t performing.',
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
  const nthAmt = st.investing.lines.filter((l) => l.key === 'nth_investments' || /Nth/.test(l.label)).reduce((s, l) => s + l.amount, 0)
  const you: Record<string, number> = {
    deductions: pct(st.deductions.total),
    home: pct(sec('home')),
    car: pct(sec('car')),
    sent: pct(sec('sent')),
    personal: pct(sec('personal')),
    tech: pct(sec('tech')),
    debt: pct(sec('debt')),
    invest: pct(st.investing.total + match - nthAmt),
    business: pct(nthAmt),
    cash: pct(st.netCash.total),
  }
  const homeAndDebt = r1(you.home! + you.debt!)
  return RULES.map((r) => {
    const vo = VOICES[r.key]!
    const v = you[r.key]!
    /** The share without one-time payments (a payoff, a catch-up), when there are any. */
    let adj = v
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
        adj = without
        verdict += ` · includes the one-time $${payoff.amount.toFixed(2)} payoff; ${without}% without it`
        if (r.max !== undefined && without <= r.max) status = 'on'
      }
    }
    if (r.key === 'home') {
      const extra = (st.spending.find((x) => x.key === 'home')?.lines ?? [])
        .filter((l) => l.key === 'arrears_catchup_payment' || l.key === 'mortgage_arrears')
        .reduce((t, l) => t + l.amount, 0)
      if (extra > 0) {
        const without = pct((st.spending.find((x) => x.key === 'home')?.total ?? 0) - extra)
        adj = without
        verdict += ` · includes a $${extra.toFixed(2)} catch-up payment; ${without}% without it`
        if (r.max !== undefined && without <= r.max) status = 'on'
      }
    }
    if (r.key === 'invest') verdict += ` · incl. ${pct(match)}% match`
    const rb = VOICES[r.key]!.robo
    const roboStatus: BenchStatus =
      rb.max !== undefined && adj > rb.max ? 'over' : rb.min !== undefined && v < rb.min ? 'under' : rb.max !== undefined || rb.min !== undefined ? 'on' : 'info'
    const sh = SHORT[r.key] ?? {}
    const fixedRow = !!r.fixed
    const cells: BenchCell[] = [
      {
        key: 'typical',
        label: 'Typical',
        text: sh.typical !== undefined ? `${sh.typical}%` : '—',
        tip: `Typical, age 25–34: ${r.typical}`,
        light: fixedRow || sh.typical === undefined ? 'none' : lightPoint(adj, sh.typical),
      },
      {
        key: 'advisor',
        label: 'Advisor',
        text: sh.advisor?.text ?? '—',
        tip: `Advisor rule: ${r.advisor}`,
        light:
          r.key === 'debt'
            ? lightBound(r1x(adj + you.home!), undefined, 36)
            : fixedRow || !sh.advisor
              ? 'none'
              : lightBound(adj, sh.advisor.min, sh.advisor.max),
      },
      {
        key: 'robo',
        label: 'Robo',
        text: `${vo.robo.pct}%`,
        tip: `Robo, tuned to you: ${vo.robo.why}`,
        light: r.key === 'deductions' ? 'none' : vo.robo.min !== undefined || vo.robo.max !== undefined ? lightBound(adj, vo.robo.min, vo.robo.max) : lightPoint(adj, vo.robo.pct),
      },
      {
        key: 'ramsey',
        label: 'Ramsey',
        text: `${vo.ramsey.pct}%`,
        tip: `Dave Ramsey (paraphrased): ${vo.ramsey.why}`,
        light: r.key === 'deductions' ? 'none' : lightPoint(adj, vo.ramsey.pct),
      },
      {
        key: 'kiyosaki',
        label: 'Kiyosaki',
        text: `${vo.kiyosaki.pct}%`,
        tip: `Robert Kiyosaki (paraphrased): ${vo.kiyosaki.why}`,
        light: r.key === 'deductions' ? 'none' : lightPoint(adj, vo.kiyosaki.pct),
      },
      {
        key: 'target',
        label: 'Plan',
        text: r.max !== undefined ? `≤${r.max}%` : r.min !== undefined ? `≥${r.min}%` : r.fixed ? 'fixed' : '—',
        tip: `Plan target: ${r.target}${verdict ? ` — ${verdict}` : ''}`,
        light: fixedRow ? 'none' : status === 'on' ? 'green' : lightBound(adj, r.min, r.max),
      },
    ]
    return {
      key: r.key,
      label: r.label,
      you: v,
      cells,
      adjusted: adj,
      amount: Math.round(((v / 100) * g) * 100) / 100,
      typical: r.typical,
      advisor: r.advisor,
      target: r.target,
      status,
      verdict,
      robo: { ...rb, status: roboStatus },
      ramsey: vo.ramsey,
      kiyosaki: vo.kiyosaki,
    }
  })
}
