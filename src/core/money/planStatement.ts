/**
 * A planner period — a month, a quarter or a year of the path model — as a statement in
 * the same shape as a paycheck's, so it renders in the same card.
 *
 *   gross − deductions − spending − investing − change in cash = 0
 *
 * Interest on cash (and on anything borrowed to cover a gap), and in the first month home
 * the cash carried over from the deployment, are the one line the path's own income and
 * costs do not hold: it is shown under income as "Interest & other cash movements" so the
 * card ties to the cash the chart shows.
 */

import { pnlGroup, type GroupKey } from './ledger'
import type { PathMonth } from './paths'
import type { PaycheckStatement, StatementLine, StatementSection } from './statement'

const r2 = (n: number) => Math.round(n * 100) / 100
const line = (key: string, label: string, amount: number, note?: string): StatementLine => ({ key, label, amount: r2(amount), txns: [], note })
const section = (key: string, label: string, lines: StatementLine[]): StatementSection => {
  const ls = lines.filter((l) => Math.abs(l.amount) > 0.004)
  return { key, label, lines: ls, total: r2(ls.reduce((t, l) => t + l.amount, 0)) }
}

/** Cost groups to card sections, in card order. */
const SECTIONS: { group: string; key: string; label: string }[] = [
  { group: 'Home', key: 'home', label: 'Home' },
  { group: 'Car', key: 'car', label: 'Car' },
  { group: 'Wife & Kids', key: 'childcare', label: 'Childcare & kids' },
  { group: 'Personal', key: 'personal', label: 'Personal spending' },
  { group: 'Tech', key: 'tech', label: 'Tech' },
  { group: 'Debt', key: 'debt', label: 'Debt payments' },
  { group: 'School & moves', key: 'school', label: 'School, exams & moves' },
  { group: 'Emergencies', key: 'emergency', label: 'Emergencies' },
  { group: 'Other', key: 'other', label: 'Other' },
]

type Bal = Record<string, number>
const OTHER_NOTE =
  'Interest earned on cash (3%) or charged on anything borrowed to cover a gap (8%); in the first month home, the cash carried over from the deployment.'
const g = (b: Bal, keys: string[]) => keys.reduce((t, k) => t + (b[k] ?? 0), 0)

/** Account keys by group, for the balance-sheet lines. */
export interface Groups {
  of: (g: GroupKey) => string[]
}

export function periodStatement(
  label: string,
  months: PathMonth[],
  start: Bal,
  end: Bal,
  groups: Groups,
): PaycheckStatement {
  const sumBy = (pick: (m: PathMonth) => Record<string, number>) => {
    const out: Record<string, number> = {}
    for (const m of months) for (const [k, v] of Object.entries(pick(m))) out[k] = (out[k] ?? 0) + v
    return out
  }
  const income = sumBy((m) => m.income)
  const costs = sumBy((m) => m.costs)
  const borrowed = months.reduce((t, m) => t + (m.borrowed ?? 0), 0)
  const deployedInvested = months.filter((m) => m.phase === 'Deployed').reduce((t, m) => t + m.invested, 0)

  const isDeduction = (k: string) => pnlGroup(k) === 'Taxes' || /^VA waived/.test(k)
  const isInvesting = (k: string) => pnlGroup(k) === 'Investing'

  const cashOf = (b: Bal) => (b.checking ?? 0) + (b.savings ?? 0) - (b.gap ?? 0)
  const cashChange = r2(cashOf(end) - cashOf(start))
  const totalIncome = Object.values(income).reduce((t, v) => t + v, 0)
  const totalCosts = Object.values(costs).reduce((t, v) => t + v, 0)
  const other = r2(cashChange - (totalIncome + borrowed - totalCosts - deployedInvested))

  const gross = section('gross', 'Income', [
    ...Object.entries(income).map(([k, v], i) => line(`in_${i}`, k, v)),
    line('in_loan', 'Borrowed — federal student loan, after the 1.057% fee (not income)', borrowed, 'Direct Unsubsidized: owed back from six months after graduation. It is in the debt line from the day it is paid.'),
    ...(other > 0 ? [line('in_other', 'Interest & other cash movements', other, OTHER_NOTE)] : []),
  ])
  const deductions = section(
    'deductions',
    'Taxes & deductions',
    [
      ...Object.entries(costs)
        .filter(([k]) => isDeduction(k))
        .map(([k, v], i) => line(`ded_${i}`, k, v)),
      ...(other < 0 ? [line('ded_other', 'Interest on borrowed cash & other cash movements', -other, OTHER_NOTE)] : []),
    ],
  )
  const spending = SECTIONS.map((s) =>
    section(
      s.key,
      s.label,
      Object.entries(costs)
        .filter(([k]) => !isDeduction(k) && !isInvesting(k) && pnlGroup(k) === s.group)
        .map(([k, v], i) => line(`${s.key}_${i}`, k, v)),
    ),
  ).filter((s) => s.lines.length > 0)
  const investing = section('invest', 'Investing', [
    ...Object.entries(costs)
      .filter(([k]) => isInvesting(k))
      .map(([k, v], i) => line(`inv_${i}`, k, v)),
    line('inv_deployed', 'Saved & invested — the payday plan', deployedInvested),
  ])
  const netCash = section('cash', 'Cash', [line('checking', 'Change in cash', cashChange)])

  const d = (keys: string[]) => r2(g(end, keys) - g(start, keys))
  const debtKeys = [...groups.of('cards'), ...groups.of('student'), ...groups.of('other')].filter((k) => k !== 'gap')
  const balanceSheet = section('balance', 'Net worth change', [
    line('bs_hand', 'Cash on hand (checking + savings)', d(['checking', 'savings'])),
    line('bs_borrow', 'Borrowed to cover cash gaps', -d(['gap'])),
    line('bs_ret', 'TSP / 401(k)', d(groups.of('tsp'))),
    line('bs_biz', 'Your businesses', d(groups.of('nth'))),
    line('bs_house', 'House values', d(groups.of('house'))),
    line('bs_mort', 'Mortgages paid down', -d(groups.of('mortgage'))),
    line('bs_debt', 'Debts paid down', -d(debtKeys)),
  ])

  const netIncome = r2(gross.total - deductions.total)
  const spent = spending.reduce((t, s) => t + s.total, 0)
  return {
    payday: `${months[0]?.month ?? label}-01`,
    gross,
    deductions,
    netIncome,
    spending,
    freeCashFlow: r2(netIncome - spent),
    investing,
    netCash,
    balanceSheet,
    takeHome: netIncome,
  }
}
