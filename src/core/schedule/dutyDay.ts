/**
 * Real Army days, as published, turned into commitments the template has to survive.
 *
 * Everything else in this repo has been modelling money, where the numbers are exact
 * and the uncertainty is about the future. Capacity is the opposite: the hours are
 * uncertain and it is the PAST that is unreliable, because nobody writes down when a
 * range day actually ended. So this file records what the schedule said, marks where it
 * stopped saying anything, and refuses to fill the gap with a comfortable guess.
 *
 * The load-bearing observation is the one the schedule makes by accident:
 *
 *   **A 0440 formation means the morning study block does not exist.**
 *
 * The default day template opens with 05:30–07:00 of LSAT work, justified as "the
 * hardest cognitive work before the day can take it from you". On a duty day the day
 * has already taken it. That block is not shortened by a 0440 formation, it is deleted,
 * and with it goes the half of the study plan that was supposed to be protected from
 * the Army by being earlier than the Army.
 *
 * Pure. No clock, no database.
 */

import type { Commitment, IanaZone, LocalDate } from '../types'
import { addLocalDays, startOfLocalDay } from '../time/localDay'
import {
  DEFAULT_DAY_TEMPLATE,
  survivingIntervals,
  templateIntervalsFor,
  type TemplateBlock,
} from './dayTemplate'

export interface DutyEvent {
  /** Local wall time, `HH:MM`, exactly as published. */
  at: string
  label: string
  /** True when this line names you specifically rather than the whole platoon. */
  yours?: boolean
  note?: string
}

export type EndConfidence = 'stated' | 'estimated' | 'unknown'

export interface DutyDay {
  date: LocalDate
  label: string
  events: DutyEvent[]
  /**
   * Time before the first formation that is already gone — PPE on, kit checked, moving.
   * Not in any published schedule and never will be, but it is the difference between
   * "up at 0440" and up at 0345.
   */
  prepMinutes: number
  /**
   * When the day ends. Almost never published, which is the entire planning problem:
   * a day with an unknown end cannot have anything scheduled after it, so the evening
   * block is a hope rather than a plan.
   */
  endsAt: string
  endConfidence: EndConfidence
  note: string
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`bad time: ${hhmm}`)
  }
  return h * 60 + m
}

/**
 * M4 zero range, 2026-08-06. Published verbatim.
 *
 * Two things about this one are yours specifically and both make your day longer than
 * the shooters':
 *
 *  - You draw a truck from the MP at 0645, an hour and a half before the range starts.
 *  - A drawn truck has to go back. Turn-in happens after the range closes, after
 *    everyone else has been released, and it is never on the schedule.
 *
 * So the published day is 0440 to unknown, and your day is 0345 to later than that.
 */
export const M4_RANGE_DAY: DutyDay = {
  date: '2026-08-06',
  label: 'M4 zero range',
  prepMinutes: 55,
  events: [
    { at: '04:40', label: 'PLT formation (everyone)' },
    { at: '05:00', label: 'Chow' },
    {
      at: '06:15',
      label: 'Range personnel to the parking lot with ALL PPE, load vans',
      note: 'The charter drop-off lot.',
    },
    { at: '06:30', label: 'SP to M4 zero range' },
    {
      at: '06:45',
      label: 'Draw trucks from MP — Sawhook/Rodriguez, Briones/Escarcega',
      yours: true,
      note: 'Dispatches already held by the NCOIC. A drawn truck has to be turned back in afterwards.',
    },
    { at: '07:15', label: 'LMTV load-up, shooters with PPE' },
    { at: '07:30', label: 'SP to range' },
  ],
  /**
   * NOT PUBLISHED. A zero range that steps off at 0730 does not finish before the
   * afternoon, and as a driver you are behind the last shooter by however long turn-in
   * takes. 17:00 is a placeholder chosen to be neither optimistic nor dramatic — the
   * honest content of this field is `endConfidence`, not the number.
   */
  endsAt: '17:00',
  endConfidence: 'unknown',
  note:
    'The schedule stops at "SP to range". Everything after that is inference, which is ' +
    'why nothing is scheduled against the afternoon and the evening block is treated as ' +
    'a bonus rather than as capacity.',
}

export const DUTY_DAYS: DutyDay[] = [M4_RANGE_DAY]

export interface DutyWindow {
  /** Minutes from local midnight. Includes prep, so it is earlier than the formation. */
  startMinute: number
  endMinute: number
  hours: number
  /** The published first event, for when you need to show the schedule rather than the model. */
  firstEvent: DutyEvent
}

