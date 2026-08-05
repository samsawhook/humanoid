import { describe, expect, it } from 'vitest'
import { windfallPlan, windfallSensitivity, type WindfallClaim } from '@/core/money/windfall'
import { BACK_PAY_CLAIMS, LATE_PAYMENTS_BALANCE } from '@/core/money/obligations'
import { backPay, EXPECTED_BACK_PAY } from '@/core/money/drillPay'

const claims: WindfallClaim[] = [
  { key: 'a', label: 'A', cap: 100, because: 'first' },
  { key: 'b', label: 'B', cap: 200, because: 'second' },
]

describe('windfall plan', () => {
  it('fills claims in order and names what it could not reach', () => {
    const plan = windfallPlan(150, claims)
    expect(plan.lines.map((l) => [l.key, l.amount])).toEqual([
      ['a', 100],
      ['b', 50],
    ])
    expect(plan.lines[1]!.partial).toBe(true)
    expect(plan.lines[1]!.remaining).toBe(150)
    expect(plan.surplus).toBe(0)
  })

  it('reports a claim that got nothing rather than dropping it', () => {
    // "What this does not cover" is the more useful half of the answer.
    const plan = windfallPlan(60, claims)
    expect(plan.lines.map((l) => l.key)).toEqual(['a'])
    expect(plan.unfunded.map((c) => c.key)).toEqual(['b'])
  })

  it('surfaces a surplus rather than silently absorbing it', () => {
    const plan = windfallPlan(500, claims)
    expect(plan.surplus).toBe(200)
    expect(plan.lines.every((l) => !l.partial)).toBe(true)
  })

  it('never allocates more than arrived', () => {
    for (const amount of [0, 1, 99.99, 300, 12_345]) {
      const plan = windfallPlan(amount, claims)
      const spent = plan.lines.reduce((s, l) => s + l.amount, 0)
      expect(spent + plan.surplus).toBeCloseTo(amount, 2)
    }
  })

  it('treats a negative or absent amount as nothing, not as a debt', () => {
    const plan = windfallPlan(-50, claims)
    expect(plan.lines).toHaveLength(0)
    expect(plan.unfunded).toHaveLength(2)
  })
})

describe('what the back pay buys', () => {
  /**
   * The order is the decision, and it does not change with the amount — only how far
   * down the list you get. That is the whole reason the plan is expressed as claims
   * rather than as a schedule.
   */
  it('keeps the same order across every plausible amount', () => {
    const low = backPay(EXPECTED_BACK_PAY).net
    const high = backPay({ ...EXPECTED_BACK_PAY, basis: 'idt_two_mutas' }).net
    const runs = windfallSensitivity([800, low, high], BACK_PAY_CLAIMS)

    for (const { plan } of runs) {
      expect(plan.lines[0]?.key).toBe('august_mortgage_topup')
    }
    // More money reaches further down the list, never re-orders it.
    const funded = runs.map((r) => r.plan.lines.length)
    expect(funded).toEqual([...funded].sort((a, b) => a - b))
  })

  it('completes the August mortgage payment before anything else, at every amount', () => {
    for (const amount of [800, 1000, 1353.98, 1698.42, 5000]) {
      const plan = windfallPlan(amount, BACK_PAY_CLAIMS)
      const topup = plan.lines.find((l) => l.key === 'august_mortgage_topup')!
      expect(topup.amount).toBe(790)
    }
  })

  it('leaves the car alone, because the 14 August cheque already paid it', () => {
    // The obvious candidate, and the wrong one: putting an already-funded bill on this
    // list would pay it twice and push something genuinely exposed further down.
    expect(BACK_PAY_CLAIMS.map((c) => c.key)).not.toContain('car_payoff')
    expect(BACK_PAY_CLAIMS.map((c) => c.label).join(' ')).not.toMatch(/auto|car/i)
  })

  it('does not pretend the tolls are fully covered', () => {
    // At the expected amount they are not, and the plan says how much is left.
    const plan = windfallPlan(backPay(EXPECTED_BACK_PAY).net, BACK_PAY_CLAIMS)
    const tolls = plan.lines.find((l) => l.key === 'tolls')!
    expect(tolls.partial).toBe(true)
    expect(tolls.remaining).toBeGreaterThan(0)
    expect(tolls.cap).toBe(LATE_PAYMENTS_BALANCE)
  })

  it('states a reason for every claim, since the order is the argument', () => {
    for (const c of BACK_PAY_CLAIMS) expect(c.because.length).toBeGreaterThan(20)
  })
})
