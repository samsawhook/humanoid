import { describe, expect, it } from 'vitest'
import { projectPath, federalTax, salaryAt } from '@/core/money/paths'

describe('law vs MAcc paths', () => {
  const law = projectPath('law')
  const macc = projectPath('macc')

  it('runs 240 months, and the deployment months are identical in both paths', () => {
    expect(law.months).toHaveLength(240)
    const dep = law.months.filter((m) => m.phase === 'Deployed')
    expect(dep.length).toBeGreaterThan(6)
    for (const m of dep) {
      const b = macc.months.find((x) => x.month === m.month)!
      expect(b.netWorth).toBe(m.netWorth)
    }
  })

  it('has law borrowing more at its low point than MAcc', () => {
    const low = (p: typeof law) => Math.min(...p.months.map((m) => m.cash))
    expect(low(law)).toBeLessThan(low(macc))
  })

  it('pays Nth every month after homecoming in both paths', () => {
    for (const p of [law, macc])
      for (const m of p.months.filter((x) => x.phase !== 'Deployed')) expect(m.costs['Nth Investments']).toBe(530)
  })

  it('interpolates salary and taxes nothing under the standard deduction', () => {
    expect(salaryAt([['2030-01', 60000], ['2031-01', 72000]], '2030-07')).toBe(66000)
    expect(federalTax(30000, 2026)).toBe(0)
    expect(federalTax(60000, 2026)).toBeCloseTo(2480 + (60000 - 32200 - 24800) * 0.12, 0)
  })
})
