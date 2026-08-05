import { describe, expect, it } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  SUPPORT_HOME,
  householdTotals,
  monthlyFor,
} from '@/core/money/household'
import {
  HOUSE,
  LAW_SCHOOLS,
  OPENING_BALANCE_SHEET,
  sellNetAt,
  balanceSheet,
  housingScenarios,
  projectJd,
  projectedBalanceSheet,
} from '@/core/money/lawschool'

describe('household profiles', () => {
  it('spends materially less deployed than at home', () => {
    const home = householdTotals('home')
    const deployed = householdTotals('deployed')
    expect(deployed.categoryTotal).toBeLessThan(home.categoryTotal * 0.6)
  })

  it('raises support sent home while cutting personal consumption', () => {
    const home = householdTotals('home')
    const deployed = householdTotals('deployed')
    expect(deployed.support).toBeGreaterThan(home.support)
    expect(SUPPORT_HOME.deployedMultiplier).toBeGreaterThan(1)
  })

  it('keeps the household lines flat — the family does not deploy', () => {
    for (const key of ['groceries', 'phone', 'utilities', 'pets']) {
      const c = EXPENSE_CATEGORIES.find((x) => x.key === key)!
      expect(c.deployedMultiplier).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('collapses the lines that only exist because you are physically there', () => {
    for (const key of ['restaurants', 'coffee', 'gas', 'home_improvement']) {
      const c = EXPENSE_CATEGORIES.find((x) => x.key === key)!
      expect(c.deployedMultiplier).toBeLessThanOrEqual(0.4)
    }
  })

  it('keeps support out of the category total so it is never double-counted', () => {
    const home = householdTotals('home')
    expect(home.total).toBe(home.categoryTotal + home.support)
    expect(EXPENSE_CATEGORIES.some((c) => c.key === 'support_home')).toBe(false)
  })

  it('excludes debt and mortgage — those are obligations, not household spend', () => {
    const banned = ['mortgage', 'loan_repayment', 'credit_card', 'auto_payment', 'transfer']
    for (const c of EXPENSE_CATEGORIES) {
      expect(banned).not.toContain(c.key)
    }
  })

  it('scales a single category correctly', () => {
    const c = EXPENSE_CATEGORIES.find((x) => x.key === 'restaurants')!
    expect(monthlyFor(c, 'home')).toBe(c.monthlyHome)
    expect(monthlyFor(c, 'deployed')).toBeCloseTo(c.monthlyHome * c.deployedMultiplier, 2)
  })
})

describe('balance sheet', () => {
  const opening = balanceSheet('2026-08-05', OPENING_BALANCE_SHEET)

  it('reflects the real starting position', () => {
    // -10,761 rather than the -8,461 Monarch showed: the house is carried at Zillow's
    // 185,100 Zestimate rather than Monarch's 187,400, which is 2,300 of the gap.
    expect(Math.round(opening.netWorth)).toBe(-10761)
    expect(opening.liquid).toBeLessThan(100)
  })

  it('separates liquid from total assets — the house is not spendable', () => {
    expect(opening.liquid).toBeLessThan(opening.assets / 100)
  })

  it('applies projected changes without letting a balance go negative', () => {
    const projected = projectedBalanceSheet('2027-08-04', OPENING_BALANCE_SHEET, [
      { label: 'Car loan', delta: -99999 },
      { label: 'Emergency Savings', delta: 5000 },
    ])
    expect(projected.lines.find((l) => l.label === 'Car loan')!.amount).toBe(0)
    expect(projected.lines.find((l) => l.label === 'Emergency Savings')!.amount).toBe(5000)
    expect(projected.netWorth).toBeGreaterThan(opening.netWorth)
  })
})

describe('housing scenarios', () => {
  const scenarios = housingScenarios()

  it('only selling releases cash', () => {
    const sell = scenarios.find((s) => s.scenario === 'sell')!
    expect(sell.upfrontCash).toBeGreaterThan(0)
    for (const other of scenarios.filter((s) => s.scenario !== 'sell')) {
      expect(other.upfrontCash).toBe(0)
    }
  })

  it('selling gives up all equity; the other two keep it', () => {
    expect(scenarios.find((s) => s.scenario === 'sell')!.equityRetainedAfter3y).toBe(0)
    expect(scenarios.find((s) => s.scenario === 'rent')!.equityRetainedAfter3y).toBeGreaterThan(0)
  })

  it('states risks for every option rather than presenting one as free', () => {
    for (const s of scenarios) expect(s.risks.length).toBeGreaterThan(0)
  })

  it('ranks the short-term let above a plain tenancy on cash flow alone', () => {
    const rent = scenarios.find((s) => s.scenario === 'rent')!
    const bnb = scenarios.find((s) => s.scenario === 'airbnb')!
    expect(bnb.monthlyNet).toBeGreaterThan(rent.monthlyNet)
  })
})

describe('three-year projection', () => {
  const school = LAW_SCHOOLS.find((s) => s.key === 'ttu')!
  const scenario = housingScenarios().find((s) => s.scenario === 'sell')!
  const base = { startingCash: 6000, monthlyHousehold: 3589 }

  it('shouts when spouse income is zero, because that distorts everything', () => {
    const run = projectJd(school, scenario, base)
    expect(run.warnings.join(' ')).toMatch(/SPOUSE INCOME IS ZERO/i)
  })

  it('does not shout once spouse income is supplied', () => {
    const run = projectJd(school, scenario, { ...base, monthlySpouseIncome: 3000 })
    expect(run.warnings.join(' ')).not.toMatch(/SPOUSE INCOME IS ZERO/i)
  })

  it('spouse income moves the ending position by 36 times the monthly figure', () => {
    const without = projectJd(school, scenario, base)
    const with3k = projectJd(school, scenario, { ...base, monthlySpouseIncome: 3000 })
    expect(with3k.endingCash - without.endingCash).toBeCloseTo(3000 * 36, 0)
  })

  it('counts sale proceeds once, in year one', () => {
    const run = projectJd(school, scenario, base)
    expect(run.years[0]!.housingScenarioIncome).toBeGreaterThan(
      run.years[1]!.housingScenarioIncome,
    )
  })

  it('pays MHA for months in session, not twelve', () => {
    const run = projectJd(school, scenario, base)
    expect(run.years[0]!.mhaIncome).toBe(school.monthlyMha * 9)
  })

  it('reports what Hazlewood is worth over three years', () => {
    const run = projectJd(school, scenario, base)
    expect(run.hazlewoodValue).toBe(school.annualTuitionSticker * 3)
  })

  it('carries Tricare through every year', () => {
    for (const y of projectJd(school, scenario, base).years) {
      expect(y.tricare).toBeGreaterThan(0)
    }
  })

  it('flags every low-confidence input on every run', () => {
    for (const s of LAW_SCHOOLS) {
      const run = projectJd(s, scenario, base)
      expect(run.warnings.join(' ')).toMatch(/my estimate/i)
    }
  })
})

describe('the house, on real Zillow figures', () => {
  it('nets almost nothing at the Zestimate — 11% costs eat the equity', () => {
    expect(sellNetAt(HOUSE.marketValue)).toBeLessThan(3000)
    expect(sellNetAt(HOUSE.marketValue)).toBeGreaterThan(0)
  })

  it('goes NEGATIVE at the bottom of Zillow’s own range', () => {
    // The finding that changes the recommendation: selling can require cash he
    // does not have. A single point estimate would have hidden this entirely.
    expect(sellNetAt(HOUSE.valueLow)).toBeLessThan(0)
  })

  it('only clears real money at the top of the range', () => {
    expect(sellNetAt(HOUSE.valueHigh)).toBeGreaterThan(15000)
  })

  it('charges the rental scenarios for losing the homestead exemption', () => {
    expect(HOUSE.monthlyRentalTaxInsuranceUplift).toBeGreaterThan(0)
    const withUplift = housingScenarios()
    const withoutUplift = housingScenarios({ ...HOUSE, monthlyRentalTaxInsuranceUplift: 0 })
    expect(withUplift.find((s) => s.scenario === 'rent')!.monthlyNet).toBeLessThan(
      withoutUplift.find((s) => s.scenario === 'rent')!.monthlyNet,
    )
  })

  it('names the one-bathroom problem in both letting scenarios', () => {
    for (const key of ['rent', 'airbnb'] as const) {
      const s = housingScenarios().find((x) => x.scenario === key)!
      expect(s.risks.join(' ')).toMatch(/bathroom/i)
    }
  })
})
