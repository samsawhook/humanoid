import { describe, expect, it } from 'vitest'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, summarize } from '@/core/money/allocation'
import {
  OBLIGATIONS,
  ONE_OFFS,
  LATE_PAYMENTS_BALANCE,
  EXPECTED_BACK_PAY_NET,
} from '@/core/money/obligations'
import { backPay, mutaRate, EXPECTED_BACK_PAY } from '@/core/money/drillPay'
import { ENTITLEMENTS, TAX } from '@/core/money/rates'
import { SCRA_TARGETS, SCRA_EXCLUDED, SCRA_INTEREST_CAP } from '@/core/money/debts'
import { scraItem } from '@/core/money/adminItems'

describe('drill back pay', () => {
  it('pays a drill period at one thirtieth of MONTHLY basic pay', () => {
    // The mistake this guards against is treating a drill as a fraction of a paycheck.
    const base = ENTITLEMENTS.find((e) => e.key === 'base_pay')!.monthlyAmount
    expect(mutaRate()).toBeCloseTo(base / 30, 2)
  })

  it('never pays an allowance on a drill period', () => {
    const b = backPay({ mutas: 7, dutyDays: 0 })
    expect(b.lines).toHaveLength(1)
    expect(b.gross).toBeCloseTo(mutaRate() * 7, 2)
    // No BAH, no BAS — the whole amount is taxable basic pay.
    expect(b.federalTax).toBeCloseTo(b.gross * TAX.effectiveFederalRate, 2)
  })

  it('pays BAS on active-duty days but never on drills', () => {
    const adt = backPay({ mutas: 0, dutyDays: 3, basis: 'adt_day' })
    const idt = backPay({ mutas: 0, dutyDays: 3, basis: 'idt_two_mutas' })
    expect(adt.lines.map((l) => l.key)).toContain('duty_days_bas')
    expect(idt.lines.map((l) => l.key)).not.toContain('duty_days_bas')
    // BAS is an allowance, so it is not taxed.
    const bas = adt.lines.find((l) => l.key === 'duty_days_bas')!
    expect(bas.taxable).toBe(false)
    expect(bas.fica).toBe(false)
  })

  it('makes the reading of the 1380 days worth real money, and says so', () => {
    const conservative = backPay(EXPECTED_BACK_PAY)
    const generous = backPay({ ...EXPECTED_BACK_PAY, basis: 'idt_two_mutas' })
    expect(generous.net).toBeGreaterThan(conservative.net)
    expect(conservative.warnings.join(' ')).toMatch(/inactive duty in day status/i)
  })

  it('does not apply CZTE to drills performed before shipping', () => {
    expect(EXPECTED_BACK_PAY.czte).toBe(false)
    expect(backPay(EXPECTED_BACK_PAY).federalTax).toBeGreaterThan(0)
    // FICA survives CZTE either way.
    expect(backPay({ ...EXPECTED_BACK_PAY, czte: true }).fica).toBeGreaterThan(0)
  })
})

describe('one-off inflows', () => {
  const pays = projectPaychecks('2026-08-15', '2027-08-01')
  const withOneOffs = allocateAll(pays, OBLIGATIONS, ONE_OFFS)
  const without = allocateAll(pays, OBLIGATIONS)

  it('lands the back pay on the first payday on or after its date', () => {
    const landed = withOneOffs.find((a) => a.oneOffs?.some((o) => o.key === 'drill_back_pay'))!
    // Dated to the 14 August pay run, which is what funds the full arrears payment.
    expect(landed.paycheck.payDate).toBe('2026-08-14')
    expect(landed.openingBuffer).toBeGreaterThanOrEqual(EXPECTED_BACK_PAY_NET)
  })

  it('reconciles: every dollar in is either allocated or still in hand', () => {
    const totalNet = summarize(withOneOffs).totalNet
    const oneOffIn = withOneOffs.reduce(
      (t, a) => t + (a.oneOffs ?? []).reduce((u, o) => u + o.amount, 0),
      0,
    )
    const allocated = withOneOffs.reduce((t, a) => t + a.totalAllocated, 0)
    const closing = withOneOffs[withOneOffs.length - 1]!.remainder
    expect(totalNet + oneOffIn).toBeCloseTo(allocated + closing, 2)
  })

  /**
   * The load-bearing assumption in the file. The 14 August cheque frees about $510 on
   * its own — nowhere near a full payment — so without the back pay landing that day
   * the $1,300 goes short and the model says so rather than pretending otherwise.
   */
  it('is what makes the full 14 August payment affordable at all', () => {
    const first = withOneOffs.find((a) => a.paycheck.payDate === '2026-08-14')!
    expect(first.lines.find((l) => l.key === 'arrears_first_payment')!.shortfall).toBe(0)

    const firstWithout = without.find((a) => a.paycheck.payDate === '2026-08-14')!
    const shortWithout = firstWithout.lines.find((l) => l.key === 'arrears_first_payment')!
    expect(shortWithout.shortfall).toBeGreaterThan(700)
    expect(summarize(without).bindingShortfall).toBeGreaterThan(0)
  })

  it('clears the tolls eventually, behind the mortgage rather than ahead of it', () => {
    const cleanup = withOneOffs
      .flatMap((a) => a.lines.filter((l) => l.key === 'late_payments'))
      .reduce((t, l) => t + l.allocated, 0)
    expect(cleanup).toBeCloseTo(LATE_PAYMENTS_BALANCE, 2)
  })
})

describe('SCRA', () => {
  it('caps at six percent and never touches Chase or the dismissed accounts', () => {
    expect(SCRA_INTEREST_CAP).toBe(0.06)
    const targets = SCRA_TARGETS.map((t) => t.creditor)
    expect(targets).toContain('Wells Fargo Platinum')
    expect(targets).toContain('Citi')
    expect(targets).not.toContain('Chase')

    // Wells Fargo IS the Platinum card. One account must not produce two letters —
    // it was briefly listed twice, once by creditor name and once by card name.
    const keyed = SCRA_TARGETS.filter((t) => t.debtKey).map((t) => t.debtKey)
    expect(new Set(keyed).size).toBe(keyed.length)
    expect(SCRA_TARGETS.filter((t) => !t.debtKey)).toHaveLength(0)

    const excluded = SCRA_EXCLUDED.map((t) => t.creditor)
    expect(excluded).toContain('Chase')
    expect(excluded.join(' ')).toMatch(/Goldman/)
  })

  it('produces one pinned task rather than one per creditor', () => {
    const item = scraItem('2026-08-28')
    expect(item.autopilotCritical).toBe(true)
    expect(item.notes).toMatch(/retroactive to 2026-07-31/i)
    expect(item.notes).toMatch(/FORGIVEN, not deferred/i)
    // Every creditor appears in the notes, so the single item loses no detail.
    for (const t of SCRA_TARGETS) expect(item.notes).toContain(t.creditor)
  })
})
