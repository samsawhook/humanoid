/**
 * Federal income tax, married filing jointly, on an ANNUAL figure before the standard
 * deduction. 2026 brackets, indexed ~2.5% a year after. No state income tax in Texas.
 * Kept free of other imports so pages can run it in the browser.
 */
export function federalTax(annualTaxable: number, year: number): number {
  const idx = Math.pow(1.025, Math.max(0, year - 2026))
  const income = Math.max(0, annualTaxable - 32200 * idx)
  const brackets: [number, number][] = [
    [24800, 0.1],
    [100800, 0.12],
    [211400, 0.22],
    [403550, 0.24],
    [Infinity, 0.32],
  ]
  let tax = 0
  let prev = 0
  for (const [top, rate] of brackets) {
    const t = top * idx
    if (income > prev) tax += (Math.min(income, t) - prev) * rate
    prev = t
  }
  return tax
}
