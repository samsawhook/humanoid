/**
 * Semi-monthly paycheck projection.
 *
 * Military pay lands on the 1st and the 15th, shifted back to the prior business day
 * when that falls on a weekend. The 15th covers the 1st–15th; the 1st covers the 16th
 * through the end of the prior month.
 *
 * Pure. No clock, no network. Every date comes in as an argument.
 */

import type { LocalDate } from '../types'
import {
  addLocalDays,
  compareLocalDates,
  formatLocalDate,
  parseLocalDate,
} from '../time/localDay'
import { ENTITLEMENTS, TAX, TIMELINE, type Entitlement } from './rates'

export interface PaycheckLine {
  key: string
  label: string
  amount: number
  taxable: boolean
}

export interface Paycheck {
  /** The day the money actually lands, after weekend shift. */
  payDate: LocalDate
  /** The scheduled 1st/15th before the weekend shift, for reconciliation against an LES. */
  scheduledDate: LocalDate
  periodStart: LocalDate
  periodEnd: LocalDate
  lines: PaycheckLine[]
  gross: number
  taxableGross: number
  federalTax: number
  fica: number
  net: number
  /** True when the period falls inside the combat-zone exclusion. */
  czte: boolean
}

/** Saturday and Sunday shift the deposit back to Friday. */
function shiftToBusinessDay(date: LocalDate): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  if (dow === 6) return addLocalDays(date, -1) // Saturday → Friday
  if (dow === 0) return addLocalDays(date, -2) // Sunday → Friday
  return date
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Every 1st and 15th in the range, inclusive. */
export function payDatesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  const start = parseLocalDate(from)
  let year = start.year
  let month = start.month

  while (true) {
    for (const day of [1, 15]) {
      const scheduled = formatLocalDate(year, month, day)
      if (compareLocalDates(scheduled, from) >= 0 && compareLocalDates(scheduled, to) <= 0) {
        out.push(scheduled)
      }
    }
    if (compareLocalDates(formatLocalDate(year, month, 1), to) > 0) break
    month++
    if (month > 12) {
      month = 1
      year++
    }
    if (year > start.year + 10) break // guard; nothing here plans a decade of paychecks
  }

  return out.sort(compareLocalDates)
}

function isActive(entitlement: Entitlement, on: LocalDate): boolean {
  if (entitlement.activeFrom && compareLocalDates(on, entitlement.activeFrom) < 0) return false
  if (entitlement.activeTo && compareLocalDates(on, entitlement.activeTo) > 0) return false
  return true
}

/**
 * The pay period a given payday covers.
 *
 * The 15th pays the first half of its own month. The 1st pays the second half of the
 * PREVIOUS month, which is why entitlements are evaluated against the period rather
 * than against the payday — an entitlement starting on the 20th shows up in the
 * paycheck that lands on the 1st.
 */
function periodFor(scheduled: LocalDate): { start: LocalDate; end: LocalDate } {
  const { year, month, day } = parseLocalDate(scheduled)
  if (day === 15) {
    return { start: formatLocalDate(year, month, 1), end: formatLocalDate(year, month, 15) }
  }
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return {
    start: formatLocalDate(prevYear, prevMonth, 16),
    end: formatLocalDate(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
  }
}

/**
 * Whether the exclusion applies to a period. Any day of the period inside the zone
 * excludes the month's pay for enlisted, so this is deliberately generous — it
 * triggers when the period overlaps the CZTE window at all.
 */
function czteAppliesTo(periodEnd: LocalDate): boolean {
  return compareLocalDates(periodEnd, TIMELINE.czteStart) >= 0
}

export function projectPaycheck(
  scheduled: LocalDate,
  entitlements: Entitlement[] = ENTITLEMENTS,
): Paycheck {
  const period = periodFor(scheduled)
  // Evaluate entitlements at period end: a mid-period start still pays that period.
  const active = entitlements.filter((e) => isActive(e, period.end))

  const lines: PaycheckLine[] = active.map((e) => ({
    key: e.key,
    label: e.label,
    // Semi-monthly: half a month per cheque.
    amount: round2(e.monthlyAmount / 2),
    taxable: e.taxable,
  }))

  const gross = round2(lines.reduce((sum, l) => sum + l.amount, 0))
  const taxableGross = round2(
    lines.filter((l) => l.taxable).reduce((sum, l) => sum + l.amount, 0),
  )
  const ficaBase = round2(
    active
      .filter((e) => e.fica)
      .reduce((sum, e) => sum + e.monthlyAmount / 2, 0),
  )

  const czte = czteAppliesTo(period.end)
  // CZTE zeroes federal income tax on excluded pay. It does NOT touch FICA.
  const federalTax = czte ? 0 : round2(taxableGross * TAX.effectiveFederalRate)
  const fica = round2(ficaBase * TAX.ficaRate)

  return {
    payDate: shiftToBusinessDay(scheduled),
    scheduledDate: scheduled,
    periodStart: period.start,
    periodEnd: period.end,
    lines,
    gross,
    taxableGross,
    federalTax,
    fica,
    net: round2(gross - federalTax - fica),
    czte,
  }
}

export function projectPaychecks(
  from: LocalDate,
  to: LocalDate,
  entitlements: Entitlement[] = ENTITLEMENTS,
): Paycheck[] {
  return payDatesBetween(from, to).map((d) => projectPaycheck(d, entitlements))
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
