import { describe, expect, it } from 'vitest'
import { payDatesBetween, projectPaycheck, projectPaychecks, round2 } from '@/core/money/paychecks'
import {
  allocate,
  allocateAll,
  balanceClearedOn,
  summarize,
  type Obligation,
} from '@/core/money/allocation'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import { CAR_LOAN_BALANCE, MORTGAGE_ARREARS_BALANCE, OBLIGATIONS } from '@/core/money/obligations'

describe('pay dates', () => {
  it('lands on the 1st and the 15th', () => {
    expect(payDatesBetween('2026-09-01', '2026-10-15')).toEqual([
      '2026-09-01',
      '2026-09-15',
      '2026-10-01',
      '2026-10-15',
    ])
  })

  it('shifts a weekend payday back to Friday', () => {
    // 2026-11-15 is a Sunday.
    expect(projectPaycheck('2026-11-15').payDate).toBe('2026-11-13')
    // 2026-08-15 is a Saturday.
    expect(projectPaycheck('2026-08-15').payDate).toBe('2026-08-14')
    // The scheduled date is kept so it still reconciles against an LES.
    expect(projectPaycheck('2026-11-15').scheduledDate).toBe('2026-11-15')
  })

  it('pays the second half of the prior month on the 1st', () => {
    const p = projectPaycheck('2026-10-01')
    expect(p.periodStart).toBe('2026-09-16')
    expect(p.periodEnd).toBe('2026-09-30')
  })

  it('handles the January 1st rollover into December', () => {
    const p = projectPaycheck('2027-01-01')
    expect(p.periodStart).toBe('2026-12-16')
    expect(p.periodEnd).toBe('2026-12-31')
  })
})

describe('entitlement timeline', () => {
  it('pays only base, BAH and BAS before the deployment', () => {
    const keys = projectPaycheck('2026-08-15').lines.map((l) => l.key)
    expect(keys).toEqual(['base_pay', 'bah', 'bas'])
  })

  it('adds IDP once in theater', () => {
    const keys = projectPaycheck('2026-10-01').lines.map((l) => l.key)
    expect(keys).toContain('idp')
  })

  it('adds FSA only after its start date, not before', () => {
    // FSA starts 2026-08-30 (30 days from pre-mob). The cheque covering 08-01..08-15
    // is too early; the one covering 08-16..08-31 catches it.
    expect(projectPaycheck('2026-08-15').lines.map((l) => l.key)).not.toContain('fsa')
    expect(projectPaycheck('2026-09-01').lines.map((l) => l.key)).toContain('fsa')
  })

  it('adds ODP last', () => {
    // ODP starts 2026-09-29 (60 days from pre-mob).
    expect(projectPaycheck('2026-09-15').lines.map((l) => l.key)).not.toContain('odp')
    expect(projectPaycheck('2026-10-01').lines.map((l) => l.key)).toContain('odp')
  })

  it('has every entitlement running by the time ODP starts', () => {
    const keys = projectPaycheck('2026-10-01').lines.map((l) => l.key)
    expect(keys.sort()).toEqual(['bah', 'bas', 'base_pay', 'fsa', 'idp', 'odp'])
  })

  it('pays half a month per cheque', () => {
    const base = ENTITLEMENTS.find((e) => e.key === 'base_pay')!
    const line = projectPaycheck('2026-08-15').lines.find((l) => l.key === 'base_pay')!
    expect(line.amount).toBe(base.monthlyAmount / 2)
  })
})

describe('CZTE', () => {
  it('is off before the zone and on after', () => {
    expect(projectPaycheck('2026-09-01').czte).toBe(false)
    expect(projectPaycheck('2026-10-01').czte).toBe(true)
  })

  it('zeroes federal income tax but never touches FICA', () => {
    const before = projectPaycheck('2026-09-01')
    const after = projectPaycheck('2026-10-01')

    expect(before.federalTax).toBeGreaterThan(0)
    expect(after.federalTax).toBe(0)

    // FICA is on base pay and keeps coming out either way.
    const expectedFica =
      Math.round((ENTITLEMENTS.find((e) => e.key === 'base_pay')!.monthlyAmount / 2) * TAX.ficaRate * 100) / 100
    expect(before.fica).toBe(expectedFica)
    expect(after.fica).toBe(expectedFica)
  })

  it('raises net without raising gross for the same entitlement set', () => {
    // Same entitlements either side of the boundary, so the only mover is tax.
    const only = ENTITLEMENTS.filter((e) => ['base_pay', 'bah', 'bas'].includes(e.key))
    const before = projectPaycheck('2026-09-01', only)
    const after = projectPaycheck('2026-10-01', only)

    expect(after.gross).toBe(before.gross)
    expect(after.net).toBeGreaterThan(before.net)
  })

  it('never taxes allowances, CZTE or not', () => {
    const p = projectPaycheck('2026-08-15')
    const allowances = p.lines.filter((l) => ['bah', 'bas'].includes(l.key))
    expect(allowances.every((l) => !l.taxable)).toBe(true)
    expect(p.taxableGross).toBe(p.lines.find((l) => l.key === 'base_pay')!.amount)
  })
})

