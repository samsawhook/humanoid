import { describe, expect, it } from 'vitest'
import { projectSdp, SDP_CAP, SDP_RATE, SDP_ACCRUAL_TAIL_DAYS, SDP_LAST_DEPOSIT } from '@/core/money/sdp'
import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, balanceClearedOn } from '@/core/money/allocation'
import { OBLIGATIONS, PLAN_START } from '@/core/money/obligations'
import { addLocalDays } from '@/core/time/localDay'

describe('Savings Deposit Program', () => {
  it('pays 10% a year, compounded quarterly', () => {
    // One full year from deposit to the end of accrual: (1.025)^4 - 1 ≈ 10.38%.
    const departure = addLocalDays('2027-01-01', 365 - SDP_ACCRUAL_TAIL_DAYS)
    const p = projectSdp([{ date: '2027-01-01', amount: 1000 }], departure)
    expect(SDP_RATE).toBe(0.1)
    expect(p.interest).toBeCloseTo(1000 * (Math.pow(1.025, 365 / 91.25) - 1), 2)
    expect(p.interest).toBeGreaterThan(103)
    expect(p.interest).toBeLessThan(104)
  })

  it('keeps accruing for 90 days after you leave, then stops', () => {
    const p = projectSdp([{ date: '2027-01-01', amount: 1000 }], '2027-06-01')
    expect(p.accrualEnds).toBe(addLocalDays('2027-06-01', 90))
  })

  it('earns nothing on a deposit that never happened', () => {
    expect(projectSdp([]).payout).toBe(0)
    expect(projectSdp([{ date: '2027-01-01', amount: 0 }]).interest).toBe(0)
  })

  describe('in the live plan', () => {
    const allocations = allocateAll(projectPaychecks(PLAN_START, '2027-08-01'), OBLIGATIONS)
    const deposits = allocations.flatMap((a) =>
      a.lines
        .filter((l) => l.key === 'sdp' && l.allocated > 0)
        .map((l) => ({ date: a.paycheck.payDate, amount: l.allocated })),
    )

    it('never deposits more than the $10,000 cap', () => {
      expect(balanceClearedOn(allocations, OBLIGATIONS).sdp!.paid).toBeLessThanOrEqual(SDP_CAP)
    })

    it('only deposits while you are in theatre', () => {
      for (const d of deposits) expect(d.date <= SDP_LAST_DEPOSIT).toBe(true)
    })

    /**
     * The window argument, as a test: the SDP comes before the rest of the emergency
     * fund and the closed cards, because those can be done after you are home and this
     * cannot. Nothing below it takes a dollar while it is still open and unfilled.
     */
    it('fills before anything that could wait until you are home', () => {
      for (const a of allocations) {
        const later = a.lines
          .filter((l) => ['emergency_fund', 'debt_paydown_closed', 'future_fund'].includes(l.key))
          .reduce((t, l) => t + l.allocated, 0)
        expect(later).toBe(0)
      }
      expect(deposits.length).toBeGreaterThan(0)
    })

    it('comes back with interest, as the cash for coming home', () => {
      const p = projectSdp(deposits)
      expect(p.payout).toBeGreaterThan(p.deposited)
      // Small at plan now — the boat is ahead of it — but never zero, and it earns.
      expect(p.deposited).toBeGreaterThan(0)
    })
  })
})
