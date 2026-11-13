import { describe, expect, it } from 'vitest'
import { TRADELINES, reviewReadiness, REVIEW_FILE } from '@/core/money/credit'
import { DEBTS } from '@/core/money/debts'

describe('credit recovery for the security review', () => {
  it('is not ready today, and says exactly why', () => {
    const r = reviewReadiness()
    expect(r.ready).toBe(false)
    expect(r.federalDelinquent).toBe(0) // Nelnet: administrative forbearance, 13 Nov
    expect(r.inCollections).toBe(1) // UT
    expect(r.chargedOffUndocumented).toBe(2) // Upgrade, Goldman
  })

  it('becomes ready when every problem line is resolved or documented — nothing more', () => {
    const resolved = TRADELINES.map((l) =>
      l.status === 'clean' || l.status === 'recovering' ? l : { ...l, status: 'recovering' as const },
    )
    expect(reviewReadiness(resolved).ready).toBe(true)
  })

  it('keeps every tradeline balance in step with the debt register', () => {
    for (const t of TRADELINES.filter((x) => x.debtKey)) {
      const d = DEBTS.find((x) => x.key === t.debtKey)
      expect(d, t.debtKey).toBeDefined()
      expect(t.balance).toBeCloseTo(d!.balance, 2)
    }
  })

  it('never makes a score or new credit the goal', () => {
    // The goal is a clean review, so nothing here proposes opening an account.
    for (const t of TRADELINES) expect(t.action.toLowerCase()).not.toMatch(/open a new|apply for/)
    expect(REVIEW_FILE.some((f) => /counsel/i.test(f))).toBe(true)
  })

  it('sends both charge-offs to JAG before any creditor contact', () => {
    for (const t of TRADELINES.filter((x) => x.status === 'charged_off')) {
      expect(t.action).toMatch(/JAG/)
    }
  })
})

describe('SLRP', () => {
  it('is on file as evidence, and Nelnet is recovering, not delinquent', () => {
    const nelnet = TRADELINES.find((t) => t.key === 'nelnet')!
    expect(nelnet.reported).toMatch(/SLRP/)
    expect(nelnet.status).toBe('recovering')
    expect(REVIEW_FILE.some((f) => /SLRP/.test(f))).toBe(true)
  })
})