describe('allocation', () => {
  const rent: Obligation = {
    key: 'rent',
    label: 'Rent',
    amountPerPaycheck: 1000,
    payDays: 'both',
    activeFrom: null,
    activeTo: null,
    priority: 10,
    kind: 'secured_recurring',
  }

  it('pays in strict priority order and reports the shortfall out loud', () => {
    const paycheck = projectPaycheck('2026-08-15')
    const big: Obligation = { ...rent, key: 'big', label: 'Big', amountPerPaycheck: 99_999, priority: 1 }
    const result = allocate(paycheck, [big, rent])

    expect(result.lines[0]?.key).toBe('big')
    expect(result.lines[0]?.allocated).toBe(paycheck.net)
    // The lower-priority item is not silently dropped — it is reported unpaid.
    expect(result.lines[1]?.key).toBe('rent')
    expect(result.lines[1]?.allocated).toBe(0)
    expect(result.lines[1]?.shortfall).toBe(1000)
    expect(result.remainder).toBe(0)
  })

  it('never allocates more than the paycheck holds', () => {
    for (const a of allocateAll(projectPaychecks('2026-08-01', '2027-06-01'), OBLIGATIONS)) {
      expect(a.totalAllocated).toBeLessThanOrEqual(a.paycheck.net + 0.001)
      expect(a.remainder).toBeGreaterThanOrEqual(0)
    }
  })

  it('respects which payday an obligation falls on', () => {
    const firstOnly: Obligation = { ...rent, key: 'first_only', payDays: 'first' }
    expect(allocate(projectPaycheck('2026-09-01'), [firstOnly]).lines).toHaveLength(1)
    expect(allocate(projectPaycheck('2026-09-15'), [firstOnly]).lines).toHaveLength(0)
  })

  it('prorates a mid-period start, and only that period', () => {
    const nanny: Obligation = {
      ...rent,
      key: 'nanny',
      label: 'Nanny',
      amountPerPaycheck: 750,
      activeFrom: '2026-08-09',
      prorate: true,
    }

    // Period 08-01..08-15 is 15 days; the nanny runs 08-09..08-15, so 7 of them.
    const partial = allocate(projectPaycheck('2026-08-15'), [nanny]).lines[0]!
    expect(partial.requested).toBe(round2((750 * 7) / 15))
    expect(partial.requested).toBe(350)
    expect(partial.proratedFrom).toBe(750)

    // The next period is fully covered, so it charges in full and says nothing about proration.
    const full = allocate(projectPaycheck('2026-09-01'), [nanny]).lines[0]!
    expect(full.requested).toBe(750)
    expect(full.proratedFrom).toBeUndefined()
  })

  it('leaves un-prorated obligations at their flat amount regardless of period length', () => {
    // February's second half is 13 days, August's is 16. A flat obligation ignores that.
    const feb = allocate(projectPaycheck('2027-03-01'), [rent]).lines[0]!
    const aug = allocate(projectPaycheck('2026-09-01'), [rent]).lines[0]!
    expect(feb.requested).toBe(1000)
    expect(aug.requested).toBe(1000)
  })

  it('respects the active window', () => {
    const window: Obligation = { ...rent, key: 'w', activeFrom: '2026-10-01', activeTo: '2026-10-31' }
    expect(allocate(projectPaycheck('2026-09-15'), [window]).lines).toHaveLength(0)
    expect(allocate(projectPaycheck('2026-10-15'), [window]).lines).toHaveLength(1)
    expect(allocate(projectPaycheck('2026-11-13'), [window]).lines).toHaveLength(0)
  })
})

