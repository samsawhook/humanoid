/**
 * LSAT administrations, the law-school application cycle, and the MAcc term grid.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SOURCING. Every date carries a `source` field: 'confirmed' means I found it
 *  stated explicitly; 'derived' means I inferred it from the prior year's pattern
 *  and it needs checking. Several LSAC and TAMU-CC pages returned 403 to this
 *  environment, so the gaps are real gaps, not laziness — they are marked rather
 *  than filled with plausible-looking guesses.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { LocalDate } from '../types'
import { localDaysBetween, addLocalDays } from '../time/localDay'

export type Sourcing = 'confirmed' | 'derived' | 'unknown'

export interface LsatAdministration {
  key: string
  label: string
  testDate: LocalDate
  registrationDeadline: LocalDate | null
  scoreRelease: LocalDate | null
  source: Sourcing
  note?: string
}

/**
 * 2026–27 administrations.
 *
 * The structural fact that dominates everything else: from the August 2026
 * administration the multiple-choice section moved to in-person testing at
 * Prometric centres. There is an explicit exception for test takers stationed
 * abroad on active duty — which is the only reason any of this is possible from
 * theatre. Claim it early; it is an approval process, not a checkbox.
 */
export const LSAT_DATES: LsatAdministration[] = [
  {
    key: 'oct_2026',
    label: 'October 2026',
    testDate: '2026-10-07',
    registrationDeadline: '2026-08-27',
    scoreRelease: '2026-10-28',
    source: 'confirmed',
    note: 'Administered 7–10 Oct. Registration shuts 8 days before you ship out.',
  },
  {
    key: 'nov_2026',
    label: 'November 2026',
    testDate: '2026-11-11',
    registrationDeadline: null,
    scoreRelease: null,
    source: 'derived',
    note: 'A November sitting exists; I could not confirm the exact date. VERIFY.',
  },
  {
    key: 'jan_2027',
    label: 'January 2027',
    testDate: '2027-01-13',
    registrationDeadline: '2026-12-01',
    scoreRelease: '2027-02-03',
    source: 'confirmed',
    note: 'Score lands early February — too late for a January application.',
  },
  {
    key: 'feb_2027',
    label: 'February 2027',
    testDate: '2027-02-12',
    registrationDeadline: '2026-12-29',
    scoreRelease: '2027-03-10',
    source: 'confirmed',
  },
  {
    key: 'apr_2027',
    label: 'April 2027',
    testDate: '2027-04-08',
    registrationDeadline: null,
    scoreRelease: '2027-04-28',
    source: 'confirmed',
    note: 'Administered 8–10 Apr.',
  },
  {
    key: 'jun_2027',
    label: 'June 2027',
    testDate: '2027-06-10',
    registrationDeadline: null,
    scoreRelease: null,
    source: 'derived',
    note: 'A June sitting exists; exact date unconfirmed. VERIFY.',
  },
]

/**
 * Rolling admissions, expressed as what it actually is: a cost ramp, not a deadline.
 *
 * Schools read as applications arrive and award seats and scholarship money as they
 * go. September and October are the strong months; November begins losing leverage;
 * December and January continue the slide; February and later carries real cost.
 * The same application submitted at two different times is not the same application.
 */
export interface CycleBand {
  from: LocalDate
  to: LocalDate
  label: string
  /** 1.0 = full strength. A rough multiplier on admit and scholarship odds. */
  strength: number
  note: string
}

export function applicationCycleBands(cycleYear: number): CycleBand[] {
  return [
    {
      from: `${cycleYear}-09-01`,
      to: `${cycleYear}-10-31`,
      label: 'Optimal',
      strength: 1,
      note: 'Full class to fill, readers fresh, scholarship budget untouched.',
    },
    {
      from: `${cycleYear}-11-01`,
      to: `${cycleYear}-11-30`,
      label: 'Still strong',
      strength: 0.9,
      note: 'Leverage starting to erode but the class is far from full.',
    },
    {
      from: `${cycleYear}-12-01`,
      to: `${cycleYear + 1}-01-31`,
      label: 'Late but workable',
      strength: 0.7,
      note: 'Fine with above-median numbers. Scholarship money is materially thinner.',
    },
    {
      from: `${cycleYear + 1}-02-01`,
      to: `${cycleYear + 1}-03-31`,
      label: 'Real cost',
      strength: 0.45,
      note: 'Seats and money largely committed. Only worth it with strong numbers.',
    },
  ]
}

/**
 * MAcc terms. TAMU-CC runs the online programme in 7-week blocks, several starts a
 * year, which is what makes it survivable alongside a deployment — a bad month costs
 * one block rather than a semester.
 */
export interface Term {
  key: string
  label: string
  start: LocalDate
  end: LocalDate
  source: Sourcing
  note?: string
}

