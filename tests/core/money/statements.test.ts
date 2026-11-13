import { describe, expect, it } from 'vitest'
import {
  CHECKING_DAILY,
  DFAS_PAYCHECKS,
  overdraftDips,
  availableDaily,
  observedFirstShare,
  STATEMENT_FINDINGS,
} from '@/core/money/statements'
import { FIRST_OF_MONTH_SHARE } from '@/core/money/rates'
import { MORTGAGE_PAYMENT, OBLIGATIONS } from '@/core/money/obligations'
import { projectPaycheck } from '@/core/money/paychecks'
import { MOVES, runPlan, moveImpacts } from '@/core/money/briefing'

describe('the checking statements', () => {
  it('are in date order with no duplicates', () => {
    for (let i = 1; i < CHECKING_DAILY.length; i++) {
      expect(CHECKING_DAILY[i]!.date > CHECKING_DAILY[i - 1]!.date).toBe(true)
    }
  })

  it('end each statement on the printed closing balance', () => {
    const at = (d: string) => CHECKING_DAILY.filter((x) => x.date <= d).at(-1)!.balance
    expect(at('2026-08-07')).toBe(2.2)
    expect(at('2026-09-08')).toBe(0.85)
    expect(at('2026-10-07')).toBe(982.88)
    expect(at('2026-11-06')).toBe(246.45)
  })

  it('find every dip below zero, and the worst one', () => {
    const dips = overdraftDips()
    const deployed = dips.filter((d) => d.start >= '2026-08-08')
    // Late August's run (27th–31st) is one dip across consecutive printed days.
    expect(deployed).toHaveLength(8)
    const worst = dips.reduce((w, d) => (d.low < w.low ? d : w))
    expect(worst.low).toBe(-2715.61)
    expect(worst.lowOn).toBe('2026-09-30')
  })

  it('show every dip ends on or right after a paycheck', () => {
    // The finding: timing, not money. Every dip ends within a day of a DFAS deposit.
    const pays = ['2026-07-23', '2026-07-31', '2026-08-14', '2026-08-19', ...DFAS_PAYCHECKS.map((p) => p.date), '2026-09-25']
    for (const d of overdraftDips().filter((x) => x.start >= '2026-08-08')) {
      const recovery = CHECKING_DAILY.find((x) => x.date > d.end && x.balance >= 0)!.date
      expect(pays.some((p) => p === recovery)).toBe(true)
    }
  })
})

describe('calibration against the statements', () => {
  it('uses the observed mortgage payment', () => {
    expect(MORTGAGE_PAYMENT).toBe(STATEMENT_FINDINGS.mortgagePayment)
  })

  it('pays more on the 1st than the 15th, as DFAS does, without changing the month', () => {
    expect(FIRST_OF_MONTH_SHARE).toBeCloseTo(observedFirstShare(), 2)
    const first = projectPaycheck('2026-12-01')
    const mid = projectPaycheck('2026-12-15')
    expect(first.net).toBeGreaterThan(mid.net)
    expect(first.splitAdjustment + mid.splitAdjustment).toBeCloseTo(0, 2)
  })

  it('carries the $30 wire fee on Nth, and prices switching to ACH', () => {
    const nth = OBLIGATIONS.find((o) => o.key === 'nth_investments')!
    expect(nth.amountPerPaycheck).toBe(500 + STATEMENT_FINDINGS.wireFee)
    expect(MOVES.some((m) => m.key === 'wire_to_ach')).toBe(true)
    const ach = moveImpacts(runPlan()).find((i) => i.move.key === 'wire_to_ach')!
    expect(ach.delta).toBeGreaterThan(200)
  })

  it('bills Avant from the 15th, matching its ~20th draft date', () => {
    expect(OBLIGATIONS.find((o) => o.key === 'avant_payment')!.payDays).toBe('fifteenth')
  })
})

describe('early pay — what was actually spendable', () => {
  it('releases each DFAS deposit two business days before it posts', () => {
    const a = availableDaily()
    // Fri 11 Sep prints −$999.15; the Tue 15 Sep deposit ($3,326.25) was already spendable.
    expect(a.find((d) => d.date === '2026-09-11')!.balance).toBeCloseTo(-999.15 + 3326.25, 2)
    // Tue 29 Sep prints −$988.04; the Thu 1 Oct deposit ($3,957.59) was already spendable.
    expect(a.find((d) => d.date === '2026-09-29')!.balance).toBeCloseTo(-988.04 + 3957.59, 2)
  })

  it('shows checking never actually went below zero once deployed pay settled (September on)', () => {
    // The one late-August dip (−$8.17, 27 Aug) is a real $15 Avant return fee, pre-deployment.
    const real = overdraftDips(availableDaily()).filter((d) => d.start >= '2026-09-01')
    expect(real).toHaveLength(0)
  })

  it('leaves the small genuine July/August dips on the record', () => {
    const real = overdraftDips(availableDaily())
    expect(real.length).toBeGreaterThan(0)
    for (const d of real) expect(d.low).toBeGreaterThan(-50)
  })
})
