/**
 * What actually happened, as opposed to what was scheduled.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  This is NOT a completion tracker and must never become one.
 *
 *  The spec is explicit that task completion rate is a non-objective: never
 *  optimised for, never ranked by, never displayed. Completion data is retained for
 *  exactly one purpose — estimating what throughput is realistic — and that is the
 *  only thing this file is allowed to feed. A percentage here would turn a planning
 *  instrument into a scoreboard, and a scoreboard you are losing on is a system you
 *  stop opening.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The reason it exists is a distinction the capacity model could not see on its own:
 *
 *   **Time available and time usable are different quantities.**
 *
 * The first duty day produced 75 surviving minutes of study block. Zero of them became
 * study. Not because the schedule collided — though it did, BJJ sits squarely on the
 * evening block — but because after an 0400 start the reported cognitive state was
 * "meh, low motivation for computer LSAT / admin". Clock hours were available. The kind
 * of attention LSAT work needs was not.
 *
 * So a plan that counts hours will keep over-promising, in a way no amount of better
 * arithmetic fixes. What it needs instead is to know which KIND of work a given day can
 * actually hold.
 *
 * Pure. No clock, no database.
 */

import type { LocalDate } from '../types'

/** Deliberately coarse. Finer resolution would be false precision on a self-report. */
export type Rating = 'good' | 'ok' | 'meh' | 'poor'

const RATING_ORDER: Rating[] = ['poor', 'meh', 'ok', 'good']

/**
 * How much thinking a block actually costs.
 *
 * The point of grading work rather than time: on a "meh" day, high-demand work does not
 * happen no matter how many minutes are free, while low-demand work happens fine. A
 * template that only knows about minutes will keep scheduling the wrong thing.
 */
export type CognitiveDemand = 'high' | 'medium' | 'low'

/** The best a given cognitive state can realistically support. */
export function demandCeiling(state: Rating): CognitiveDemand {
  if (state === 'good') return 'high'
  if (state === 'ok') return 'high'
  if (state === 'meh') return 'medium'
  return 'low'
}

const DEMAND_RANK: Record<CognitiveDemand, number> = { low: 0, medium: 1, high: 2 }

export function canSupport(state: Rating, demand: CognitiveDemand): boolean {
  return DEMAND_RANK[demand] <= DEMAND_RANK[demandCeiling(state)]
}

/**
 * Something persistent enough to watch, as opposed to a bad day.
 *
 * Split out from the free notes because a symptom mentioned twice in passing is easy to
 * lose, and the ones that matter are exactly the ones you get used to.
 */
export interface HealthFlag {
  key: string
  label: string
  duration: 'new' | 'weeks' | 'months' | 'longstanding'
  trajectory: 'improving' | 'stable' | 'unknown' | 'worsening'
  /** What to do about it, and when. Blank is not an option here. */
  action: string
  urgent: boolean
}

/** What took the discretionary time. Named, because "nothing got done" is not a cause. */
export interface Displacement {
  label: string
  at?: string
  minutes?: number
  /** True when this was worth doing — displacement is not automatically failure. */
  wanted: boolean
}

export interface DayLog {
  date: LocalDate
  wake: string
  physical: Rating
  emotional: Rating
  cognitive: Rating
  displacedBy: Displacement[]
  flags: HealthFlag[]
  /** Verbatim. Kept whole rather than parsed into fields that lose the texture. */
  notes: string
}

