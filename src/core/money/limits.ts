/**
 * Yearly contribution limits (IRS). 2027's are not announced yet: carried at 2026's and
 * marked as estimates until they are.
 *
 *  - Elective deferrals: your own TSP + any civilian 401(k) contributions together.
 *  - Annual additions: everything into the TSP, the match included. Tax-free combat-zone
 *    pay can go in up to this limit, not just up to the elective one.
 *  - IRA: Roth or traditional; a year's contribution can be made until 15 April of the next.
 *    Tax-free combat pay counts as compensation for an IRA.
 */
export const LIMITS: Record<number, { elective: number; additions: number; ira: number; estimated?: boolean }> = {
  2026: { elective: 24500, additions: 72000, ira: 7500 },
  2027: { elective: 24500, additions: 72000, ira: 7500, estimated: true },
}

export function limitsFor(year: number) {
  return LIMITS[year] ?? { ...LIMITS[2027]!, estimated: true }
}
