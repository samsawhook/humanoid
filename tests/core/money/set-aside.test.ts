import { describe, expect, it } from 'vitest'
import { runPlan } from '@/core/money/briefing'
import { OBLIGATIONS, ONE_OFFS } from '@/core/money/obligations'
import { setAsideFor } from '@/core/money/setAside'

describe('set aside: what each paycheck holds in checking, and for what', () => {
  const al = runPlan().allocations
  const at = (d: string) => setAsideFor(al, al.findIndex((a) => a.paycheck.scheduledDate === d), OBLIGATIONS, ONE_OFFS)

  it('15 Feb holds its leftover for the course and the June emergency', () => {
    const s = at('2027-02-15')
    expect(s.amount).toBeGreaterThan(0)
    expect(s.items.map((x) => x.label).join(' ')).toMatch(/MAcc catch-up course/)
    expect(s.items.map((x) => x.label).join(' ')).toMatch(/Emergency/)
  })

  it('the amount is always the paycheck’s own leftover', () => {
    al.forEach((a, i) => expect(setAsideFor(al, i, OBLIGATIONS, ONE_OFFS).amount).toBeCloseTo(Math.max(0, a.remainder), 2))
  })
})
