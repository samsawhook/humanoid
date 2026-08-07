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
  /** "Tomorrow", sent on the 6th. It was briefly dated 08-06 and collided with RFI day. */
  date: '2026-08-07',
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

/**
 * RFI, EST, ECS and DRC — 2026-08-06. Four parallel tracks off one warning order.
 *
 * Structurally unlike the range day, and the difference is the whole reason a second
 * data point was worth having: this one FINISHES. Fielding and equipment set-up ended
 * in the early afternoon, and the rest of the day was yours. A range day has no such
 * shape — it ends when the last shooter is off the line.
 *
 * So "a pre-mob weekday" is not one thing. Generalising the range day to all five, as
 * the first pass did, was the pessimistic end of a real spread rather than a fair
 * average.
 */
export const RFI_ECS_DAY: DutyDay = {
  date: '2026-08-06',
  label: 'RFI, equipment set-up, DRC',
  /** Wake was 0400 for an 0500 weapon turn-in: an hour, and you recorded it yourself. */
  prepMinutes: 60,
  events: [
    { at: '05:00', label: 'Weapon turn-in at TOK' },
    { at: '05:30', label: 'Breakfast chow', note: 'Eat with urgency — the bus line is first-come.' },
    {
      at: '06:00',
      label: 'RFI: load at the bus outside the DFAC',
      yours: true,
      note: 'Summer PTs (no company shirts), CAC, water source, empty issued duffle.',
    },
    { at: '06:15', label: 'RFI bus departs / EST forms up in the arrival parking lot' },
    { at: '06:30', label: 'DRC returnees load at the DFAC', note: 'Medical folders and a water source.' },
    {
      at: '08:00',
      label: 'ECS party meets SFC Mortenson at the DFAC bus stop',
      yours: true,
      note: 'Assault pack: ACH, gloves, eye and ear pro.',
    },
  ],
  /**
   * OBSERVED, not published — you slept for an hour or two once RFI and equipment
   * set-up were done. That puts release in the early afternoon, and it is the first
   * end time in this file that is not a guess.
   */
  endsAt: '13:30',
  endConfidence: 'estimated',
  note:
    'The only day so far with a real end, and it came from your own account rather than ' +
    'from a schedule. A fielding day finishes; a range day does not.',
}

/**
 * Range again on the Saturday. Same shape as Friday — no published end, drivers behind
 * everyone else — but it costs far more, because Saturday is the only day in the
 * template with a block long enough to hold a full timed practice test.
 *
 * This is the "one lost weekend costs more than a lost week of evenings" case, arriving
 * one day after that was written down as a risk.
 */
export const SATURDAY_RANGE_DAY: DutyDay = {
  ...M4_RANGE_DAY,
  date: '2026-08-08',
  label: 'M4 range — Saturday',
  note:
    'Weekend duty. The published schedule is the Friday one; the cost is different ' +
    'because Saturday carries the 4-hour block and nothing else in the week does.',
}

export const DUTY_DAYS: DutyDay[] = [RFI_ECS_DAY, M4_RANGE_DAY, SATURDAY_RANGE_DAY]

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
  /**
   * Blocks lost on every duty day THAT PLANNED THEM — the ones that were never really
   * capacity.
   *
   * The qualifier matters. Counting "lost on every duty day" full stop made the morning
   * block look survivable the moment a range Saturday appeared, purely because Saturday
   * has no morning block to lose. The question is not how many days killed a block, it
   * is whether a block ever survived a day that offered it.
   */
  alwaysLost: string[]
  /**
   * Atomic blocks lost with NO surviving alternative — a capability genuinely gone for
   * the week, rather than merely one of its slots.
   *
   * Kept out of the hours total on purpose: rolling a lost practice test into "hours
   * gone" makes it look like something an extra evening could replace. But it also has
   * to stop crying wolf. Once Sunday carried a second four-hour block, reporting the
   * lost Saturday as a lost capability would have been false — the test still happens,
   * just a day later.
   */
  capabilitiesLost: string[]
  /** Atomic blocks lost where a fallback survived. Worth knowing, not worth alarm. */
  capabilitiesCovered: string[]
}

/**
 * A representative week, built from every duty-day shape actually observed.
 *
 * The first version used only the range day, which was the pessimistic end of a real
 * spread rather than an average: a fielding day finished at 1330 and a range day has no
 * published end at all. Cycling the observed shapes across the weekdays is still a
 * generalisation from a tiny sample, but it is at least a generalisation from the
 * variety rather than from the worst case.
 *
 * What it does NOT capture is the finding that mattered more than either shape: on the
 * one day with an outcome recorded, all 75 surviving minutes were high-demand LSAT
 * blocks and the day's cognitive ceiling was medium. Time existed; the attention it was
 * reserved for did not. See dayLog.ts — these hours are a ceiling, not a forecast.
 */