/** The whole day as one span: from getting up to the estimated release. */
export function dutyWindow(day: DutyDay): DutyWindow {
  const first = day.events[0]
  if (!first) throw new Error(`duty day ${day.date} has no events`)

  const startMinute = minutesOf(first.at) - day.prepMinutes
  const endMinute = minutesOf(day.endsAt)
  return {
    startMinute,
    endMinute,
    hours: Math.round(((endMinute - startMinute) / 60) * 10) / 10,
    firstEvent: first,
  }
}

/**
 * One commitment covering the whole duty day, rather than one per line on the schedule.
 *
 * Seven commitments with gaps between them would let the scheduler slot study into the
 * twenty-five minutes between chow and the parking lot, which is not real time. The day
 * is occupied from the moment it starts.
 */
export function dutyCommitments(zone: IanaZone, days: DutyDay[] = DUTY_DAYS): Commitment[] {
  return days.map((day) => {
    const w = dutyWindow(day)
    const base = startOfLocalDay(zone, day.date).getTime()
    return {
      id: `duty-${day.date}`,
      title: `${day.label} — ${day.events[0]!.at} formation${
        day.endConfidence === 'unknown' ? ', end unknown' : ''
      }`,
      nodeId: null,
      startsAt: new Date(base + w.startMinute * 60_000),
      endsAt: new Date(base + w.endMinute * 60_000),
      allDay: false,
    }
  })
}

/** Is this date a published duty day? */
export function dutyDayFor(date: LocalDate, days: DutyDay[] = DUTY_DAYS): DutyDay | null {
  return days.find((d) => d.date === date) ?? null
}

// ── What a duty day leaves behind ───────────────────────────────────────────

export interface DayCapacity {
  date: LocalDate
  isDutyDay: boolean
  /** Template minutes the day started with. */
  plannedMinutes: number
  /** What is left once the duty window has taken its share. */
  survivingMinutes: number
  /** Blocks erased outright rather than merely shortened. */
  lost: string[]
}

/**
 * How much of the template actually survives one date.
 *
 * The distinction that matters is between a block being SHORTENED and a block being
 * ERASED. A shortened block still happens; an erased one has to be replanned somewhere
 * else, and if it is erased every duty day then it was never capacity at all.
 */
export function dayCapacity(
  zone: IanaZone,
  date: LocalDate,
  template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE,
  days: DutyDay[] = DUTY_DAYS,
): DayCapacity {
  const planned = templateIntervalsFor(zone, date, template)
  const duty = dutyDayFor(date, days)
  const surviving = duty
    ? survivingIntervals(planned, dutyCommitments(zone, [duty]))
    : planned

  const survivingKeys = new Set(surviving.map((i) => i.block.key))
  return {
    date,
    isDutyDay: duty !== null,
    plannedMinutes: planned.reduce((t, i) => t + i.minutes, 0),
    survivingMinutes: surviving.reduce((t, i) => t + i.minutes, 0),
    lost: planned.filter((i) => !survivingKeys.has(i.block.key)).map((i) => i.block.label),
  }
}

export interface WeekCapacity {
  days: DayCapacity[]
  plannedHours: number
  actualHours: number
  /** Blocks that die on EVERY duty day — the ones that were never really capacity. */
  alwaysLost: string[]
}

/**
 * A representative week, treating every weekday as a duty day of the observed shape.
 *
 * That is an assumption and a deliberately blunt one: I have exactly ONE published
 * schedule, and generalising from a single range day to every weekday of pre-mob is a
 * stretch. It is a defensible stretch in one direction only — a range day is a hard
 * day, so this is nearer the floor than the middle. Better a floor you can raise with
 * evidence than a middle nobody measured.
 */
export function representativeWeek(
  zone: IanaZone,
  weekStart: LocalDate,
  reference: DutyDay = M4_RANGE_DAY,
  template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE,
): WeekCapacity {
  const days: DayCapacity[] = []
  const lostCounts = new Map<string, number>()
  let dutyDayCount = 0

  for (let i = 0; i < 7; i++) {
    const date = addLocalDays(weekStart, i)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const isWeekday = dow >= 1 && dow <= 5
    // Same shape as the observed day, moved onto this date.
    const asDuty: DutyDay[] = isWeekday ? [{ ...reference, date }] : []
    const cap = dayCapacity(zone, date, template, asDuty)
    if (cap.isDutyDay) {
      dutyDayCount++
      for (const l of cap.lost) lostCounts.set(l, (lostCounts.get(l) ?? 0) + 1)
    }
    days.push(cap)
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  return {
    days,
    plannedHours: round1(days.reduce((t, d) => t + d.plannedMinutes, 0) / 60),
    actualHours: round1(days.reduce((t, d) => t + d.survivingMinutes, 0) / 60),
    alwaysLost: [...lostCounts.entries()]
      .filter(([, n]) => n === dutyDayCount && dutyDayCount > 0)
      .map(([label]) => label),
  }
}
