import { describe, expect, it } from 'vitest'
import { currentAndNext, spendableFrom } from '@/app/money/PaydayFocus'
import { allocateAll } from '@/core/money/allocation'
import { projectPaychecks } from '@/core/money/paychecks'
import { OBLIGATIONS, ONE_OFFS, PLAN_START } from '@/core/money/obligations'
import { TIMELINE } from '@/core/money/rates'

describe('this paycheck and the next', () => {
  const all = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
  const at = (today: string) => currentAndNext(all, today).map((i) => (i === null ? null : all[i]!.paycheck.scheduledDate))

  it('counts pay as spendable two business days early', () => {
    expect(spendableFrom('2026-12-01')).toBe('2026-11-27')
    expect(spendableFrom('2026-12-15')).toBe('2026-12-11')
  })
  it('shows the paycheck being spent now and the one after', () => {
    expect(at('2026-11-18')).toEqual(['2026-11-15', '2026-12-01'])
    // The 1 Dec cheque is spendable from 27 Nov, so it becomes "now" then.
    expect(at('2026-11-27')).toEqual(['2026-12-01', '2026-12-15'])
  })
})

describe('payday cards', () => {
  it('groups the car payoff under debt, adds up, and reads paid-so-far from the actuals', async () => {
    const { groupsFor } = await import('@/app/money/PaydayFocus')
    const { allocateAll } = await import('@/core/money/allocation')
    const { projectPaychecks } = await import('@/core/money/paychecks')
    const { OBLIGATIONS, ONE_OFFS, PLAN_START } = await import('@/core/money/obligations')
    const { TIMELINE } = await import('@/core/money/rates')
    const all = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
    const [nov, dec] = [all[0]!, all[1]!]
    const groups = groupsFor(nov, dec)
    const debt = groups.find((g) => g.key === 'debt')!
    expect(debt.rows.some((r) => r.key === 'car_payoff_now' && r.spent === 799.21)).toBe(true)
    const out = groups.flatMap((g) => g.rows).reduce((s, r) => s + r.budget, 0)
    // take-home + carried in − everything = what the next card says is carried in
    expect(Math.round((nov.paycheck.net + nov.openingBuffer - out) * 100) / 100).toBeCloseTo(dec.openingBuffer, 2)
  })
})