export function representativeWeek(
  zone: IanaZone,
  weekStart: LocalDate,
  references: DutyDay[] = [RFI_ECS_DAY, M4_RANGE_DAY],
  template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE,
  known: DutyDay[] = DUTY_DAYS,
): WeekCapacity {
  const days: DayCapacity[] = []
  const lostCounts = new Map<string, number>()
  const offeredCounts = new Map<string, number>()

  for (let i = 0; i < 7; i++) {
    const date = addLocalDays(weekStart, i)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const isWeekday = dow >= 1 && dow <= 5
    /**
     * A REAL duty day on this date wins over the generic shape — including at the
     * weekend. Assuming weekends are free is exactly the assumption that just failed:
     * 2026-08-08 is a range Saturday, and Saturday is the only day carrying a block
     * long enough for a full timed practice test.
     */
    const realDuty = dutyDayFor(date, known)
    // Otherwise cycle the observed shapes, so the week reflects the spread of duty
    // days rather than the worst one.
    const shape = references[i % references.length]!
    const asDuty: DutyDay[] = realDuty ? [realDuty] : isWeekday ? [{ ...shape, date }] : []
    const cap = dayCapacity(zone, date, template, asDuty)
    if (cap.isDutyDay) {
      for (const l of cap.lost) lostCounts.set(l, (lostCounts.get(l) ?? 0) + 1)
      for (const b of templateIntervalsFor(zone, date, template)) {
        offeredCounts.set(b.block.label, (offeredCounts.get(b.block.label) ?? 0) + 1)
      }
    }
    days.push(cap)
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const atomicLabels = new Set(template.filter((b) => b.atomic).map((b) => b.label))
  const atomicLost = [...new Set(days.flatMap((d) => d.lost).filter((l) => atomicLabels.has(l)))]
  // Did ANY atomic block survive the week? If so the capability is covered, not lost.
  const atomicSurvived = days.some(
    (d) =>
      d.survivingMinutes > 0 &&
      templateIntervalsFor(zone, d.date, template).some(
        (i) => i.block.atomic && !d.lost.includes(i.block.label),
      ),
  )
  return {
    capabilitiesLost: atomicSurvived ? [] : atomicLost,
    capabilitiesCovered: atomicSurvived ? atomicLost : [],
    days,
    plannedHours: round1(days.reduce((t, d) => t + d.plannedMinutes, 0) / 60),
    actualHours: round1(days.reduce((t, d) => t + d.survivingMinutes, 0) / 60),
    alwaysLost: [...lostCounts.entries()]
      .filter(([label, n]) => n > 0 && n === offeredCounts.get(label))
      .map(([label]) => label),
  }
}

export interface AtomicSlotCount {
  /**
   * WEEKENDS with at least one surviving long block, not dates.
   *
   * Counting dates double-counted the capability the moment Sunday gained a block of
   * its own: you sit at most one full timed test a weekend, so two four-hour windows on
   * consecutive days is one opportunity with a spare, not two opportunities.
   */
  available: LocalDate[]
  /** Weekends where duty took every long block. */
  lost: LocalDate[]
  /**
   * Dates counted as available only because no duty day is recorded for them yet.
   * The honest caveat: absence of a schedule is not evidence of a free day, and the
   * one weekend actually observed was worked.
   */
  assumedFree: number
}

/**
 * Count the surviving slots for an atomic block between two dates.
 *
 * For the LSAT this is a better readiness measure than hours. Sitting a timed
 * full-length is not something you accumulate out of evenings — it needs one
 * uninterrupted four-hour window, and there is exactly one per week. "How many
 * practice tests can I still take" is therefore a countable integer, and a small one,
 * where "how many hours do I have" is a large number that hides the constraint.
 */
export function atomicSlotsBetween(
  zone: IanaZone,
  from: LocalDate,
  to: LocalDate,
  template: TemplateBlock[] = DEFAULT_DAY_TEMPLATE,
  known: DutyDay[] = DUTY_DAYS,
): AtomicSlotCount {
  // EVERY atomic block, not one named one. There are two now — Saturday and Sunday —
  // and counting only the first would report the week as having lost the capability
  // when the fallback was sitting right there.
  const blocks = template.filter((b) => b.atomic)
  if (blocks.length === 0) throw new Error('template has no atomic blocks')

  // Group the candidate dates into weekends, keyed by the Saturday they belong to.
  const weekends = new Map<LocalDate, { survives: boolean; scheduled: boolean }>()

  for (let date = from; date <= to; date = addLocalDays(date, 1)) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const onThisDay = blocks.filter((b) => b.weekdays.includes(dow))
    if (onThisDay.length === 0) continue

    // Sunday belongs to the weekend that started the day before.
    const key = dow === 0 ? addLocalDays(date, -1) : date
    const entry = weekends.get(key) ?? { survives: false, scheduled: false }

    const duty = dutyDayFor(date, known)
    if (!duty) {
      entry.survives = true
    } else {
      entry.scheduled = true
      const cap = dayCapacity(zone, date, template, [duty])
      if (!onThisDay.every((b) => cap.lost.includes(b.label))) entry.survives = true
    }
    weekends.set(key, entry)
  }

  const available: LocalDate[] = []
  const lost: LocalDate[] = []
  let assumedFree = 0

  for (const [key, entry] of [...weekends.entries()].sort()) {
    if (entry.survives) {
      available.push(key)
      if (!entry.scheduled) assumedFree++
    } else {
      lost.push(key)
    }
  }

  return { available, lost, assumedFree }
}
