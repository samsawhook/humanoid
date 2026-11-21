import { describe, expect, it } from 'vitest'
import { buildLedger, summarize } from '@/core/money/ledger'
import { SCENARIOS } from '@/core/money/scenarios'
import { apply, baseLevers } from '@/app/money/Planner'

describe('planner levers', () => {
  it('at their starting values, every scenario is unchanged', () => {
    for (const sc of SCENARIOS) {
      const a = summarize(buildLedger(sc))
      const b = summarize(buildLedger(apply(sc, baseLevers(sc))))
      expect(b.lowCash.value).toBeCloseTo(a.lowCash.value, -1)
      expect(b.netWorth.at(-1)!.value).toBeCloseTo(a.netWorth.at(-1)!.value, -2)
    }
  })

  it('a later start and a signing bonus move the first pay and add the bonus', () => {
    const sc = SCENARIOS.find((s) => s.id === 'cpa_mid')!
    const l = { ...baseLevers(sc), jobStart: '2028-01', signing: 5000 }
    const months = buildLedger(apply(sc, l)).months
    const first = months.find((m) => (m.income['Salary'] ?? 0) > 0)!
    expect(first.month).toBe('2028-01')
    expect(first.income['Signing bonus']).toBe(5000)
  })

  it('part-time work in law school pays Sep–May only', () => {
    const sc = SCENARIOS.find((s) => s.id === 'law_ttu')!
    const months = buildLedger(apply(sc, { ...baseLevers(sc), partTime: 1300 })).months
    expect(months.find((m) => m.month === '2028-10')!.income['Part-time work during school']).toBeGreaterThan(1300)
    expect(months.find((m) => m.month === '2028-07')!.income['Part-time work during school']).toBeUndefined()
    expect(months.find((m) => m.month === '2027-10')!.income['Part-time work during school']).toBeUndefined()
  })
})
