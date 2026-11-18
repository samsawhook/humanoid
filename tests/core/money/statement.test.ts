import { describe, expect, it } from 'vitest'
import { paycheckStatement } from '@/core/money/statement'
import { allocateAll } from '@/core/money/allocation'
import { projectPaychecks } from '@/core/money/paychecks'
import { OBLIGATIONS, ONE_OFFS, PLAN_START } from '@/core/money/obligations'
import { TIMELINE } from '@/core/money/rates'

describe('paycheck statement, gross to cash', () => {
  const all = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)

  it('accounts for every dollar of gross on every paycheck, and checking matches the plan', () => {
    for (let i = 0; i < all.length - 1; i++) {
      const s = paycheckStatement(all[i]!, all[i + 1])
      const spend = s.spending.reduce((t, x) => t + x.total, 0)
      expect(s.netIncome).toBeCloseTo(s.gross.total - s.deductions.total, 2)
      expect(s.freeCashFlow).toBeCloseTo(s.netIncome - spend, 2)
      expect(s.netCash.total).toBeCloseTo(s.freeCashFlow - s.investing.total, 2)
      // take-home = net income − the TSP withheld
      const tsp = s.investing.lines.find((l) => l.key === 'tsp')!.amount
      expect(s.takeHome).toBeCloseTo(s.netIncome - tsp, 2)
      const checking = s.netCash.lines.find((l) => l.key === 'checking')!.amount
      expect(checking).toBeCloseTo(all[i + 1]!.openingBuffer - all[i]!.openingBuffer, 2)
    }
  })

  it('books money to Sommer under Wife & Kids: nanny $1,000 on 15 Nov, top-up from 1 Dec; gifts under personal', () => {
    const s = paycheckStatement(all[0]!, all[1])
    const sent = s.spending.find((x) => x.key === 'sent')!
    expect(sent.label).toBe('Wife & Kids')
    expect(sent.lines.find((l) => l.key === 'support_home_deployed')!.spent).toBe(1000)
    expect(sent.lines.find((l) => l.key === 'nanny_topup')).toBeUndefined()
    const dec = paycheckStatement(all[1]!, all[2]).spending.find((x) => x.key === 'sent')!
    expect(dec.lines.find((l) => l.key === 'nanny_topup')!.amount).toBe(200)
    const personal = s.spending.find((x) => x.key === 'personal')!
    expect(personal.lines.some((l) => l.label.startsWith('Gifts'))).toBe(true)
    expect(s.investing.lines.find((l) => l.key === 'tsp_match')!.nonCash).toBe(true)
  })
})

describe('one-month view', () => {
  it('sums the 1st and the 15th line by line', async () => {
    const { combineStatements } = await import('@/core/money/statement')
    const all = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
    const i = all.findIndex((a) => a.paycheck.scheduledDate === '2026-12-01')
    const a = paycheckStatement(all[i]!, all[i + 1])
    const b = paycheckStatement(all[i + 1]!, all[i + 2])
    const m = combineStatements([a, b])
    expect(m.gross.total).toBeCloseTo(a.gross.total + b.gross.total, 2)
    expect(m.freeCashFlow).toBeCloseTo(a.freeCashFlow + b.freeCashFlow, 2)
    expect(m.netCash.total).toBeCloseTo(a.netCash.total + b.netCash.total, 2)
    const spend = (s: typeof a) => s.spending.reduce((t, x) => t + x.total, 0)
    expect(spend(m)).toBeCloseTo(spend(a) + spend(b), 2)
    // the mortgage line appears once, with both payments
    const home = m.spending.find((s) => s.key === 'home')!
    expect(home.total).toBeGreaterThan(2700)
  })
})
