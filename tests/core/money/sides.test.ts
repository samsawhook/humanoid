import { describe, expect, it } from 'vitest'
import { runPlan } from '@/core/money/briefing'
import { combineStatements, paycheckStatement } from '@/core/money/statement'
import { combinedStatement, residual, sommerStatement } from '@/core/money/sides'
import { benchmarkRows } from '@/core/money/benchmarks'

describe('Sommer and Combined paycheck statements', () => {
  const o = runPlan()
  const sts = o.allocations.map((a, i) => paycheckStatement(a, o.allocations[i + 1]))

  it('tie on every paycheck and every month', () => {
    for (const st of sts) {
      expect(residual(sommerStatement(st))).toBeCloseTo(0, 2)
      expect(residual(combinedStatement(st))).toBeCloseTo(0, 2)
    }
    expect(residual(combineStatements(sts.slice(0, 2).map(combinedStatement)))).toBeCloseTo(0, 2)
  })

  it('sends the whole regular $1,000 to the nanny and drops Wife & Kids when combined', () => {
    const s = sommerStatement(sts[0]!)
    const kids = s.spending.find((x) => x.key === 'childcare')!
    expect(kids.lines.some((l) => /Nanny — regular/.test(l.label) && l.amount === 1000)).toBe(true)
    expect(s.gross.lines.find((l) => /take-home/.test(l.label))!.amount).toBe(2100)
    const c = combinedStatement(sts[0]!)
    expect(c.spending.some((x) => x.key === 'sent')).toBe(false)
    expect(c.spending.find((x) => x.key === 'food')!.lines.some((l) => l.label === 'Groceries')).toBe(true)
  })

  it('compares the household categories against the advisors', () => {
    const rows = benchmarkRows(combineStatements(sts.slice(1, 3).map(combinedStatement)), 'household')
    for (const k of ['food', 'childcare', 'gifts', 'home', 'invest', 'cash']) expect(rows.some((r) => r.key === k)).toBe(true)
    expect(rows.some((r) => r.key === 'sent')).toBe(false)
  })
})
