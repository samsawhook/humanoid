/**
 * Balances, account by account, month by month — for each path.
 *
 * Two sources, stitched at the month you come home:
 *  - While deployed, every payment is the payday plan's own (allocation.ts): what each
 *    paycheck actually sends to each card, loan and savings line.
 *  - From the first month home, the 20-year path model (paths.ts): its cash, TSP/401(k),
 *    Nth, house values and mortgages, and its debt budget ($600/mo payable debt, $129/mo
 *    UT), which this file spreads across the accounts — scheduled payments first, then
 *    the plan's own priority order.
 *
 * Interest: the rate on file where there is one; otherwise the path model's 8% planning
 * rate (shown as an assumption on the account). Goldman and PSECU are held flat — they are
 * a legal question, not a paydown target (see debts.ts).
 */

import { DEBTS, minimumPayment } from './debts'
import { BUCKETS, runPlan, trajectory } from './briefing'
import { CAR_LOAN_BALANCE, LATE_PAYMENTS_BALANCE, MORTGAGE_ARREARS_BALANCE, MORTGAGE_PAYMENT } from './obligations'
import { PATH_ASSUMPTIONS, projectPath, type PathKey, type PathMonth } from './paths'
import { NOV1 } from './reconstruct'
import { PAYMENT_INFO } from './execution'

export type Side = 'debt' | 'asset'
export type GroupKey = 'cards' | 'mortgage' | 'student' | 'other' | 'tsp' | 'savings' | 'cash' | 'nth' | 'house'

export const GROUPS: { key: GroupKey; label: string; side: Side }[] = [
  { key: 'cards', label: 'Credit cards & personal loans', side: 'debt' },
  { key: 'mortgage', label: 'Mortgage', side: 'debt' },
  { key: 'student', label: 'Student loans', side: 'debt' },
  { key: 'other', label: 'Other', side: 'debt' },
  { key: 'tsp', label: 'TSP / 401(k)', side: 'asset' },
  { key: 'savings', label: 'Savings', side: 'asset' },
  { key: 'cash', label: 'Cash (checking)', side: 'asset' },
  { key: 'nth', label: 'Nth Venture', side: 'asset' },
  { key: 'house', label: 'House value', side: 'asset' },
]

export interface AccountDef {
  key: string
  label: string
  group: GroupKey
  /** Annual rate used. */
  apr?: number
  aprNote?: string
  /** How it gets paid, in words. */
  paidBy?: string
  note?: string
  /** Not being paid down by the plan (held flat). */
  held?: boolean
  /** Has an amortization schedule worth opening. */
  schedule?: boolean
}

export interface LedgerPoint {
  month: string
  phase: string
  /** Balance at the end of the month (debts positive). */
  bal: Record<string, number>
  /** Paid toward the account in the period ending this point. */
  pay: Record<string, number>
  /** Interest charged in that period. */
  int: Record<string, number>
}

