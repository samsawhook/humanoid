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
import { OBLIGATIONS, EMERGENCIES, PLAN_START, type ONE_OFFS } from '@/core/money/obligations'

const base = runPlan()

describe('the briefing', () => {
  it('pays every bill even with the two assumed emergencies', () => {
    expect(EMERGENCIES).toHaveLength(2)
    expect(base.billsUnpaid).toBe(0)
  })

  it('pays an emergency from the fund first, and the fund refills', () => {
    const draws = base.allocations.flatMap((a) => a.draws ?? [])
    // With Christmas in December the buffer is not funded until March, so February's
    // emergency finds it empty and lands on checking; June's is paid from the fund.
    expect(draws.length).toBeGreaterThanOrEqual(1)
    for (const d of draws) expect(d.group).toBe('emergency_fund')
    // Back at the $1,000 buffer by the end, after both draws.
    expect(base.emergencyFund).toBe(1000)
  })

  it('lands only the uncovered part of an emergency on checking', () => {
    // April: after the open cards, so the $1,000 buffer is full. A $1,500 shock takes
    // the whole buffer and only $500 lands on checking.
    const run = allocateAll(projectPaychecks(PLAN_START, '2027-08-01'), OBLIGATIONS, [
      { key: 'e', label: 'e', date: '2027-04-20', amount: -1500, drawsFrom: 'emergency_fund' },
    ])
    const landed = run.find((a) => a.oneOffs?.some((o) => o.key === 'e'))!
    const covered = (landed.draws ?? []).reduce((s, d) => s + d.amount, 0)
    expect(covered).toBe(1000)
    const before = run[run.indexOf(landed) - 1]!
    expect(landed.openingBuffer).toBeCloseTo(before.remainder - 500, 2)
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
      expect(i.outcome.billsUnpaid).toBe(0)
    }
  })

  it('counts Nth as yours either way — pausing it gains the SDP interest and the wire fees', () => {
    const nth = impacts.find((i) => i.move.key === 'nth_to_sdp')!
    const wires = base.allocations.filter((a) => a.lines.some((l) => l.key === 'nth_investments')).length
    expect(nth.delta).toBeCloseTo(nth.outcome.sdpInterest - base.sdpInterest + wires * 30, 0)
  })

  it('values all moves together by re-running, not by adding', () => {
    const together = allMoves()
    expect(together.netPosition).toBeGreaterThan(base.netPosition)
    expect(together.sdpDeposited).toBeGreaterThan(base.sdpDeposited)
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

  /** The finding the page calls out: the catch-up months have no room for a shock. */
  it('shows an emergency during the catch-up costs real bills', () => {
    expect(by('early').outcome.billsUnpaid).toBeGreaterThan(0)
    expect(by('three').outcome.billsUnpaid).toBe(0)
  })
})

// Type-only import guard: ONE_OFFS stays exported for the page.
export type _OneOffs = typeof ONE_OFFS

describe('Christmas', () => {
  it('is paid in full on the 1 December cheque, and nothing owed goes unpaid', () => {
    const base = runPlan()
    const dec = base.allocations.find((a) => a.paycheck.scheduledDate === '2026-12-01')!
    const xmas = dec.lines.find((l) => l.key === 'christmas')!
    expect(xmas.allocated).toBe(500)
    expect(base.allocations.filter((a) => a.lines.some((l) => l.key === 'christmas'))).toHaveLength(1)
    expect(base.billsUnpaid).toBe(0)
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

  it('finishes before homecoming if the easy savings are taken', () => {
    const extras = moveImpacts(base).find((i) => i.move.key === 'extras_200')!
    expect(extras.outcome.boatDone).not.toBe(null)
  })
})
