import { describe, expect, it } from 'vitest'
import { allocateAll } from '@/core/money/allocation'
import { projectPaychecks } from '@/core/money/paychecks'
import { OBLIGATIONS, ONE_OFFS, PLAN_START } from '@/core/money/obligations'
import { TIMELINE } from '@/core/money/rates'
import { combineStatements, paycheckStatement } from '@/core/money/statement'
import { benchmarkRows } from '@/core/money/benchmarks'

describe('benchmarks', () => {
  const all = allocateAll(projectPaychecks(PLAN_START, TIMELINE.lastPayday), OBLIGATIONS, ONE_OFFS)
  const i = all.findIndex((a) => a.paycheck.scheduledDate === '2026-12-01')
  const month = combineStatements([paycheckStatement(all[i]!, all[i + 1]), paycheckStatement(all[i + 1]!, all[i + 2])])
  const rows = benchmarkRows(month)

  it('covers every category as a share of gross', () => {
    expect(rows.map((r) => r.key)).toEqual(['deductions', 'home', 'car', 'sent', 'personal', 'debt', 'invest', 'cash'])
    const home = rows.find((r) => r.key === 'home')!
    expect(home.you).toBeCloseTo((month.spending.find((s) => s.key === 'home')!.total / month.gross.total) * 100, 0)
  })

  it('treats Wife & Kids as fixed, never as over', () => {
    expect(rows.find((r) => r.key === 'sent')!.status).toBe('fixed')
  })

  it('counts the TSP match toward investing', () => {
    expect(rows.find((r) => r.key === 'invest')!.verdict).toMatch(/match/)
  })
})

describe('outside voices', () => {
  it('each is a full allocation: robo, Ramsey and Kiyosaki sum to 100% of gross', async () => {
    const { VOICES } = await import('@/core/money/benchmarks')
    for (const who of ['robo', 'ramsey', 'kiyosaki'] as const) {
      expect(Object.values(VOICES).reduce((t, v) => t + v[who].pct, 0)).toBe(100)
    }
  })
})
