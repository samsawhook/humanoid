import { TIMELINE } from '@/core/money/rates'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, paydayActions } from '@/core/money/allocation'
import { OBLIGATIONS, ONE_OFFS, PLAN_START } from '@/core/money/obligations'
import { TODOS } from '@/core/todos'
import type { LocalDate } from '@/core/types'
import { TodoList, type PaydayTask } from './TodoList'

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
  // The next two paydays' by-hand payments: what you have to move yourself.
  const paydays: PaydayTask[] = allocations
    .filter((a) => a.paycheck.payDate >= today)
    .slice(0, 2)
    .map((a) => ({
      id: `payday-${a.paycheck.scheduledDate}`,
      payday: a.paycheck.scheduledDate,
      spendable: spendable(a.paycheck.payDate),
      lines: paydayActions(a).map((x) => ({ label: x.label, amount: x.amount, howTo: x.howTo, short: x.shortfall })),
    }))
    .filter((p) => p.lines.length > 0)
  return (
    <main>
      <h1>To-do</h1>
      <p className="sub">
        Only what needs you: a call, a letter, a form, a payment to move by hand. Autopays and the plan&rsquo;s own transfers are
        not here. Ticks are kept in this browser.
      </p>
      <TodoList todos={TODOS} today={today} paydays={paydays} />
    </main>
  )
}
