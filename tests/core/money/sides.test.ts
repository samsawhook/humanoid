import { describe, expect, it } from 'vitest'
import { runPlan } from '@/core/money/briefing'
import { paycheckStatement } from '@/core/money/statement'
import { combinedSide, residual, sommerSide, sumSides } from '@/core/money/sides'

describe('Sommer and Combined paycheck sides', () => {
  const o = runPlan()
  const sts = o.allocations.map((a, i) => paycheckStatement(a, o.allocations[i + 1]))

  it('tie on every paycheck and every month', () => {
    for (const st of sts) {
      expect(residual(sommerSide(st))).toBeCloseTo(0, 2)
      expect(residual(combinedSide(st))).toBeCloseTo(0, 2)
    }
    expect(residual(sumSides(sts.slice(0, 2).map(combinedSide)))).toBeCloseTo(0, 2)
  })

  it('sends the whole regular $1,000 to the nanny and drops Wife & Kids when combined', () => {
    const s = sommerSide(sts[0]!)
    const kids = s.sections.find((x) => x.key === 'childcare')!
    expect(kids.lines.some((l) => /Nanny — regular/.test(l.label) && l.amount === 1000)).toBe(true)
    expect(s.income.lines.find((l) => /take-home/.test(l.label))!.amount).toBe(2100)
    const c = combinedSide(sts[0]!)
    expect(c.sections.some((x) => x.key === 'sent')).toBe(false)
    expect(c.sections.find((x) => x.key === 'food')!.lines.some((l) => l.label === 'Groceries')).toBe(true)
  })
})
