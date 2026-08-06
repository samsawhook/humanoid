import { describe, expect, it } from 'vitest'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, summarize } from '@/core/money/allocation'
import {
  OBLIGATIONS,
  ONE_OFFS,
  LATE_PAYMENTS_BALANCE,
  EXPECTED_BACK_PAY_NET,
  BACK_PAY_CLAIMS,
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
    // Dated 2026-08-21 — a placeholder, not a plan. It lands on the next cheque.
    expect(landed.paycheck.scheduledDate).toBe('2026-09-01')
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
   * The one gap in the plan is the 15 August full mortgage payment, and the back pay's
   * first claim is exactly the size of it. That is the design: the payment happens on
   * the date it was asked for, and the windfall closes the stretch whenever it lands.
   */
  it('is sized to close the 15 August gap, whenever it arrives', () => {
    const gap = summarize(withOneOffs).bindingShortfall
    expect(gap).toBeCloseTo(790.48, 2)

    const topup = BACK_PAY_CLAIMS.find((c) => c.key === 'august_mortgage_topup')!
    expect(topup.cap).toBeGreaterThanOrEqual(Math.floor(gap))
    // And it is first, so it is funded at every plausible amount.
    expect(BACK_PAY_CLAIMS[0]!.key).toBe('august_mortgage_topup')
  })

  /**
   * The real cost of insisting on a FULL payment on 15 August: it spends the cheque to
   * the last dollar, so nothing carries into 1 September. The back pay refills that.
   *
   * Without it a second payday goes short and Chase is what yields — which is the
   * intended behaviour rather than a problem. It is a closed account on an old
   * arrangement, ranked LAST among the bills for exactly this reason, so the squeeze
   * lands there instead of on the nannies or a live credit line.
   */
  it('lets Chase be the line that yields when it arrives late', () => {
    expect(summarize(withOneOffs).bindingShortPaydays).toEqual(['2026-08-14'])

    const lateShort = summarize(without).bindingShortPaydays
    expect(lateShort).toContain('2026-09-01')

    const sept = without.find((a) => a.paycheck.scheduledDate === '2026-09-01')!
    expect(sept.lines.find((l) => l.key === 'debt_agreements')!.shortfall).toBe(110)
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
