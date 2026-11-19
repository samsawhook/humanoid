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

describe('modifications bridge', () => {
  it('is empty at the base, and moving to Houston with an office job and night law costs more', async () => {
    const { buildBridge, BASE_SELECTION } = await import('@/core/money/returnBudget')
    expect(buildBridge(BASE_SELECTION).rows).toEqual([])
    const b = buildBridge({ location: 'houston', arrangement: 'office', work: 'nightlaw', children: 2, macc: false })
    expect(b.rows.reduce((t, r) => t + r.amount, 0)).toBeGreaterThan(1000)
    expect(b.income[0]!.amount).toBeGreaterThan(0)
    expect(buildBridge({ ...BASE_SELECTION, work: 'lawschool' }).noSalary).toBe(true)
  })
})

describe('student loans in school', () => {
  it('are deferred in the bridge for any school, and in the 20-year model while enrolled', async () => {
    const { buildBridge, BASE_SELECTION } = await import('@/core/money/returnBudget')
    const b = buildBridge({ ...BASE_SELECTION, macc: true })
    expect(b.rows.filter((r) => r.group === 'School').reduce((t, r) => t + r.amount, 0)).toBeCloseTo(-(75.83 + 129), 2)
    const { projectPath } = await import('@/core/money/paths')
    const law = projectPath('law')
    const inSchool = law.months.filter((m) => m.inSchool)
    expect(inSchool.length).toBeGreaterThan(30)
    for (const m of inSchool) expect(m.costs['UT loan plan']).toBeUndefined()
  })
})
