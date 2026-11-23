import { TIMELINE } from '@/core/money/rates'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, paydayActions } from '@/core/money/allocation'
import { OBLIGATIONS, ONE_OFFS, PLAN_START } from '@/core/money/obligations'
import { TODOS } from '@/core/todos'
import type { LocalDate } from '@/core/types'
import { TodoList, type DebtTask, type PaydayTask } from './TodoList'

export const dynamic = 'force-dynamic'

function todayInTexas(): LocalDate {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) as LocalDate
}

/** Two business days before the pay date, as DFAS releases it. */
function spendable(payDate: string): string {
  const d = new Date(payDate + 'T12:00:00Z')
  let n = 2
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() - 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n--
  }
  return d.toISOString().slice(0, 10)
}

export default function TodoPage() {
  const today = todayInTexas()
  const allocations = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
  // Debt payments that are not on autopay: each one its own to-do, three months ahead.
  const kindOf = new Map(OBLIGATIONS.map((o) => [o.key, o.kind]))
  const isDebt = (key: string) => {
    const k = kindOf.get(key)
    return k === 'unsecured_debt' || k === 'arrears_catchup' || key === 'arrears_catchup_payment' || key === 'car_payoff_now'
  }
  const upcoming = allocations.filter((a) => a.paycheck.payDate >= today)
  const horizon = new Date(Date.parse(today) + 95 * 86400000).toISOString().slice(0, 10)
  const debts: DebtTask[] = upcoming
    .filter((a) => a.paycheck.payDate <= horizon)
    .flatMap((a) =>
      paydayActions(a)
        .filter((x) => isDebt(x.key))
        .map((x) => ({
          id: `debt-${a.paycheck.scheduledDate}-${x.key}`,
          payday: a.paycheck.scheduledDate,
          spendable: spendable(a.paycheck.payDate),
          label: x.label,
          amount: x.amount,
          howTo: x.howTo,
          short: x.shortfall,
        })),
    )
  // The next two paydays' other by-hand payments (the nanny, the lawn, Christmas).
  const paydays: PaydayTask[] = upcoming
    .slice(0, 2)
    .map((a) => ({
      id: `payday-${a.paycheck.scheduledDate}`,
      payday: a.paycheck.scheduledDate,
      spendable: spendable(a.paycheck.payDate),
      lines: paydayActions(a)
        .filter((x) => !isDebt(x.key))
        .map((x) => ({ label: x.label, amount: x.amount, howTo: x.howTo, short: x.shortfall })),
    }))
    .filter((p) => p.lines.length > 0)
  return (
    <main>
      <h1>To-do</h1>
      <p className="sub">
        What you can do today, soonest deadline first: a call, a letter, a form. Things that can&rsquo;t be done yet (a payday&rsquo;s
        transfers before the money lands, letters that need a posted payment) wait below until their day. Ticks are kept in this browser.
      </p>
      <TodoList todos={TODOS} today={today} paydays={paydays} debts={debts} />
    </main>
  )
}