describe('the real plan', () => {
  const allocations = allocateAll(projectPaychecks('2026-08-15', '2027-08-01'), OBLIGATIONS)
  const summary = summarize(allocations)
  const cleared = balanceClearedOn(allocations, OBLIGATIONS)

  it('always pays the current mortgage in full — missing it is what creates arrears', () => {
    for (const a of allocations) {
      const line = a.lines.find((l) => l.key === 'mortgage_current')
      if (line) expect(line.shortfall).toBe(0)
    }
  })

  it('bills the car monthly, not per payday', () => {
    // $330 a MONTH. It only ever appears on the 1st.
    for (const a of allocations) {
      const line = a.lines.find((l) => l.key === 'car_payoff')
      if (line) expect(a.paycheck.scheduledDate.slice(8, 10)).toBe('01')
    }
  })

  it('pays the car off to its balance and then stops billing', () => {
    expect(cleared.car_payoff?.paid).toBe(CAR_LOAN_BALANCE)
    // Six monthly payments rather than the eleven paydays a twice-monthly bill took.
    expect(cleared.car_payoff?.clearedOn).toBe('2027-02-01')

    const after = allocations.filter((a) => a.paycheck.payDate > '2027-02-01')
    expect(after.every((a) => !a.lines.some((l) => l.key === 'car_payoff'))).toBe(true)
  })

  it('cures the arrears at whatever rate the paydays allow, and stops there', () => {
    expect(cleared.mortgage_arrears?.cap).toBe(MORTGAGE_ARREARS_BALANCE)
    expect(cleared.mortgage_arrears?.paid).toBe(MORTGAGE_ARREARS_BALANCE)
    // A measurement, not a target — this date falls out of the plan rather than setting
    // it, and it moves whenever anything upstream does: 01-15 with the deployed
    // household profile, back to 02-15 when home improvement was corrected upward,
    // forward again to 01-15 once the car turned out to bill monthly rather than
    // twice a month, then back to 03-15 when the SGLI and DFAC deductions landed.
    // Each move is the gauge doing its job: it is the slack, so it absorbs everything.
    expect(cleared.mortgage_arrears?.clearedOn).toBe('2027-03-15')
  })

  /**
   * The gauge deliberately asks for more than it can get; that unmet ask is how it
   * measures slack, not a bill going unpaid. `bindingShortfall` is the honest number.
   */
  it('separates the gauge’s unmet ask from obligations that genuinely went unpaid', () => {
    expect(summary.totalShortfall).toBeGreaterThan(summary.bindingShortfall)
    expect(summary.firstShortPayday).toBe('2026-08-14') // gauge unmet from the very first payday
    expect(summary.firstBindingShortPayday).toBe('2026-09-01') // first real miss
  })

  it('cuts strictly from the bottom of the priority order', () => {
    for (const a of allocations.filter((x) => x.totalShortfall > 0)) {
      const lastPaidInFull = a.lines.findLastIndex((l) => l.shortfall === 0)
      const firstShorted = a.lines.findIndex((l) => l.shortfall > 0)
      expect(lastPaidInFull).toBeLessThan(firstShorted)
    }
  })

  it('never shorts the house, the truck, or childcare', () => {
    for (const a of allocations) {
      for (const line of a.lines.filter((l) =>
        ['mortgage_current', 'car_payoff', 'childcare'].includes(l.key),
      )) {
        expect(line.shortfall).toBe(0)
      }
    }
  })

  it('starts the debt paydown and emergency fund with the deployment pay', () => {
    const early = allocations.find((a) => a.paycheck.scheduledDate === '2026-08-15')!
    expect(early.lines.map((l) => l.key)).not.toContain('debt_paydown')
    expect(TIMELINE.czteStart).toBe('2026-09-04')
  })
})

describe('deductions', () => {
  it('collects BAS back once you are eating at the DFAC', () => {
    const before = projectPaycheck('2026-09-01')
    const during = projectPaycheck('2026-10-01')

    expect(before.deductions.map((d) => d.key)).toEqual(['sglv'])
    expect(during.deductions.map((d) => d.key)).toEqual(['sglv', 'meal_collection'])
    // Collected at the BAS rate, so the pair cancels.
    const bas = ENTITLEMENTS.find((e) => e.key === 'bas')!
    const meal = during.deductions.find((d) => d.key === 'meal_collection')!
    expect(meal.amount).toBe(bas.monthlyAmount / 2)
  })

  it('keeps BAS in gross rather than netting it away', () => {
    // It is still an entitlement on the LES; it is simply collected. Removing it from
    // gross would understate gross and corrupt the taxable-pay arithmetic.
    const during = projectPaycheck('2026-10-01')
    expect(during.lines.map((l) => l.key)).toContain('bas')
    expect(during.gross).toBeGreaterThan(during.net)
  })

  it('subtracts deductions from net, alongside tax', () => {
    const p = projectPaycheck('2026-10-01')
    expect(p.net).toBeCloseTo(p.gross - p.federalTax - p.fica - p.deductionsTotal, 2)
  })

  it('takes SGLI in every paycheck, deployed or not', () => {
    // Unlike the meal collection, this never switches off.
    for (const p of projectPaychecks('2026-08-15', '2027-08-01')) {
      expect(p.deductions.some((d) => d.key === 'sglv')).toBe(true)
    }
  })

  it('leaves taxable gross untouched — a collection is not a tax break', () => {
    const p = projectPaycheck('2026-10-01')
    expect(p.taxableGross).toBe(
      p.lines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0),
    )
  })
})
