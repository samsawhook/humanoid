import { describe, expect, it } from 'vitest'
import { OTHER_INCOME, RETURN_BUDGET, monthlyCash, salaryNeeded } from '@/core/money/returnBudget'

describe('the after-you-are-home budget', () => {
  const spend = RETURN_BUDGET.flatMap((c) => c.lines).reduce((t, l) => t + l.amount, 0)
  const other = { va: OTHER_INCOME[0]!.amount, drill: OTHER_INCOME[1]!.amount }
  it('works back to a salary whose take-home covers the month, to the dollar', () => {
    const s = salaryNeeded(spend, other)
    expect(monthlyCash(s.salary, other).cash).toBeGreaterThanOrEqual(spend - 1)
    expect(monthlyCash(s.salary - 200, other).cash).toBeLessThan(spend)
  })
  it('needs more salary when VA comes in lower', () => {
    expect(salaryNeeded(spend, { ...other, va: 500 }).salary).toBeGreaterThan(salaryNeeded(spend, other).salary)
  })
})
