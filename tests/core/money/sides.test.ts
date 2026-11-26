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

describe('advisor lights: red only on the harmful side', () => {
  it('spending below an advisor figure is never red; investing above one is never red', async () => {
    const { benchmarkRows } = await import('@/core/money/benchmarks')
    const { runPlan } = await import('@/core/money/briefing')
    const { paycheckStatement } = await import('@/core/money/statement')
    const al = runPlan().allocations
    for (let i = 0; i < al.length - 1; i++) {
      const st = paycheckStatement(al[i]!, al[i + 1])
      for (const row of benchmarkRows(st, 'sam')) {
        const save = ['invest', 'brokerage', 'business', 'cash', 'debt'].includes(row.key)
        for (const c of row.cells) {
          if (c.light !== 'red' || c.key === 'target' || row.key === 'debt' && c.key === 'advisor') continue
          const n = Number(c.text.replace(/[^0-9.]/g, ''))
          if (!Number.isFinite(n) || c.text.includes('–')) continue
          if (save) expect(row.adjusted).toBeLessThan(n)
          else expect(row.adjusted).toBeGreaterThan(n)
        }
      }
    }
  })
})
