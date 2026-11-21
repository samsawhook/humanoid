import { describe, expect, it } from 'vitest'
import { projectPath, PATH_ASSUMPTIONS } from '@/core/money/paths'
import { SCENARIOS } from '@/core/money/scenarios'

const L = PATH_ASSUMPTIONS.law.loans

describe('full-time law: federal Direct Unsubsidized loans', () => {
  for (const sc of SCENARIOS.filter((s) => s.path === 'law')) {
    const months = projectPath('law', sc.a).months
    const loanMonths = months.filter((m) => m.borrowed > 0)

    it(`${sc.id}: disbursed only in August and January, while enrolled`, () => {
      for (const m of loanMonths) {
        expect(['08', '01']).toContain(m.month.slice(5))
        expect(m.month >= sc.a.law.schoolStart && m.month <= sc.a.law.schoolEnd).toBe(true)
      }
    })

    it(`${sc.id}: within $50k a year, the cost of attendance and $200k in all`, () => {
      const gross = loanMonths.map((m) => m.borrowed / (1 - L.fee))
      for (let i = 0; i < gross.length; i += 2) {
        const year = gross[i]! + (gross[i + 1] ?? 0)
        expect(year).toBeLessThanOrEqual(L.annualCap + 1)
        expect(year).toBeLessThanOrEqual(L.coaBudget * 1.025 ** 4 + 1)
      }
      expect(gross.reduce((t, v) => t + v, 0)).toBeLessThanOrEqual(L.aggregateCap + 1)
    })

    it(`${sc.id}: no payments until six months after graduation`, () => {
      const first = months.find((m) => m.costs['Law-school loans — Tiered Standard repayment'])
      if (loanMonths.length) expect(first?.month).toBe('2030-12')
    })
  }
})
