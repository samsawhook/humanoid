import { describe, expect, it } from 'vitest'
import { payDatesBetween, projectPaycheck, projectPaychecks } from '@/core/money/paychecks'
import { allocate, allocateAll, summarize, type Obligation } from '@/core/money/allocation'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import { OBLIGATIONS } from '@/core/money/obligations'

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
    // FSA starts 2026-10-04, so the cheque covering 09-16..09-30 must not include it.
    expect(projectPaycheck('2026-10-01').lines.map((l) => l.key)).not.toContain('fsa')
    // The cheque covering 10-01..10-15 must.
    expect(projectPaycheck('2026-10-15').lines.map((l) => l.key)).toContain('fsa')
  })

  it('adds ODP last', () => {
    expect(projectPaycheck('2026-11-13').lines.map((l) => l.key)).not.toContain('odp')
    expect(projectPaycheck('2026-12-01').lines.map((l) => l.key)).toContain('odp')
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

  it('respects the active window', () => {
    const window: Obligation = { ...rent, key: 'w', activeFrom: '2026-10-01', activeTo: '2026-10-31' }
    expect(allocate(projectPaycheck('2026-09-15'), [window]).lines).toHaveLength(0)
    expect(allocate(projectPaycheck('2026-10-15'), [window]).lines).toHaveLength(1)
    expect(allocate(projectPaycheck('2026-11-13'), [window]).lines).toHaveLength(0)
  })
})

describe('the real plan', () => {
  const allocations = allocateAll(projectPaychecks('2026-08-15', '2027-03-01'), OBLIGATIONS)
  const summary = summarize(allocations)

  it('covers the mortgage catch-up on every payday it is due', () => {
    const during = allocations.filter(
      (a) => a.paycheck.scheduledDate >= '2026-09-01' && a.paycheck.scheduledDate <= '2026-12-15',
    )
    expect(during.length).toBeGreaterThan(0)
    for (const a of during) {
      const mortgage = a.lines.find((l) => l.key === 'mortgage_catchup')
      expect(mortgage?.allocated).toBe(1300)
      expect(mortgage?.shortfall).toBe(0)
    }
  })

  it('squeezes the lowest-priority line rather than a secured one', () => {
    for (const a of allocations.filter((x) => x.totalShortfall > 0)) {
      const shorted = a.lines.filter((l) => l.shortfall > 0)
      // Everything that gets cut is savings or unsecured — never the house or the truck.
      expect(shorted.every((l) => l.kind === 'savings' || l.kind === 'unsecured_debt')).toBe(true)
    }
  })

  it('names the first payday that cannot cover everything', () => {
    expect(summary.firstShortPayday).toBe('2026-09-15')
    expect(summary.totalShortfall).toBeGreaterThan(0)
  })

  it('starts the debt paydown and emergency fund with the deployment pay', () => {
    const early = allocations.find((a) => a.paycheck.scheduledDate === '2026-08-15')!
    expect(early.lines.map((l) => l.key)).not.toContain('debt_paydown')
    expect(TIMELINE.czteStart).toBe('2026-09-04')
  })
})