export const DAY_LOGS: DayLog[] = [
  {
    date: '2026-08-06',
    wake: '04:00',
    physical: 'good',
    emotional: 'good',
    /** Your word: "cognitively meh, low motivation to complete computer LSAT / admin". */
    cognitive: 'meh',
    displacedBy: [
      {
        label: 'Slept an hour or two once RFI and equipment set-up finished',
        minutes: 90,
        /** After a 0400 start this is recovery, not slippage. */
        wanted: true,
      },
      { label: 'BJJ', at: '20:00', minutes: 90, wanted: true },
      { label: 'Walking around base (~2 miles) and a 1 mile run', minutes: 45, wanted: true },
    ],
    flags: [
      {
        key: 'canker_sore',
        label: 'Painful canker sore on the tongue',
        duration: 'new',
        trajectory: 'improving',
        action:
          'Nothing structural. Worth noting only because it makes eating hard, and ' +
          'under-eating on a 13-hour range day is its own problem.',
        urgent: false,
      },
      {
        key: 'foot_pain',
        label: 'Mystery foot pain, long-standing, trajectory unknown',
        duration: 'longstanding',
        trajectory: 'unknown',
        /**
         * The single most actionable line in the whole log. You are at DRC with your
         * medical folder in hand — this is the one window where raising it costs
         * nothing and creates a record. A foot problem you cannot name, on a
         * deployment spent in boots, is not a thing to find out about in theatre.
         */
        action:
          'RAISE IT AT DRC, THIS WEEK, while you have the medical folder open. It costs ' +
          'nothing now and creates a documented baseline. Undiagnosed foot pain plus ' +
          'twelve months in boots is how a nuisance becomes a profile.',
        urgent: true,
      },
    ],
    notes:
      'RFI, EST, ECS and DRC day. Slept 1–2h in the afternoon after RFI and equipment ' +
      'set-up, BJJ at 2000, plus roughly 2 miles walking and a 1 mile run. Burger for ' +
      'lunch; donut, coconut cream pie, banana, juice, water and coffee for breakfast; ' +
      'roll, mashed potatoes and chili mac for dinner. Decent water intake. Physically ' +
      'and emotionally fine, cognitively meh, low motivation for computer LSAT or admin.',
  },
]

export function logFor(date: LocalDate, logs: DayLog[] = DAY_LOGS): DayLog | null {
  return logs.find((l) => l.date === date) ?? null
}

export interface FlagWatch {
  flag: HealthFlag
  firstSeen: LocalDate
  lastSeen: LocalDate
  timesReported: number
}

/**
 * Flags across every log, so a symptom mentioned repeatedly stops being a passing
 * remark and starts being a pattern with a first-seen date.
 */
export function watchedFlags(logs: DayLog[] = DAY_LOGS): FlagWatch[] {
  const byKey = new Map<string, FlagWatch>()
  for (const log of logs) {
    for (const flag of log.flags) {
      const existing = byKey.get(flag.key)
      if (existing) {
        existing.lastSeen = log.date
        existing.timesReported += 1
        existing.flag = flag
      } else {
        byKey.set(flag.key, {
          flag,
          firstSeen: log.date,
          lastSeen: log.date,
          timesReported: 1,
        })
      }
    }
  }
  // Urgent first, then longest-running.
  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.flag.urgent) - Number(a.flag.urgent) || a.firstSeen.localeCompare(b.firstSeen),
  )
}

export interface UsableCapacity {
  date: LocalDate
  /** Minutes the schedule left free. What the capacity model counts. */
  availableMinutes: number
  /** Whether the day could hold the work those minutes were reserved for. */
  ceiling: CognitiveDemand
  supportsHighDemand: boolean
  /** What actually took the time, and whether it was worth taking. */
  displacedBy: Displacement[]
  /** True when everything that displaced the block was worth doing. */
  displacementWasChosen: boolean
}

/**
 * What a day could actually hold, as against what it had room for.
 *
 * Returns no score and no percentage — deliberately. The output is a ceiling and a
 * cause, both of which change what you plan next. A completion figure would change
 * nothing except how the day feels to read.
 */
export function usableCapacity(
  date: LocalDate,
  availableMinutes: number,
  logs: DayLog[] = DAY_LOGS,
): UsableCapacity | null {
  const log = logFor(date, logs)
  if (!log) return null

  return {
    date,
    availableMinutes,
    ceiling: demandCeiling(log.cognitive),
    supportsHighDemand: canSupport(log.cognitive, 'high'),
    displacedBy: log.displacedBy,
    displacementWasChosen: log.displacedBy.every((d) => d.wanted),
  }
}

/** Ratings, worst first, for anything that needs to order them. */
export function ratingRank(r: Rating): number {
  return RATING_ORDER.indexOf(r)
}
