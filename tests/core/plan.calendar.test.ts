import { describe, expect, it } from 'vitest'
import { LANES, PLAN_BARS, PLAN_POINTS, upcoming } from '@/core/plan/calendar'

describe('plan calendar', () => {
  it('has no duplicate rows', () => {
    const keys = [...PLAN_BARS.map((b) => `${b.lane}|${b.label}`), ...PLAN_POINTS.map((p) => `${p.lane}|${p.label}`)]
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('puts every row in a known lane, with spans that run forwards', () => {
    const lanes = LANES.map((l) => l.key)
    for (const b of PLAN_BARS) {
      expect(lanes).toContain(b.lane)
      expect(b.end >= b.start).toBe(true)
    }
  })
  it('shows the minimesters, the law decision and the job start', () => {
    expect(PLAN_BARS.filter((b) => b.lane === 'macc' && /Spring|Summer|Fall/.test(b.label)).length).toBe(6)
    expect(PLAN_POINTS.some((p) => p.decision && p.lane === 'law')).toBe(true)
    expect(PLAN_POINTS.find((p) => p.label === 'Target start')!.date).toBe('2027-08-02')
  })
  it('lists what lands next in date order', () => {
    const u = upcoming('2026-11-19')
    expect(u[0]!.date >= '2026-11-19').toBe(true)
    expect(u.map((e) => e.date)).toEqual([...u.map((e) => e.date)].sort())
  })
})
