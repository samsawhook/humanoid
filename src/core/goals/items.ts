/**
 * Executable work, seeded in code until the schema is migrated.
 *
 * These are the actions the LSAT blitz decomposes into, plus the fixed commitments
 * that eat the day first. Once the database exists this becomes the seed script; the
 * shapes are already the core types, so nothing downstream changes.
 */

import type { Commitment, Item } from '../types'
import { TIMELINE } from '../money/rates'

const at = (iso: string) => new Date(iso)

/**
 * Recurring study work for the pre-mob blitz.
 *
 * Every title states an OUTPUT — a section drilled, a test taken, an error log
 * reviewed — never "study for an hour". Hours are the estimated cost of producing the
 * output and get corrected by measurement. See LIFE_DASH.md D2.
 */
export const ITEMS: Item[] = [
  {
    id: 'lsat_diagnostic',
    nodeId: 'lsat',
    milestoneId: 'm_lsat_diag',
    title: 'Sit a full timed diagnostic PT, scored',
    effortMinutes: 210,
    effortConfidence: 'high',
    dueAt: at('2026-08-09T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    autopilotCritical: false,
    priorityHint: 40,
  },
  {
    id: 'lsac_military_exception',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'File LSAC remote-testing exception (deployed active duty)',
    effortMinutes: 90,
    effortConfidence: 'low',
    dueAt: at('2026-08-20T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    /**
     * Pinned. Without the exception there is no deployed sitting at all, the approval
     * takes time, and it can only sensibly be filed from stateside. Missing it
     * forecloses every administration after September.
     */
    autopilotCritical: true,
    priorityHint: 100,
  },
  {
    id: 'lsat_lr_drill',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'Logical Reasoning: drill one question type to 85% untimed',
    effortMinutes: 90,
    effortConfidence: 'medium',
    dueAt: null,
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    autopilotCritical: false,
    priorityHint: 10,
  },
  {
    id: 'lsat_rc_drill',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'Reading Comp: one passage set, annotated and reviewed',
    effortMinutes: 75,
    effortConfidence: 'medium',
    dueAt: null,
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    autopilotCritical: false,
    priorityHint: 8,
  },
  {
    id: 'lsat_error_log',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'Error log: write up every miss from today into a named failure mode',
    effortMinutes: 30,
    effortConfidence: 'high',
    dueAt: null,
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    autopilotCritical: false,
    priorityHint: 12,
  },
  {
    id: 'lsat_register_decision',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'Decide October sitting: real attempt, paid diagnostic, or skip',
    effortMinutes: 45,
    effortConfidence: 'high',
    dueAt: at('2026-08-26T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'fixed',
    status: 'todo',
    autopilotCritical: true,
    priorityHint: 90,
  },
  {
    id: 'verify_nov_lsat',
    nodeId: 'lsat',
    milestoneId: null,
    title: 'Confirm November LSAT date and registration deadline on LSAC',
    effortMinutes: 20,
    effortConfidence: 'high',
    dueAt: at('2026-08-12T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    autopilotCritical: false,
    priorityHint: 60,
  },
  {
    id: 'czte_allocation_decision',
    nodeId: 'czte_window',
    milestoneId: 'm_czte_decide',
    title: 'Write the CZTE allocation decision into the decision log',
    effortMinutes: 120,
    effortConfidence: 'medium',
    dueAt: at('2026-09-03T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    autopilotCritical: false,
    priorityHint: 70,
  },
  {
    id: 'confirm_hazlewood',
    nodeId: 'macc_coursework',
    milestoneId: null,
    title: 'Confirm Hazlewood vs Chapter 33 sequencing with the TAMU-CC certifying official',
    effortMinutes: 45,
    effortConfidence: 'low',
    dueAt: at('2026-08-28T23:59:00Z'),
    earliestStartAt: null,
    dateFlexibility: 'elastic',
    status: 'todo',
    autopilotCritical: false,
    priorityHint: 50,
  },
]

/**
 * Fixed commitments. These consume the day before anything else is allocated.
 *
 * Placeholders where I do not have your actual schedule — pre-mob days are almost
 * certainly fuller than this, and that is the single biggest reason the blitz numbers
 * could be optimistic.
 */
export const COMMITMENTS: Commitment[] = [
  {
    id: 'premob_duty_weekday',
    title: 'Pre-mob duty day (placeholder — replace with the real schedule)',
    nodeId: 'service',
    startsAt: at('2026-08-05T13:00:00Z'), // 08:00 CDT
    endsAt: at('2026-08-05T22:00:00Z'), // 17:00 CDT
    allDay: false,
  },
  {
    id: 'premob_duty_thu',
    title: 'Pre-mob duty day (placeholder)',
    nodeId: 'service',
    startsAt: at('2026-08-06T13:00:00Z'),
    endsAt: at('2026-08-06T22:00:00Z'),
    allDay: false,
  },
  {
    id: 'premob_duty_fri',
    title: 'Pre-mob duty day (placeholder)',
    nodeId: 'service',
    startsAt: at('2026-08-07T13:00:00Z'),
    endsAt: at('2026-08-07T22:00:00Z'),
    allDay: false,
  },
  {
    id: 'ship_out',
    title: 'Ship out — CZTE and IDP begin',
    nodeId: 'service',
    startsAt: at(`${TIMELINE.deploymentStart}T00:00:00Z`),
    endsAt: at(`${TIMELINE.deploymentStart}T23:59:00Z`),
    allDay: true,
  },
]
