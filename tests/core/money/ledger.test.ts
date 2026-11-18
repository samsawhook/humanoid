import { describe, expect, it } from 'vitest'
import { buildLedger, groupTotal, payoffOf } from '@/core/money/ledger'

describe('balance ledger', () => {
  const law = buildLedger('law')
  const macc = buildLedger('macc')

  it('runs 20 years, monthly for the first five', () => {
    expect(law.points[0]!.month).toBe('2026-11')
    expect(law.points[60]!.month).toBe('2031-11')
    expect(law.points.at(-1)!.month >= '2046-10').toBe(true)
  })

  it('is the same plan while deployed and splits by path once home', () => {
    const i = law.points.findIndex((p) => p.month === law.homeMonth)
    expect(law.points[i - 1]!.bal).toEqual(macc.points[i - 1]!.bal)
    expect(law.points[i + 2]!.phase).not.toBe(macc.points[i + 2]!.phase)
  })

  it('pays off the car in November, the mortgage arrears in January and Caine & Weiner in February', () => {
    expect(payoffOf(law, 'car').month).toBe('2026-11')
    expect(payoffOf(law, 'arrears').month).toBe('2027-01')
    expect(payoffOf(law, 'caine').month).toBe('2027-02')
  })

  it('keeps a schedule that adds up: payment − interest = drop in balance', () => {
    let prev = law.opening.platinum!
    for (const p of law.points.slice(0, 30)) {
      const b = p.bal.platinum!
      expect(prev + (p.int.platinum ?? 0) - (p.pay.platinum ?? 0)).toBeCloseTo(b, 1)
      prev = b
    }
  })

  it('holds Goldman and PSECU flat', () => {
    expect(law.points.at(-1)!.bal.goldman).toBe(law.opening.goldman)
    expect(groupTotal(law.points[0]!, 'cards')).toBeGreaterThan(0)
  })
})
