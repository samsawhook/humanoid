import { describe, expect, it } from 'vitest'
import { nov1Statement, NOV1 } from '@/core/money/reconstruct'

describe('the 1 Nov paycheck, rebuilt from the bank', () => {
  const s = nov1Statement()
  it('reconciles to the bank: free cash flow − investing = the change in cash', () => {
    const spend = s.spending.reduce((t, x) => t + x.total, 0)
    expect(s.freeCashFlow).toBeCloseTo(s.netIncome - spend, 2)
    const tsp = s.investing.lines.find((l) => l.key === 'retirement')!.amount
    // net income − TSP = what reached checking (the deposit + the small DFAS adjustment)
    expect(s.netIncome - tsp).toBeCloseTo(NOV1.deposit + 26, 2)
    expect(s.netCash.total).toBeCloseTo(s.freeCashFlow - s.investing.total, 2)
  })
  it('shows the mortgage check, the car payment and the transfers home', () => {
    // The month's first mortgage payment is housing; Westlake was behind: arrears (19 Nov).
    expect(s.spending.find((x) => x.key === 'home')!.total).toBe(1381.79)
    const arrears = s.spending.find((x) => x.key === 'debt')!.lines.find((l) => l.label === 'Arrears & catch-up')!
    expect(arrears.amount).toBeCloseTo(355, 2)
    expect(s.spending.find((x) => x.key === 'sent')!.total).toBe(1350)
    // The Cash App cash-out nets against personal spending; net cash is the real checking change.
    expect(s.netCash.total).toBeCloseTo(27.11 - 281.66, 2)
  })
})
