import { describe, expect, it } from 'vitest'
import { payDatesBetween, projectPaycheck, projectPaychecks, round2 } from '@/core/money/paychecks'
import {
  allocate,
  allocateAll,
  balanceClearedOn,
  steadyMonthlySlack,
  summarize,
  type Obligation,
} from '@/core/money/allocation'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'
import {
  CAR_LOAN_BALANCE,
  LATE_PAYMENTS_BALANCE,
  MORTGAGE_ARREARS_BALANCE,
  MORTGAGE_PAYMENT,
  OBLIGATIONS,
  ONE_OFFS,
} from '@/core/money/obligations'

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

  it('never allocates more than the payday actually has in hand', () => {
    // Not "more than the paycheck" — a payday can spend last payday's leftover too.
    // What it can never do is spend money that does not exist.
    for (const a of allocateAll(projectPaychecks('2026-08-01', '2027-06-01'), OBLIGATIONS)) {
      expect(a.totalAllocated).toBeLessThanOrEqual(a.paycheck.net + a.openingBuffer + 0.001)
      expect(a.remainder).toBeGreaterThanOrEqual(0)
    }
  })

  it('carries the leftover forward instead of dropping it on the floor', () => {
    const all = allocateAll(projectPaychecks('2026-08-01', '2027-06-01'), OBLIGATIONS)
    expect(all[0]?.openingBuffer).toBe(0)
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.openingBuffer).toBe(all[i - 1]!.remainder)
    }
  })

  /**
   * The 1st carries the mortgage and the truck; the 15th carries comparatively little.
   * Allocating each payday in isolation made the 1st look insolvent while the 15th
   * handed its surplus to the arrears gauge — a fake shortfall paid for with real money.
   */
  it('does not drain the gauge past the point where a later payday comes up short', () => {
    const all = allocateAll(projectPaychecks('2026-08-01', '2027-06-01'), OBLIGATIONS)
    for (const a of all) {
      const gauge = a.lines.find((l) => l.kind === 'arrears_catchup')
      if (!gauge || gauge.allocated === 0) continue
      // Anything the gauge took was genuinely spare: no committed line went unpaid here.
      const committedShort = a.lines
        .filter((l) => l.kind !== 'arrears_catchup')
        .reduce((s, l) => s + l.shortfall, 0)
      expect(committedShort).toBe(0)
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
  const allocations = allocateAll(
    projectPaychecks('2026-08-15', '2027-08-01'),
    OBLIGATIONS,
    ONE_OFFS,
  )
  const summary = summarize(allocations)
  const cleared = balanceClearedOn(allocations, OBLIGATIONS)

  it('always pays the current mortgage in full — missing it is what creates arrears', () => {
    for (const a of allocations) {
      const line = a.lines.find((l) => l.key === 'mortgage_current')
      if (line) expect(line.shortfall).toBe(0)
    }
  })

  it('bills the car monthly, on the payday before it is actually due', () => {
    // $330 a MONTH, due on the 25th — so it is funded from the 15th cheque. Ten days
    // of margin, rather than paying it three weeks early out of the crowded 1st.
    for (const a of allocations) {
      const line = a.lines.find((l) => l.key === 'car_payoff')
      if (line) expect(a.paycheck.scheduledDate.slice(8, 10)).toBe('15')
    }
  })

  it('pays the car off to its balance and then stops billing', () => {
    expect(cleared.car_payoff?.paid).toBe(CAR_LOAN_BALANCE)
    // Six monthly payments rather than the eleven paydays a twice-monthly bill took.
    expect(cleared.car_payoff?.clearedOn).toBe('2027-01-15')

    const after = allocations.filter((a) => a.paycheck.payDate > '2027-01-15')
    expect(after.every((a) => !a.lines.some((l) => l.key === 'car_payoff'))).toBe(true)
  })

  /**
   * Nothing below the bills is owed a particular amount, so nothing below the bills can
   * report a shortfall. That is the whole point of the waterfall: the fixed monthly
   * savings targets it replaced were figures I invented, and their permanent "unmet ask"
   * made a solvent plan read like a crisis while telling nobody anything.
   */
  it('covers every bill except the deliberate 15 August stretch', () => {
    // One gap, and it is intentional: a FULL $1,300 arrears payment goes on the first
    // cheque, which frees about $510 on its own. The rest is a real unpaid bill and is
    // reported as one rather than hidden — closing it is the back pay's first job.
    expect(summary.bindingShortPaydays).toEqual(['2026-08-14'])
    expect(summary.bindingShortfall).toBeCloseTo(790.48, 2)

    const gap = allocations
      .find((a) => a.paycheck.payDate === '2026-08-14')!
      .lines.find((l) => l.key === 'arrears_first_payment')!
    expect(gap.requested).toBe(MORTGAGE_PAYMENT)
    expect(gap.shortfall).toBeCloseTo(summary.bindingShortfall, 2)
  })

  /**
   * You asked for this three times and I kept re-deciding it. It is a fixed bill on a
   * fixed date now — not a sweep, not a partial, not contingent on the back pay
   * arriving. This test exists so it cannot quietly become any of those again.
   */
  it('sends ONE FULL mortgage payment on the 15 August cheque', () => {
    const first = allocations.find((a) => a.paycheck.scheduledDate === '2026-08-15')!
    const line = first.lines.find((l) => l.key === 'arrears_first_payment')!
    expect(line.requested).toBe(MORTGAGE_PAYMENT)
    expect(line.capGroup).toBe('mortgage_arrears')
    expect(line.swept).toBeUndefined()

    // One transfer that day, not a payment plus a chaser.
    expect(first.lines.filter((l) => (l.capGroup ?? l.key) === 'mortgage_arrears')).toHaveLength(1)
    // And it fires exactly once.
    expect(
      allocations.filter((a) => a.lines.some((l) => l.key === 'arrears_first_payment')),
    ).toHaveLength(1)
  })

  /**
   * Regression. A card is attacked from two directions — the minimum you must pay and
   * whatever the sweep adds — and both reduce the same balance. `paidSoFar` only
   * advances between paydays, so within one payday both lines read the same stale
   * figure and together overshot the cap by $62.63. A balance cannot be overpaid.
   */
  it('never pays more than a shared balance actually holds', () => {
    for (const key of ['open_cards', 'closed_cards']) {
      const pool = cleared[key]
      if (!pool) continue
      expect(pool.paid).toBeLessThanOrEqual(pool.cap + 0.005)
    }
    // Avant is the case that broke this: a $250.02 past-due line and a $210/mo
    // instalment share one $4,928.97 balance, each capping itself at what IT may pay.
    // Reading the pool size off the first contributor reported $2,770 against $250.
    expect(cleared.avant?.cap).toBeCloseTo(4928.97, 2)
    expect(cleared.avant!.paid).toBeLessThanOrEqual(cleared.avant!.cap)
  })

  it('pays a card minimum as a bill and the sweep as acceleration, onto one balance', () => {
    // Both lines exist, both are unsecured debt, and only one of them is discretionary.
    const withBoth = allocations.find(
      (a) =>
        a.lines.some((l) => l.key === 'card_minimums_open' && l.allocated > 0) &&
        a.lines.some((l) => l.key === 'debt_paydown_open' && l.allocated > 0),
    )
    expect(withBoth).toBeDefined()
    const min = withBoth!.lines.find((l) => l.key === 'card_minimums_open')!
    const sweep = withBoth!.lines.find((l) => l.key === 'debt_paydown_open')!
    expect(min.capGroup).toBe('open_cards')
    expect(sweep.capGroup).toBe('open_cards')
    // The minimum is a bill: it cannot be squeezed by the forward reserve.
    expect(min.swept).toBeUndefined()
    expect(sweep.swept).toBe(true)
  })

  it('reports no phantom shortfall below the bills', () => {
    expect(summary.targetShortfall).toBe(0)
    for (const a of allocations) {
      for (const l of a.lines.filter((x) => x.swept)) {
        expect(l.shortfall).toBe(0)
      }
    }
    // Every shortfall left is a genuine bill going unpaid.
    expect(summary.totalShortfall).toBe(summary.bindingShortfall)
  })

  /**
   * Regression. The forward reserve once throttled only the gauge, leaving the savings
   * targets free to drain the buffer, so ranking the arrears above them changed nothing
   * at all — the plan looked like it was answering a question it was quietly ignoring.
   */
  it('lets the order between the waterfall lines actually decide who gets the slack', () => {
    const pays = projectPaychecks('2026-08-15', '2027-08-01')
    // Demote the arrears from the top of the waterfall to the bottom of it.
    const arrearsLast = OBLIGATIONS.map((o) =>
      o.key === 'mortgage_arrears' ? { ...o, priority: 80 } : o,
    )
    const demoted = balanceClearedOn(allocateAll(pays, arrearsLast), arrearsLast)

    expect(cleared.mortgage_arrears?.clearedOn).not.toBe(null)
    expect(demoted.mortgage_arrears?.clearedOn).toBe(null)
    expect(demoted.mortgage_arrears?.paid).toBeLessThan(cleared.mortgage_arrears?.paid ?? 0)
  })

  it('measures the pot the waterfall competes for, excluding the waterfall itself', () => {
    const slack = steadyMonthlySlack(allocations)
    // The exact figure moves with every upstream correction; what must hold is that it
    // is real, positive, and far smaller than the balances queued behind it.
    expect(slack).toBeGreaterThan(0)
    expect(slack).toBeLessThan(MORTGAGE_ARREARS_BALANCE)
  })

  /**
   * Each line takes everything until its balance is cleared, then vanishes and hands the
   * whole flow to the next. The clearance dates are measurements, not targets: they fall
   * out of the plan and move whenever anything upstream does.
   */
  it('runs the waterfall one balance at a time, in the order chosen', () => {
    expect(cleared.mortgage_arrears?.paid).toBe(MORTGAGE_ARREARS_BALANCE)
    // Later than it was: $211/mo of estimated card minimums now comes off the top as a
    // bill, and the gauge is what absorbs anything added above it.
    expect(cleared.mortgage_arrears?.clearedOn).toBe('2027-05-14')

    // The open cards no longer clear inside the deployment at all. Avant's $210/mo
    // takes about a third of the slack, and the arrears are ahead of them in the queue.
    expect(cleared.open_cards?.clearedOn).toBe(null)
    expect(cleared.open_cards!.paid).toBeGreaterThan(0)

    // And the reserve only starts once those are gone. It does not finish before you
    // come home, which is information about the horizon rather than about the target.
    // The reserve is not reached at all now — an honest statement about the horizon.
    expect(cleared.emergency_fund?.clearedOn).toBe(null)
    expect(cleared.emergency_fund?.paid).toBe(0)

    // The closed balances are never reached BY THE SWEEP inside the deployment — but
    // they are not untouched, because their minimums are bills and run from day one.
    expect(cleared.closed_cards?.clearedOn).toBe(null)
    expect(cleared.closed_cards?.paid).toBeGreaterThan(0)
    for (const a of allocations) {
      expect(a.lines.find((l) => l.key === 'debt_paydown_closed')?.allocated ?? 0).toBe(0)
    }
  })

  it('pays a full mortgage payment as a bill on every 1st', () => {
    for (const a of allocations.filter((x) => x.paycheck.scheduledDate.endsWith('-01'))) {
      const line = a.lines.find((l) => l.key === 'mortgage_current')!
      expect(line.allocated).toBe(MORTGAGE_PAYMENT)
      expect(line.shortfall).toBe(0)
    }
  })

  it('counts the one-off payment against the arrears balance, not on top of it', () => {
    const paid = allocations.reduce(
      (t, a) =>
        t +
        a.lines
          .filter((l) => (l.capGroup ?? l.key) === 'mortgage_arrears')
          .reduce((u, l) => u + l.allocated, 0),
      0,
    )
    expect(paid).toBeCloseTo(MORTGAGE_ARREARS_BALANCE, 2)
    expect(cleared.mortgage_arrears?.paid).toBeCloseTo(MORTGAGE_ARREARS_BALANCE, 2)
  })

  it('keeps the arrears ahead of everything else in the waterfall until they are cured', () => {
    let running = 0
    for (const a of allocations) {
      running += a.lines
        .filter((l) => (l.capGroup ?? l.key) === 'mortgage_arrears')
        .reduce((t, l) => t + l.allocated, 0)
      if (running >= MORTGAGE_ARREARS_BALANCE - 0.005) break
      // Still behind on the house, so nothing below it took anything.
      for (const key of ['late_payments', 'debt_paydown_open', 'debt_paydown_closed']) {
        expect(a.lines.find((l) => l.key === key)?.allocated ?? 0).toBe(0)
      }
    }
  })

  it('never lets a waterfall line start before the one above it has cleared', () => {
    // Line key -> the balance pool it draws down. They differ wherever a minimum
    // payment and a sweep share one balance.
    const ORDER: { line: string; pool: string }[] = [
      { line: 'mortgage_arrears', pool: 'mortgage_arrears' },
      { line: 'debt_paydown_open', pool: 'open_cards' },
      { line: 'emergency_fund', pool: 'emergency_fund' },
      { line: 'debt_paydown_closed', pool: 'closed_cards' },
    ]
    for (let i = 1; i < ORDER.length; i++) {
      const above = cleared[ORDER[i - 1]!.pool]
      for (const a of allocations) {
        const line = a.lines.find((l) => l.key === ORDER[i]!.line)
        if (!line || line.allocated === 0) continue
        // Something reached line i on this payday, so line i-1 must be settled.
        expect(above!.paid).toBeGreaterThanOrEqual(above!.cap - 0.005)
      }
    }
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
