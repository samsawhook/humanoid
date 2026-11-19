/**
 * Yearly contribution limits (IRS). 2027's were announced 12 Nov 2026 (IR-2026-136,
 * Notice 2026-66). Later years are carried at the last announced and marked as estimates.
 *
 *  - Elective deferrals: your own TSP + any civilian 401(k) contributions together.
 *  - Annual additions: everything into the TSP, the match included. Tax-free combat-zone
 *    pay can go in up to this limit, not just up to the elective one.
 *  - IRA: Roth or traditional; a year's contribution can be made until 15 April of the next.
 *    Tax-free combat pay counts as compensation for an IRA.
 */
export const LIMITS: Record<number, { elective: number; additions: number; ira: number; estimated?: boolean }> = {
  2026: { elective: 24500, additions: 72000, ira: 7500 },
  2027: { elective: 25500, additions: 75000, ira: 7500 },
}

export function limitsFor(year: number) {
  return LIMITS[year] ?? { ...LIMITS[2027]!, estimated: true }
}

/**
 * The year a paycheck's TSP counts in: the date it is PAID. DFAS pays a 1st that falls on a
 * holiday or weekend the business day before — 1 January always is, so the 1 Jan paycheck is
 * paid 31 Dec and counts toward the year before.
 */
export function tspYear(payday: string): number {
  const y = Number(payday.slice(0, 4))
  return payday.slice(5) === '01-01' ? y - 1 : y
}