export interface Ledger {
  path: PathKey | 'country'
  label: string
  accounts: AccountDef[]
  /** Today, before the 15 Nov paycheck's payments. */
  opening: Record<string, number>
  /** Month by month for five years, then once a year (the year's payments summed). */
  points: LedgerPoint[]
  homeMonth: string
  /** The path model's months from coming home to a year from now: income and costs. */
  yearAhead: PathMonth[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const PLANNING_RATE = PATH_ASSUMPTIONS.debtRate
/** After you are home, checking keeps this much; the rest of the cash sits in savings. MY ASSUMPTION. */
export const CHECKING_FLOAT = 1500

const debt = (k: string) => DEBTS.find((d) => d.key === k)!

const how = (k: string) => {
  const p = PAYMENT_INFO[k]
  return p ? `${p.how === 'automatic' ? 'Automatic' : 'By hand'} — ${p.to}, ${p.when}` : undefined
}

const unknownApr = `APR not on file — ${PLANNING_RATE * 100}% planning rate (SCRA caps pre-service debt at 6% while on orders)`

export const ACCOUNTS: AccountDef[] = [
  ...['platinum', 'brightway', 'credit_one'].map((k) => ({
    key: k,
    label: debt(k).label,
    group: 'cards' as const,
    apr: PLANNING_RATE,
    aprNote: unknownApr,
    paidBy: how('card_minimums_open') + '; extra from the open-card paydown sweep',
    note: debt(k).note,
    schedule: true,
  })),
  ...['citi', 'capital_one'].map((k) => ({
    key: k,
    label: `${debt(k).label} (closed)`,
    group: 'cards' as const,
    apr: PLANNING_RATE,
    aprNote: unknownApr,
    paidBy: how('card_minimums_closed') + '; extra from the closed-card sweep',
    note: debt(k).note,
    schedule: true,
  })),
  {
    key: 'avant',
    label: debt('avant').label,
    group: 'cards',
    apr: PLANNING_RATE,
    aprNote: unknownApr,
    paidBy: how('avant_payment'),
    note: debt('avant').note,
    schedule: true,
  },
  {
    key: 'chase',
    label: `${debt('chase').label} (payment agreement)`,
    group: 'cards',
    apr: PLANNING_RATE,
    aprNote: unknownApr,
    paidBy: how('debt_agreements'),
    note: debt('chase').note,
    schedule: true,
  },
  { key: 'chamberlain', label: '628 Chamberlain — mortgage', group: 'mortgage', apr: PATH_ASSUMPTIONS.mortgageRate, aprNote: 'Rate is an estimate', paidBy: how('mortgage_current'), schedule: true },
  { key: 'arrears', label: 'Mortgage — past-due payments', group: 'mortgage', apr: 0, paidBy: how('arrears_catchup_payment'), schedule: true },
  { key: 'new_home', label: 'Upgrade home — mortgage (VA)', group: 'mortgage', apr: PATH_ASSUMPTIONS.upgrade.rate, aprNote: 'Estimate', note: 'Bought when the path model finds cash for closing, the move and a reserve.' },
  {
    key: 'student_loan',
    label: debt('student_loan').label,
    group: 'student',
    apr: debt('student_loan').apr,
    aprNote: 'Rate on file',
    paidBy: how('student_loan_payment') + ' (deferment pending to Aug 2027)',
    note: debt('student_loan').note,
    schedule: true,
  },
  {
    key: 'ut_loan',
    label: debt('ut_loan').label,
    group: 'student',
    apr: PATH_ASSUMPTIONS.utRate,
    aprNote: 'Estimate — balance unconfirmed (SLRP may have paid it)',
    paidBy: `$${PATH_ASSUMPTIONS.utMonthly}/mo plan from the month you are home`,
    note: debt('ut_loan').note,
    schedule: true,
  },
  { key: 'car', label: 'Westlake — car loan', group: 'other', apr: 0, paidBy: 'Paid off 18 Nov', schedule: true },
  { key: 'caine', label: 'Caine & Weiner (Progressive collection)', group: 'other', apr: 0, paidBy: how('late_payments'), schedule: true },
  { key: 'goldman', label: 'Goldman (sued, dismissed)', group: 'other', held: true, note: debt('goldman').note },
  { key: 'psecu', label: 'PSECU (sued, dismissed)', group: 'other', held: true, note: debt('psecu').note },
  { key: 'gap', label: 'Cash gap (borrowed)', group: 'other', apr: PATH_ASSUMPTIONS.gapRate, note: 'When the path runs short of cash, the gap is borrowed at ~8%.' },
  { key: 'tsp', label: 'TSP, then 401(k)', group: 'tsp', note: '5% + 5% match while deployed; 5% + 4% at a civilian job. 6% growth.' },
  { key: 'savings', label: 'Savings', group: 'savings', note: 'Emergency fund, SDP and future fund while deployed; after you are home, all cash above the checking float.' },
  { key: 'checking', label: 'WF Joint Checking', group: 'cash', note: `What each paycheck leaves behind; after you are home, a ${'$'}${CHECKING_FLOAT.toLocaleString()} float.` },
  { key: 'nth', label: 'Nth Venture', group: 'nth', note: '$500/mo of principal from here, growing at 6%. Earlier contributions not counted.' },
  { key: 'house_chamberlain', label: '628 Chamberlain', group: 'house', note: 'Zestimate, rising 3% a year.' },
  { key: 'house_new', label: 'Upgrade home', group: 'house' },
]

const DEBT_KEYS = ACCOUNTS.filter((a) => GROUPS.find((g) => g.key === a.group)!.side === 'debt').map((a) => a.key)

function addMonths(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number)
  const i = y! * 12 + (mo! - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** Pay `amount` into accounts in order, never past a balance. Returns what was left over. */
function payInOrder(amount: number, keys: string[], bal: Record<string, number>, pay: Record<string, number>): number {
  let left = amount
  for (const k of keys) {
    if (left <= 0.004) break
    const p = Math.min(left, Math.max(0, bal[k]!))
    if (p <= 0) continue
    bal[k] = r2(bal[k]! - p)
    pay[k] = r2((pay[k] ?? 0) + p)
    left = r2(left - p)
  }
  return left
}

/** A group payment: each account's minimum first, then the rest in priority order. */
function payGroup(amount: number, keys: string[], bal: Record<string, number>, pay: Record<string, number>): number {
  let left = amount
  for (const k of keys) {
    const min = Math.min(left, Math.max(0, bal[k]!), minimumPayment({ ...debt(k), balance: bal[k]! }))
    if (min > 0) left = payInOrder(min, [k], bal, pay) + (left - min)
  }
  const ordered = [...keys].sort((a, b) => debt(a).priority - debt(b).priority)
  return payInOrder(left, ordered, bal, pay)
}

const OPEN = ['platinum', 'brightway', 'credit_one']
const CLOSED = ['citi', 'capital_one']
/** Payable debt after you are home, in the order the extra goes. */
const PAYABLE = ['caine', 'credit_one', 'brightway', 'platinum', 'avant', 'citi', 'capital_one', 'chase', 'student_loan']

export function buildLedger(path: PathKey | 'country'): Ledger {
  const a =
    path === 'country'
      ? { ...PATH_ASSUMPTIONS, macc: { ...PATH_ASSUMPTIONS.macc, countryside: { ...PATH_ASSUMPTIONS.macc.countryside, enabled: true } } }
      : PATH_ASSUMPTIONS
  const proj = projectPath(path === 'country' ? 'macc' : path, a)
  const outcome = runPlan()
  const traj = trajectory(outcome)
  const homeIdx = proj.months.findIndex((m) => m.phase !== 'Deployed')
  const homeMonth = proj.months[homeIdx]!.month
  const lastDeployed = addMonths(homeMonth, -1)

  const bal: Record<string, number> = {}
  for (const k of [...OPEN, ...CLOSED, 'avant', 'chase', 'student_loan', 'ut_loan', 'goldman', 'psecu']) bal[k] = debt(k).balance
  bal.car = CAR_LOAN_BALANCE
  bal.caine = LATE_PAYMENTS_BALANCE
  bal.arrears = MORTGAGE_ARREARS_BALANCE
  bal.chamberlain = a.mortgageBalance
  bal.new_home = 0
  bal.gap = 0
  const opening: Record<string, number> = {
    ...bal,
    tsp: proj.months[0]!.retirement - a.tspDeployedMonthly,
    savings: 0,
    checking: 845.14,
    nth: 0,
    house_chamberlain: a.houseValue,
    house_new: 0,
  }

  const monthly: LedgerPoint[] = []
  const pAndI = MORTGAGE_PAYMENT - a.mortgageEscrow
  let chamberlainValue = a.houseValue
  const saveKeys = BUCKETS.find((b) => b.key === 'save')!.keys as readonly string[]

  // November: the plan's 15 Nov paycheck, before the path model starts (December).
  const months = ['2026-11', ...proj.months.map((m) => m.month)]
  for (const m of months) {
    const pm = proj.months.find((x) => x.month === m)
    const pay: Record<string, number> = {}
    const int: Record<string, number> = {}
    const deployed = m <= lastDeployed

    // Interest first, on what was owed coming into the month.
    for (const acc of ACCOUNTS) {
      if (!DEBT_KEYS.includes(acc.key) || acc.held || !acc.apr || acc.key === 'chamberlain' || acc.key === 'new_home' || acc.key === 'gap') continue
      if (acc.key === 'ut_loan' && deployed) continue
      const i = r2(Math.max(0, bal[acc.key]!) * (acc.apr / 12))
      if (i > 0) {
        bal[acc.key] = r2(bal[acc.key]! + i)
        int[acc.key] = i
      }
    }
    // The Chamberlain mortgage, as the path model amortises it (from December).
    if (m !== '2026-11') {
      const i = r2(bal.chamberlain! * (a.mortgageRate / 12))
      const sold = path === 'law' && a.law.house === 'sell' && m >= a.law.schoolStart
      if (sold) {
        bal.chamberlain = 0
      } else if (bal.chamberlain! > 0) {
        int.chamberlain = i
        pay.chamberlain = r2(Math.min(pAndI, bal.chamberlain! + i))
        bal.chamberlain = r2(Math.max(0, bal.chamberlain! + i - pAndI))
      }
      chamberlainValue = sold ? 0 : chamberlainValue * (1 + a.homeAppreciation / 12)
    }

    if (deployed) {
      const allocs = outcome.allocations.filter((x) => x.paycheck.scheduledDate.slice(0, 7) === m)
      const sum = (pred: (key: string, cap?: string) => boolean) =>
        r2(allocs.reduce((s, x) => s + x.lines.filter((l) => pred(l.key, l.capGroup)).reduce((t, l) => t + l.allocated, 0), 0))
      payGroup(sum((_, c) => c === 'open_cards'), OPEN, bal, pay)
      payGroup(sum((_, c) => c === 'closed_cards'), CLOSED, bal, pay)
      payInOrder(sum((_, c) => c === 'avant'), ['avant'], bal, pay)
      payInOrder(sum((k) => k === 'debt_agreements'), ['chase'], bal, pay)
      payInOrder(sum((k) => k === 'student_loan_payment'), ['student_loan'], bal, pay)
      payInOrder(sum((k) => k === 'late_payments'), ['caine'], bal, pay)
      payInOrder(sum((_, c) => c === 'car_payoff'), ['car'], bal, pay)
      payInOrder(sum((_, c) => c === 'mortgage_arrears'), ['arrears'], bal, pay)
      if (m === '2026-11') pay.chamberlain = 0
    } else {
      // Home: the path's debt budget, scheduled payments first, then the priority order.
      let budget = a.debtPaydownMonthly
      for (const k of ['avant', 'chase', 'student_loan']) {
        const due = Math.min(budget, bal[k]!, debt(k).scheduledMonthly ?? 0)
        budget = payInOrder(due, [k], bal, pay) + (budget - due)
      }
      budget = payInOrder(budget, PAYABLE, bal, pay)
      payInOrder(a.utMonthly, ['ut_loan'], bal, pay)
      // Anything the plan left of the car, arrears or collection is cleared first in practice.
      payInOrder(bal.car! + bal.arrears!, ['car', 'arrears'], bal, pay)
    }

    // Assets.
    let checking: number
    let savings: number
    const cash = pm ? pm.cash : (traj.filter((p) => p.date.slice(0, 7) <= m).at(-1)?.cash ?? 0)
    if (deployed) {
      const allocs = outcome.allocations.filter((x) => x.paycheck.scheduledDate.slice(0, 7) <= m)
      const last = allocs.at(-1)
      const i = outcome.allocations.indexOf(last!)
      const next = outcome.allocations[i + 1]
      checking = r2((next ? next.openingBuffer : last!.remainder) + NOV1.checkingAfter)
      let s = 0
      for (const x of allocs) {
        s += x.lines.filter((l) => saveKeys.includes(l.key)).reduce((t, l) => t + l.allocated, 0)
        s -= (x.draws ?? []).reduce((t, d) => t + d.amount, 0)
      }
      savings = r2(Math.max(0, s))
      bal.gap = 0
    } else {
      checking = r2(Math.max(0, Math.min(cash, CHECKING_FLOAT)))
      savings = r2(Math.max(0, cash - CHECKING_FLOAT))
      const gapBefore = bal.gap!
      bal.gap = r2(Math.max(0, -cash))
      if (bal.gap > gapBefore) int.gap = r2(gapBefore * (a.gapRate / 12))
      else if (gapBefore > 0) pay.gap = r2(gapBefore - bal.gap)
    }
    const retirement = pm ? pm.retirement : opening.tsp! + a.tspDeployedMonthly
    const homeTotal = pm ? pm.homeValue : a.houseValue
    const mortgageTotal = pm ? pm.mortgage : bal.chamberlain!
    bal.new_home = r2(Math.max(0, mortgageTotal - bal.chamberlain!))

    monthly.push({
      month: m,
      phase: pm?.phase ?? 'Deployed',
      bal: {
        ...Object.fromEntries(Object.entries(bal).map(([k, v]) => [k, r2(Math.max(0, v))])),
        tsp: r2(retirement),
        savings,
        checking,
        nth: r2(pm ? pm.investments : 0),
        house_chamberlain: r2(chamberlainValue),
        house_new: r2(Math.max(0, homeTotal - chamberlainValue)),
      },
      pay,
      int,
    })
  }

  // Monthly for five years, then a point a year with that year's payments summed.
  const points: LedgerPoint[] = []
  let acc: LedgerPoint | null = null
  monthly.forEach((p, i) => {
    if (i <= 60) {
      points.push(p)
      return
    }
    if (!acc) acc = { month: p.month, phase: p.phase, bal: p.bal, pay: { ...p.pay }, int: { ...p.int } }
    else {
      for (const [k, v] of Object.entries(p.pay)) acc.pay[k] = r2((acc.pay[k] ?? 0) + v)
      for (const [k, v] of Object.entries(p.int)) acc.int[k] = r2((acc.int[k] ?? 0) + v)
      acc.bal = p.bal
      acc.month = p.month
      acc.phase = p.phase
    }
    if ((i - 60) % 12 === 0 || i === monthly.length - 1) {
      points.push(acc)
      acc = null
    }
  })

  const yearAhead = proj.months.filter((m) => m.month >= homeMonth && m.month <= addMonths('2026-11', 12))
  return { path, label: proj.label, accounts: ACCOUNTS, opening, points, homeMonth, yearAhead }
}

export function groupTotal(p: { bal: Record<string, number> }, g: GroupKey): number {
  return r2(ACCOUNTS.filter((a) => a.group === g).reduce((s, a) => s + (p.bal[a.key] ?? 0), 0))
}

export function netWorth(p: { bal: Record<string, number> }): number {
  const sum = (side: Side) =>
    GROUPS.filter((g) => g.side === side).reduce((s, g) => s + groupTotal(p, g.key), 0)
  return r2(sum('asset') - sum('debt'))
}

export interface Payoff {
  /** Month the balance reaches zero, or null if not within the horizon. */
  month: string | null
  totalPaid: number
  totalInterest: number
}

export function payoffOf(l: Ledger, key: string): Payoff {
  let paid = 0
  let interest = 0
  let month: string | null = null
  const start = l.opening[key] ?? 0
  if (start <= 0) return { month: null, totalPaid: 0, totalInterest: 0 }
  for (const p of l.points) {
    paid += p.pay[key] ?? 0
    interest += p.int[key] ?? 0
    if ((p.bal[key] ?? 0) <= 0.005) {
      month = p.month
      break
    }
  }
  return { month, totalPaid: r2(paid), totalInterest: r2(interest) }
}
