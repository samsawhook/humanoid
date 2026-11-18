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