export const MACC_TERMS: Term[] = [
  {
    key: 'fall26_1',
    label: 'Fall 2026 — 1st 7-week',
    start: '2026-08-24',
    end: '2026-10-12',
    source: 'derived',
    note: 'Fall full term is 24 Aug – 10 Dec (confirmed); the 7-week split follows the prior year’s pattern. VERIFY.',
  },
  {
    key: 'fall26_2',
    label: 'Fall 2026 — 2nd 7-week',
    start: '2026-10-13',
    end: '2026-12-02',
    source: 'derived',
    note: 'Derived from the prior year’s split. VERIFY.',
  },
  {
    key: 'spring27_1',
    label: 'Spring 2027 — 1st 7-week',
    start: '2027-01-19',
    end: '2027-03-08',
    source: 'unknown',
    note: 'Spring dates not obtainable — TAMU-CC pages blocked. VERIFY before relying on this.',
  },
  {
    key: 'spring27_2',
    label: 'Spring 2027 — 2nd 7-week',
    start: '2027-03-09',
    end: '2027-05-07',
    source: 'unknown',
    note: 'Not obtainable. VERIFY.',
  },
]

/** Confirmed Fall 2026 census date — the point after which a drop still bills you. */
export const FALL_2026_CENSUS: LocalDate = '2026-09-09'

// ── LSAT study plan ─────────────────────────────────────────────────────────

export interface StudyPhase {
  key: string
  label: string
  start: LocalDate
  end: LocalDate
  /** What this phase must PRODUCE. Never "study for N hours" — see LIFE_DASH.md D2. */
  output: string
  hoursPerWeek: number
}

export interface StudyPlan {
  administration: LsatAdministration
  weeksAvailable: number
  totalHours: number
  phases: StudyPhase[]
  /** Named problems with this plan. Empty means it is merely hard, not broken. */
  warnings: string[]
}

/**
 * Build a phased plan backwards from a test date.
 *
 * Proportions rather than fixed weeks, so a short runway compresses every phase
 * instead of silently dropping the review at the end — which is the phase people
 * actually cut, and the one that moves the score.
 */
export function buildStudyPlan(
  administration: LsatAdministration,
  from: LocalDate,
  hoursPerWeek: number,
): StudyPlan {
  const days = localDaysBetween(from, administration.testDate)
  const weeks = Math.max(0, Math.floor(days / 7))
  const warnings: string[] = []

  if (weeks < 8) {
    warnings.push(
      `Only ${weeks} weeks of runway. Below about 12 weeks a first sitting is usually a diagnostic with a fee attached.`,
    )
  }
  if (administration.registrationDeadline) {
    const toDeadline = localDaysBetween(from, administration.registrationDeadline)
    if (toDeadline < 0) warnings.push('Registration has already closed for this administration.')
    else if (toDeadline < 30)
      warnings.push(`Registration closes in ${toDeadline} days — ${administration.registrationDeadline}.`)
  } else {
    warnings.push('Registration deadline unconfirmed for this administration. Check LSAC.')
  }
  if (administration.source !== 'confirmed') {
    warnings.push('This test date is derived, not confirmed. Verify before planning around it.')
  }

  const split: { key: string; label: string; share: number; output: string }[] = [
    {
      key: 'diagnostic',
      label: 'Diagnostic and baseline',
      share: 0.08,
      output: 'A scored, timed full practice test and a written target score.',
    },
    {
      key: 'fundamentals',
      label: 'Fundamentals',
      share: 0.32,
      output: 'Every question type identified and one worked method written for each.',
    },
    {
      key: 'drilling',
      label: 'Untimed drilling to accuracy',
      share: 0.3,
      output: '85%+ accuracy untimed on each section type, by category.',
    },
    {
      key: 'timed',
      label: 'Timed practice tests',
      share: 0.2,
      output: 'At least 6 full timed PTs, each with a written error log.',
    },
    {
      key: 'taper',
      label: 'Review and taper',
      share: 0.1,
      output: 'Error log reduced to the 3 recurring failure modes, and a test-day plan.',
    },
  ]

  let cursor = from
  const phases: StudyPhase[] = split.map((s) => {
    const phaseDays = Math.max(1, Math.round(days * s.share))
    const start = cursor
    const end = addLocalDays(start, phaseDays - 1)
    cursor = addLocalDays(end, 1)
    return {
      key: s.key,
      label: s.label,
      start,
      end,
      output: s.output,
      hoursPerWeek,
    }
  })

  return {
    administration,
    weeksAvailable: weeks,
    totalHours: weeks * hoursPerWeek,
    phases,
    warnings,
  }
}

/**
 * Which administrations can still produce a score in time for a target submission.
 * Scores take roughly three weeks; an unconfirmed release date is treated as
 * test date + 21 days rather than assumed to be fine.
 */
export function administrationsUsableBy(target: LocalDate): LsatAdministration[] {
  return LSAT_DATES.filter((a) => {
    const release = a.scoreRelease ?? addLocalDays(a.testDate, 21)
    return localDaysBetween(release, target) >= 0
  })
}
