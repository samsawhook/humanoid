import { TIMELINE } from '@/core/money/rates'
import { describe, expect, it } from 'vitest'
import {
  runPlan,
  moveImpacts,
  allMoves,
  stressTest,
  monthlyComposition,
  trajectory,
  openingDebt,
  BUCKETS,
} from '@/core/money/briefing'
import { allocateAll } from '@/core/money/allocation'
import { projectPaychecks } from '@/core/money/paychecks'
import { OBLIGATIONS, EMERGENCIES, PLAN_START, CHRISTMAS_BUDGET, type ONE_OFFS } from '@/core/money/obligations'

const base = runPlan()

/**
 * The one known gap (19 Nov, your call: keep everything and show it). The late October
 * T-Mobile bill and November's roaming came out of the 15 Nov cheque, so less carries
 * forward and the 15 Dec cheque covers only part of Christmas. Everything else is paid.
 */
const XMAS_GAP = 208.34
const unpaidBesidesChristmas = (o: ReturnType<typeof runPlan>) =>
  o.allocations.reduce((t, a) => t + a.lines.filter((l) => l.key !== 'christmas').reduce((s, l) => s + l.shortfall, 0), 0)

describe('the briefing', () => {
  it('pays every bill but part of Christmas, with the assumed emergency', () => {
    // One in the plan (June); February's moved to the stress test on 18 Nov.
    expect(EMERGENCIES).toHaveLength(1)
    expect(base.billsUnpaid).toBeCloseTo(XMAS_GAP, 2)
    expect(unpaidBesidesChristmas(base)).toBe(0)
  })

  it('pays an emergency from the fund first, and the fund refills', () => {
    const draws = base.allocations.flatMap((a) => a.draws ?? [])
    // With Christmas in December the buffer is not funded until March, so February's
    // emergency finds it empty and lands on checking; June's is paid from the fund.
    expect(draws.length).toBeGreaterThanOrEqual(1)
    for (const d of draws) expect(d.group).toBe('emergency_fund')
    // Home in June: the June emergency lands days before the last payday, so the fund
    // has no time to refill — but the cash is there, in checking.
    // With the $75/mo international pass (18 Nov) it comes home short of the full $1,000.
    // With the phone pass, the MAcc course and GEICO from Nov, it comes home well short of $1,000.
    expect(base.emergencyFund + base.checking).toBeGreaterThanOrEqual(50)
  })

  it('lands only the uncovered part of an emergency on checking', () => {
    // April: after the open cards, so the $1,000 buffer is full. A $1,500 shock takes
    // the whole buffer and only $500 lands on checking.
    const run = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, [
      { key: 'e', label: 'e', date: '2027-04-20', amount: -1500, drawsFrom: 'emergency_fund' },
    ])
    const landed = run.find((a) => a.oneOffs?.some((o) => o.key === 'e'))!
    const covered = (landed.draws ?? []).reduce((s, d) => s + d.amount, 0)
    // Whatever the buffer holds pays first — never more than the shock, never more than
    // the $1,000 it can hold — and only the rest lands on checking.
    expect(covered).toBeGreaterThan(0)
    expect(covered).toBeLessThanOrEqual(1000)
    const before = run[run.indexOf(landed) - 1]!
    expect(landed.openingBuffer).toBeCloseTo(before.remainder - (1500 - covered), 2)
  })

  it('reduces debt from today to homecoming', () => {
    expect(base.debtLeft).toBeLessThan(openingDebt())
    const t = trajectory(base)
    expect(t[t.length - 1]!.debt).toBeCloseTo(base.debtLeft, 0)
  })

  it('splits every month into the six buckets plus what was held — nothing lost', () => {
    for (const m of monthlyComposition(base.allocations)) {
      const spent = BUCKETS.reduce((s, b) => s + m.byBucket[b.key], 0)
      expect(spent + m.carried).toBeCloseTo(m.net, 1)
    }
    // Grouped by scheduled payday, so no month has three paydays.
    for (const m of monthlyComposition(base.allocations)) {
      expect(m.net).toBeLessThanOrEqual(base.allocations[1]!.paycheck.net * 2 + 0.01)
    }
  })
})

