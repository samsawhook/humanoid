import { describe, expect, it } from 'vitest'
import { buildLedger, buildSommerLedger } from '@/core/money/ledger'
import { SCENARIOS } from '@/core/money/scenarios'

const sc = SCENARIOS.find((s) => s.id === 'cpa_mid')!
const cash = (p: { bal: Record<string, number> }) => (p.bal.checking ?? 0) + (p.bal.savings ?? 0) - (p.bal.gap ?? 0)
const at = (l: ReturnType<typeof buildLedger>, m: string) => l.points.find((p) => p.month >= m)!

describe('planner: Sam, Sommer, Combined', () => {
  const sam = buildLedger({ ...sc, a: { ...sc.a, sommer: { ...sc.a.sommer, included: false } } })
  const both = buildLedger(sc)
  const her = buildSommerLedger(sc)

  it('Sommer saves $850 a month while you are away', () => {
    expect(cash(at(her, '2027-07'))).toBeCloseTo(9 * 850, 0)
  })

  it('her side carries only her income and expenses', () => {
    for (const p of her.points) for (const g of Object.keys(p.out)) expect(['Home', 'Personal', 'Car']).toContain(g)
  })

  it('Combined starts home with her savings added to yours', () => {
    const m = sam.homeMonth
    expect(cash(at(both, m)) - cash(at(sam, m))).toBeGreaterThan(cash(at(her, '2027-07')) - 1)
  })

  it('Combined is never below your side alone', () => {
    for (const p of both.points) {
      const s = sam.points.find((x) => x.month === p.month)!
      expect(cash(p)).toBeGreaterThanOrEqual(cash(s) - 1)
    }
  })
})

describe('Sommer home when childcare comes within $1,500 of her take-home', () => {
  const law = SCENARIOS.find((s) => s.id === 'law_ttu')!
  const months = buildLedger(law).months
  const at = (m: string) => months.find((x) => x.month === m)!

  it('in Austin with three under five she works part-time, with no childcare', () => {
    const m = at('2031-03')
    expect(m.costs['Children under 5 (care costs; Sommer home, no childcare)']).toBeGreaterThan(0)
    expect(m.costs['Children under 5 (childcare & care)']).toBeUndefined()
    expect(m.income['Sommer — part-time pay']).toBeCloseTo(m.income['Sommer — take-home pay'] ?? 4200 * 1.03 ** 3.6 * 0.5, -3)
    expect(m.income['Sommer — take-home pay']).toBeUndefined()
  })

  it('in Lubbock with two under five she keeps working', () => {
    const m = at('2029-03')
    expect(m.income['Sommer — take-home pay']).toBeGreaterThan(0)
    expect(m.costs['Children under 5 (childcare & care)']).toBeGreaterThan(0)
  })

  it('off, she always works', () => {
    const off = buildLedger({ ...law, a: { ...law.a, sommer: { ...law.a.sommer, homeRule: false } } }).months
    expect(off.find((x) => x.month === '2031-03')!.income['Sommer — take-home pay']).toBeGreaterThan(0)
  })
})
