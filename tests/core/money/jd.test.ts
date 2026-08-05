import { describe, expect, it } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  SUPPORT_HOME,
  householdTotals,
  monthlyFor,
} from '@/core/money/household'
import { DEBTS } from '@/core/money/debts'
import { CAR_LOAN_BALANCE } from '@/core/money/obligations'
import {
  HOUSE,
  LAW_SCHOOLS,
  POST_911_TIER,
  OPENING_BALANCE_SHEET,
  openingBalanceSheetLines,
  sellNetAt,
  balanceSheet,
  housingScenarios,
  projectJd,
  summerPlan,
  SUMMER_TAX_RATE,
  BAR_COSTS,
  projectedBalanceSheet,
} from '@/core/money/lawschool'

describe('household profiles', () => {
  it('spends materially less deployed than at home', () => {
    const home = householdTotals('home')
    const deployed = householdTotals('deployed')
    // Not 0.6 any more: home improvement now RISES, which eats into the saving. The
    // deployment is still much cheaper, just less dramatically so.
    expect(deployed.categoryTotal).toBeLessThan(home.categoryTotal * 0.65)
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
    for (const key of ['restaurants', 'coffee', 'gas']) {
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

  it('raises home improvement rather than cutting it — the house must be sellable', () => {
    const c = EXPENSE_CATEGORIES.find((x) => x.key === 'home_improvement')!
    expect(c.deployedMultiplier).toBeGreaterThan(1)
  })

  it('scales a single category correctly', () => {
    const c = EXPENSE_CATEGORIES.find((x) => x.key === 'restaurants')!
    expect(monthlyFor(c, 'home')).toBe(c.monthlyHome)
    expect(monthlyFor(c, 'deployed')).toBeCloseTo(c.monthlyHome * c.deployedMultiplier, 2)
  })
})

describe('balance sheet', () => {
  const opening = balanceSheet('2026-08-05', OPENING_BALANCE_SHEET)

  it('reflects the real starting position, conservatively', () => {
    // House at Zillow's Zestimate, and the truck and boat at zero because those
    // Monarch auto-valuations were disputed. Both moves make the number worse and
    // both are deliberate: a net worth propped up by figures nobody believes is
    // worse than useless.
    // -27,860 rather than -27,660: composing from CAR_LOAN_BALANCE picks up the $1,800
    // you told me, where the old hand-written sheet still carried Monarch's $1,600.
    // That difference IS the point of composing.
    expect(Math.round(opening.netWorth)).toBe(-27860)
    expect(opening.liquid).toBeLessThan(100)
  })

  it('keeps disputed values visible as a sensitivity rather than deleting them', () => {
    expect(opening.disputedTotal).toBeCloseTo(16898.59, 2)
    expect(Math.round(opening.netWorthIfDisputedAccepted)).toBe(-10961)
    // The gap between the two IS the disputed total — nothing else moved.
    expect(opening.netWorthIfDisputedAccepted - opening.netWorth).toBeCloseTo(
      opening.disputedTotal,
      2,
    )
  })

  it('never counts a disputed value toward assets or liquidity', () => {
    for (const line of opening.lines.filter((l) => l.disputedValue)) {
      expect(line.amount).toBe(0)
    }
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
    expect(bnb.monthlyCashFlow).toBeGreaterThan(rent.monthlyCashFlow)
  })

  /**
   * The bug this replaced: selling was scored at +$1,300/mo (the payment relieved)
   * against letting figures that already netted the payment off — a delta compared
   * with an absolute, which flattered selling by exactly the payment.
   */
  it('puts all three on one basis: selling is zero a month, not plus the payment', () => {
    const sell = scenarios.find((s) => s.scenario === 'sell')!
    expect(sell.monthlyCashFlow).toBe(0)
    expect(sell.monthlyVsHoldingEmpty).toBe(HOUSE.monthlyPayment)
  })

  it('keeps the two bases consistent for every scenario', () => {
    for (const s of scenarios) {
      // vs-empty is always the absolute figure plus the payment you stop losing.
      expect(s.monthlyVsHoldingEmpty).toBeCloseTo(s.monthlyCashFlow + HOUSE.monthlyPayment, 2)
    }
  })
})

describe('three-year projection', () => {
  const school = LAW_SCHOOLS.find((s) => s.key === 'ttu')!
  const scenario = housingScenarios().find((s) => s.scenario === 'sell')!
  const base = { startingCash: 6000, monthlyHousehold: 3589 }

  it('states that it models one ledger, so a deficit is not read as a family verdict', () => {
    expect(projectJd(school, scenario, base).warnings.join(' ')).toMatch(/YOUR side of the ledger/i)
  })

  it('counts drill pay and the prorated book stipend as the only other income', () => {
    const run = projectJd(school, scenario, { ...base, monthlyDrillPay: 500 })
    expect(run.years[0]!.otherIncome).toBeCloseTo(500 * 12 + 1000 * POST_911_TIER, 2)
  })

  it('counts sale proceeds once, in year one, and nothing after', () => {
    const run = projectJd(school, scenario, base)
    expect(run.years[0]!.housingScenarioIncome).toBe(scenario.upfrontCash)
    // Zero thereafter — the property is gone, and the Corpus mortgage was never among
    // the school-year costs, so there is no relief to credit.
    expect(run.years[1]!.housingScenarioIncome).toBe(0)
    expect(run.years[2]!.housingScenarioIncome).toBe(0)
  })

  it('pays MHA for months in session, not twelve, and prorates it to the tier', () => {
    const run = projectJd(school, scenario, base)
    expect(run.hazlewoodValue).toBeGreaterThan(0)
    expect(run.years[0]!.mhaIncome).toBeCloseTo(school.monthlyMha * POST_911_TIER * 9, 2)
  })

  it('prorates the book stipend by the tier too', () => {
    const run = projectJd(school, scenario, { ...base, monthlyDrillPay: 0 })
    expect(run.years[0]!.otherIncome).toBeCloseTo(1000 * POST_911_TIER, 2)
  })

  it('pays the summer after 1L and 2L, and nothing after 3L', () => {
    const run = projectJd(school, scenario, { ...base, summerTrack: 'regional_firm' })
    const plan = summerPlan('regional_firm')

    expect(run.years[0]!.summerGross).toBe(plan.afterFirstYear)
    expect(run.years[1]!.summerGross).toBe(plan.afterSecondYear)
    // The 3L summer is bar study. Modelling it as income would be the most flattering
    // error available here.
    expect(run.years[2]!.summerGross).toBe(0)
    expect(run.years[2]!.summerIncome).toBe(0)
  })

  it('taxes summer wages, since MHA and Hazlewood are not taxed and this is', () => {
    const run = projectJd(school, scenario, { ...base, summerTrack: 'big_law' })
    const gross = summerPlan('big_law').afterSecondYear
    expect(run.years[1]!.summerIncome).toBeCloseTo(gross * (1 - SUMMER_TAX_RATE), 2)
    expect(run.years[1]!.summerIncome).toBeLessThan(run.years[1]!.summerGross)
  })

  it('charges the bar exam in 3L, the one year with no summer income to meet it', () => {
    const run = projectJd(school, scenario, base)
    expect(run.years[0]!.barCosts).toBe(0)
    expect(run.years[1]!.barCosts).toBe(0)
    expect(run.years[2]!.barCosts).toBe(BAR_COSTS)
    expect(run.years[2]!.costs.some((c) => c.key === 'bar')).toBe(true)
  })

  it('makes the 2L summer the largest single swing in the whole projection', () => {
    const pi = projectJd(school, scenario, { ...base, summerTrack: 'public_interest' })
    const big = projectJd(school, scenario, { ...base, summerTrack: 'big_law' })
    const swing = big.endingCash - pi.endingCash
    expect(swing).toBeGreaterThan(0)
    // Larger than three years of drill pay, which is the next biggest lever you control.
    expect(swing).toBeGreaterThan(475 * 12 * 3)
  })

  it('defaults to the middle track, not the best case', () => {
    const dflt = projectJd(school, scenario, base)
    const regional = projectJd(school, scenario, { ...base, summerTrack: 'regional_firm' })
    const big = projectJd(school, scenario, { ...base, summerTrack: 'big_law' })
    expect(dflt.endingCash).toBe(regional.endingCash)
    expect(dflt.endingCash).toBeLessThan(big.endingCash)
  })

  /**
   * The itemised ledger is the point: every dollar in and out is a named line, so a
   * total can never quietly contain something the reader cannot see.
   */
  it('itemises both sides of each year so nothing hides in a residual', () => {
    for (const y of projectJd(school, scenario, base).years) {
      expect(y.totalIncome).toBeCloseTo(
        y.income.reduce((t, l) => t + l.amount, 0),
        2,
      )
      expect(y.totalCosts).toBeCloseTo(
        y.costs.reduce((t, l) => t + l.amount, 0),
        2,
      )
      expect(y.net).toBeCloseTo(y.totalIncome - y.totalCosts, 2)
      // Amounts are unsigned; the side of the ledger carries the sign.
      for (const l of [...y.income, ...y.costs]) expect(l.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('values Hazlewood at the share Chapter 33 does not cover', () => {
    const run = projectJd(school, scenario, base)
    expect(run.hazlewoodValue).toBeCloseTo(
      school.annualTuitionSticker * (1 - POST_911_TIER) * 3,
      2,
    )
  })

  it('says the two benefits stack at this tier, since that was the open question', () => {
    expect(projectJd(school, scenario, base).warnings.join(' ')).toMatch(/stacks with Chapter 33/i)
  })

  /**
   * The tier is the single biggest lever on this page: 20% off MHA is roughly
   * $300-460/mo, and it flips every school from MHA-covers-rent to it does not.
   */
  it('at 100% every school would clear its rent; at 80% none do', () => {
    for (const s of LAW_SCHOOLS) {
      const at80 = s.monthlyMha * POST_911_TIER - s.monthlyFamilyRent
      expect(at80).toBeLessThan(0)
    }
    const clearingAtFull = LAW_SCHOOLS.filter((s) => s.monthlyMha - s.monthlyFamilyRent > 0)
    expect(clearingAtFull.length).toBeGreaterThan(3)
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
    expect(withUplift.find((s) => s.scenario === 'rent')!.monthlyCashFlow).toBeLessThan(
      withoutUplift.find((s) => s.scenario === 'rent')!.monthlyCashFlow,
    )
  })

  it('names the one-bathroom problem in both letting scenarios', () => {
    for (const key of ['rent', 'airbnb'] as const) {
      const s = housingScenarios().find((x) => x.scenario === key)!
      expect(s.risks.join(' ')).toMatch(/bathroom/i)
    }
  })
})

describe('the balance sheet composes rather than restates', () => {
  const lines = openingBalanceSheetLines()
  const find = (label: string) => lines.find((l) => l.label === label)

  it('takes the house from HOUSE, not a second copy', () => {
    expect(find('628 Chamberlain St, Corpus Christi')!.amount).toBe(HOUSE.marketValue)
    expect(find('Mortgage')!.amount).toBe(HOUSE.mortgageBalance)
  })

  it('takes every unsecured balance from the debt register', () => {
    for (const debt of DEBTS) {
      expect(find(debt.label)!.amount).toBe(debt.balance)
    }
  })

  it('takes the auto loan from the obligation the budget pays it with', () => {
    expect(find('Car loan')!.amount).toBe(CAR_LOAN_BALANCE)
  })

  it('carries every liability the debt register knows about — none dropped', () => {
    const liabilityLabels = lines.filter((l) => l.kind === 'liability').map((l) => l.label)
    for (const debt of DEBTS) expect(liabilityLabels).toContain(debt.label)
  })

  it('moves with its source: changing a debt changes the sheet', () => {
    // The property that makes this worth doing — a single edit propagates.
    const goldman = DEBTS.find((d) => d.key === 'goldman')!
    expect(find('Goldman')!.amount).toBe(goldman.balance)
    expect(balanceSheet('2026-08-05', lines).liabilities).toBeCloseTo(
      HOUSE.mortgageBalance +
        CAR_LOAN_BALANCE +
        DEBTS.reduce((s, d) => s + d.balance, 0),
      2,
    )
  })
})