describe('moves', () => {
  const impacts = moveImpacts(base)

  it('scores every move by re-running the plan, best first', () => {
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i - 1]!.delta).toBeGreaterThanOrEqual(impacts[i]!.delta)
    }
    for (const i of impacts) {
      expect(i.delta).toBeGreaterThan(0)
      expect(unpaidBesidesChristmas(i.outcome)).toBe(0)
    }
  })

  it('never suggests pausing Nth — your call, 2026-11-13', () => {
    expect(impacts.some((i) => i.move.key === 'nth_to_sdp')).toBe(false)
    expect(impacts.every((i) => i.outcome.allocations.some((a) => a.lines.some((l) => l.key === 'nth_investments')))).toBe(true)
  })

  it('values all moves together by re-running, not by adding', () => {
    const together = allMoves()
    expect(together.netPosition).toBeGreaterThan(base.netPosition)
    expect(together.sdpDeposited).toBeGreaterThanOrEqual(base.sdpDeposited)
  })
})

describe('stress test', () => {
  const runs = stressTest()
  const by = (k: string) => runs.find((r) => r.case.key === k)!

  it('gets worse as more goes wrong', () => {
    expect(by('none').outcome.comingHomeCash).toBeGreaterThan(by('base').outcome.comingHomeCash)
    expect(by('base').outcome.comingHomeCash).toBeGreaterThan(by('three').outcome.comingHomeCash)
  })

  it('treats the base case as the plan itself', () => {
    expect(by('base').outcome.netPosition).toBeCloseTo(base.netPosition, 2)
  })

  /**
   * The finding the page calls out. Since the nanny rose to $2,400/mo (2026-11-13) the
   * plan absorbs the two assumed emergencies and no more: a third, or one during the
   * catch-up, leaves real bills unpaid.
   */
  it('shows the plan absorbs two emergencies, and a third costs real bills', () => {
    expect(by('base').outcome.billsUnpaid).toBeCloseTo(XMAS_GAP, 2)
    expect(by('early').outcome.billsUnpaid).toBeGreaterThan(0)
    expect(by('three').outcome.billsUnpaid).toBeGreaterThan(0)
  })
})

// Type-only import guard: ONE_OFFS stays exported for the page.
export type _OneOffs = typeof ONE_OFFS

describe('Christmas', () => {
  it('is paid in full on the 15 December cheque, and nothing owed goes unpaid', () => {
    // Moved from 1 Dec so the 1 Dec cheque can make the federal student loan current.
    const base = runPlan()
    const dec = base.allocations.find((a) => a.paycheck.scheduledDate === '2026-12-15')!
    const xmas = dec.lines.find((l) => l.key === 'christmas')!
    // Short by the known gap until something is cut (see XMAS_GAP).
    expect(xmas.allocated).toBeCloseTo(CHRISTMAS_BUDGET - XMAS_GAP, 2)
    expect(base.allocations.filter((a) => a.lines.some((l) => l.key === 'christmas'))).toHaveLength(1)
    expect(unpaidBesidesChristmas(base)).toBe(0)
  })
})

describe('the boat', () => {
  const base = runPlan()
  it('is capped at what is left — $3,000 all in, less the $750 already paid', () => {
    const boat = OBLIGATIONS.find((o) => o.key === 'boat')!
    expect(boat.balanceCap).toBe(2250)
    expect(base.boatFunded).toBeLessThanOrEqual(2250)
  })

  it('waits until the catch-up is over', () => {
    for (const a of base.allocations) {
      if (a.paycheck.scheduledDate <= '2027-01-15') {
        expect(a.lines.find((l) => l.key === 'boat')?.allocated ?? 0).toBe(0)
      }
    }
  })

  it('gets nothing at plan, and no less with the savings taken', () => {
    // Since the $75/mo international pass (18 Nov), even all the moves together stop
    // short of the boat: they go to the buffer and the cards first.
    expect(allMoves().boatFunded).toBeGreaterThanOrEqual(base.boatFunded)
  })
})

describe('the student loan deferment', () => {
  it('is assumed in the plan (pending Nelnet): no student-loan payment while deployed', () => {
    const base = runPlan()
    const paid = base.allocations.reduce(
      (t, a) => t + (a.lines.find((l) => l.key === 'student_loan_payment')?.allocated ?? 0),
      0,
    )
    expect(paid).toBe(0)
    expect(unpaidBesidesChristmas(base)).toBe(0)
  })
})
