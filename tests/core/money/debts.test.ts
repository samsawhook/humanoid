import { describe, expect, it } from 'vitest'
import {
  DEBTS,
  activeDebts,
  openDebts,
  deprioritisedDebts,
  simulatePaydown,
  totalBalance,
} from '@/core/money/debts'

describe('debt posture', () => {
  it('separates sued-and-dismissed accounts from payable ones', () => {
    expect(deprioritisedDebts().map((d) => d.key).sort()).toEqual(['goldman', 'psecu'])
    expect(activeDebts().every((d) => d.posture !== 'sued_dismissed')).toBe(true)
  })

  it('ranks every OPEN account above every closed one', () => {
    // Closed accounts have no credit line, so paying them does nothing for utilisation.
    // They are still payable — no limitations trap — just never first.
    const closed = DEBTS.filter((d) => d.posture === 'closed')
    expect(closed.map((d) => d.key).sort()).toEqual(['capital_one', 'chase', 'citi'])
    for (const open of openDebts()) {
      for (const c of closed) expect(open.priority).toBeLessThan(c.priority)
    }
  })

  it('holds only $2,221 of open revolving debt', () => {
    expect(totalBalance(openDebts())).toBeCloseTo(2220.89, 2)
    expect(openDebts().map((d) => d.key)).toEqual(['platinum', 'brightway', 'credit_one'])
  })

  it('puts the deprioritised accounts behind every live one', () => {
    const worstActive = Math.max(...activeDebts().map((d) => d.priority))
    const bestDeprioritised = Math.min(...deprioritisedDebts().map((d) => d.priority))
    expect(bestDeprioritised).toBeGreaterThan(worstActive)
  })

  it('holds far more balance in the deprioritised accounts than the live ones', () => {
    // $33,652 parked vs $14,777 being worked — which is exactly why the distinction
    // matters. A naive avalanche would send everything at Goldman.
    expect(totalBalance(deprioritisedDebts())).toBeGreaterThan(totalBalance(activeDebts()))
  })

  it('warns about restarting the limitations clock on both dismissed accounts', () => {
    for (const debt of deprioritisedDebts()) {
      expect(debt.note.toLowerCase()).toMatch(/payment|clock|limitations/)
    }
  })
})

describe('paydown simulation', () => {
  it('never touches a deprioritised account, however much money there is', () => {
    const result = simulatePaydown(5000, 24)
    for (const step of result.steps) {
      expect(step.debt.posture).not.toBe('sued_dismissed')
    }
    const touchedKeys = result.steps.map((s) => s.debt.key)
    expect(touchedKeys).not.toContain('goldman')
    expect(touchedKeys).not.toContain('psecu')
  })

  it('clears live accounts in priority order', () => {
    const result = simulatePaydown(500, 24)
    const cleared = result.steps
      .filter((s) => s.clearedAfterPayments !== null)
      .sort((a, b) => a.clearedAfterPayments! - b.clearedAfterPayments!)
    for (let i = 1; i < cleared.length; i++) {
      expect(cleared[i]!.debt.priority).toBeGreaterThan(cleared[i - 1]!.debt.priority)
    }
  })

  /**
   * $500 a payday over 24 paydays is $12,000 against $14,777 of live balances, so the
   * deployment does NOT clear them all. Chase and Capital One go; Citi is part-paid and
   * three small accounts are untouched. Recording it rather than asserting the
   * comfortable version.
   */
  it('clears all open revolving debt within five paydays', () => {
    // Only $2,221 of it exists, so the utilisation fix is fast and cheap — the most
    // useful thing the closed-account reclassification surfaced.
    const result = simulatePaydown(500, 24)
    const openCleared = result.steps.filter(
      (s) => s.debt.posture === 'active' && s.clearedAfterPayments !== null,
    )
    expect(openCleared).toHaveLength(openDebts().length)
    expect(Math.max(...openCleared.map((s) => s.clearedAfterPayments!))).toBeLessThanOrEqual(5)
  })

  it('then works the closed balances smallest first, and does not finish Chase', () => {
    const result = simulatePaydown(500, 24)
    expect(result.totalPaid).toBe(12000)

    const cleared = result.steps
      .filter((s) => s.clearedAfterPayments !== null)
      .map((s) => s.debt.key)
    expect(cleared).toEqual(['platinum', 'brightway', 'credit_one', 'citi', 'capital_one'])

    const chase = result.steps.find((s) => s.debt.key === 'chase')!
    expect(chase.paid).toBeCloseTo(4513.11, 2)
    expect(result.allClearedAfter).toBeNull()
  })

  it('would clear everything including Chase at $620 a payday', () => {
    expect(simulatePaydown(620, 24).allClearedAfter).not.toBeNull()
  })

  it('never pays more than a balance', () => {
    const result = simulatePaydown(99_999, 24)
    for (const step of result.steps) {
      expect(step.paid).toBeCloseTo(step.debt.balance, 2)
      expect(step.remaining).toBe(0)
    }
  })

  it('pays nothing when there is nothing to pay with', () => {
    const result = simulatePaydown(0, 24)
    expect(result.totalPaid).toBe(0)
    expect(result.allClearedAfter).toBeNull()
  })
})
