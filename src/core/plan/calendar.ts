/**
 * The plan on one calendar: service, the MAcc minimesters, law school, the job hunt and
 * the money milestones, from now to the start of the 2028 school year.
 *
 * One row per thing — no row repeats another. Bars are spans (a window, a term);
 * milestones are points (a deadline, a decision, a start). `estimated` marks dates that
 * are mine, not confirmed: they draw hatched. Sources are noted on each.
 */

import type { LocalDate } from '../types'
import { TIMELINE } from '../money/rates'
import { LSAT_DATES, LSAT_TAKEN } from '../goals/education'
import { COLLECTION_PAY_DATE, MORTGAGE_CATCHUP_LAST } from '../money/obligations'

export type LaneKey = 'service' | 'macc' | 'law' | 'law28' | 'jobs' | 'money'

export const LANES: { key: LaneKey; label: string; color: string; note?: string }[] = [
  { key: 'service', label: 'Service', color: 'var(--series-1)' },
  { key: 'macc', label: 'MAcc — TAMUCC minimesters', color: 'var(--series-7)', note: '7-week terms; 6 of 30 hours done' },
  { key: 'law', label: 'Law school — fall 2027 entry (the plan’s law path)', color: 'var(--series-2)', note: 'LSAT taken 13 Nov' },
  { key: 'law28', label: 'Law school — fall 2028 entry', color: 'var(--series-2)', note: 'the next cycle, applying early' },
  { key: 'jobs', label: 'Job hunt', color: 'var(--series-4)' },
  { key: 'money', label: 'Money', color: 'var(--series-5)' },
]

export interface PlanBar {
  lane: LaneKey
  label: string
  start: LocalDate
  end: LocalDate
  estimated?: boolean
  note?: string
}

export interface PlanPoint {
  lane: LaneKey
  label: string
  date: LocalDate
  estimated?: boolean
  /** A decision rather than a deadline: drawn as an open diamond. */
  decision?: boolean
  note?: string
}

const lsat = (k: string) => LSAT_DATES.find((a) => a.key === k)!

export const PLAN_BARS: PlanBar[] = [
  // ── Service ──
  { lane: 'service', label: 'Deployed', start: TIMELINE.deploymentStart, end: TIMELINE.expectedReturn, estimated: true, note: 'Return is the June read; orders run to ' + TIMELINE.ordersMaxEnd },
  { lane: 'service', label: 'Tax-free (CZTE)', start: TIMELINE.czteStart, end: TIMELINE.czteEnd },
  { lane: 'service', label: 'Home on leave, still paid', start: TIMELINE.expectedReturn, end: TIMELINE.refrad, estimated: true },

  // ── MAcc: 7-week minimesters, at most 2 courses each. Spring I start is yours (13 Jan);
  //    every other boundary is my estimate — check TAMUCC's calendar. ──
  { lane: 'macc', label: 'Spring I — no course (cash)', start: '2027-01-13', end: '2027-03-02', estimated: true },
  { lane: 'macc', label: 'Spring II — catch-up course, needs an A', start: '2027-03-15', end: '2027-05-01', estimated: true, note: '$1,750 out of pocket: $875 on 8 Mar, $875 on 8 Apr. An A restores the 3.00 GPA and Hazlewood.' },
  { lane: 'macc', label: 'Summer I — 2 courses (Hazlewood)', start: '2027-06-01', end: '2027-07-13', estimated: true },
  { lane: 'macc', label: 'Summer II — 2 courses', start: '2027-07-14', end: '2027-08-20', estimated: true },
  { lane: 'macc', label: 'Fall I — 2 courses', start: '2027-08-23', end: '2027-10-12', estimated: true },
  { lane: 'macc', label: 'Fall II — 2 courses, last block', start: '2027-10-18', end: '2027-12-10', estimated: true, note: '24 hours left = 8 courses = four minimesters at 2 each.' },
  { lane: 'macc', label: 'CPA exams', start: '2028-01-01', end: '2028-06-30', estimated: true, note: 'The CPA path’s exam months.' },

  // ── Law, fall 2027 entry: the 2026–27 cycle. LSAT taken remotely 13 Nov; apply as soon
  //    as the score is in — December and January are still workable, February costs. ──
  {
    lane: 'law',
    label: 'Apply — Dec–Jan (late but workable)',
    start: LSAT_TAKEN.scoreExpected,
    end: '2027-01-31',
    note: 'Fine with above-median numbers; scholarship money thins as the weeks go. Have the essays, résumé and letters ready before the score lands.',
  },
  { lane: 'law', label: 'Decisions come back', start: '2027-01-15', end: '2027-04-15', estimated: true },
  {
    lane: 'law',
    label: 'Seat deposits due',
    start: '2027-04-01',
    end: '2027-05-31',
    estimated: true,
    note: 'No deposit before 1 Apr (LSAC guidance; A&M says so outright). Each admit letter gives its own date — last cycle A&M’s was 1 Apr.',
  },
  { lane: 'law', label: '1L', start: '2027-08-16', end: '2028-05-15', estimated: true, note: 'Texas Tech, UH, UNT Dallas or A&M — whichever you choose on the decision date.' },

  // ── Law, fall 2028 entry: the 2027–28 cycle, applying early. ──
  { lane: 'law28', label: 'Retake, only if you want a higher score', start: lsat('apr_2027').testDate, end: '2027-08-31', estimated: true },
  { lane: 'law28', label: 'Apply — the strong months', start: '2027-09-01', end: '2027-11-30', note: 'September–October is the best time in the cycle; November still strong.' },
  { lane: 'law28', label: 'Decisions come back', start: '2027-12-15', end: '2028-04-15', estimated: true },

  // ── Job hunt ──
  { lane: 'jobs', label: 'Set up: alerts, resume, DD-214 + VA letter', start: '2026-11-19', end: '2027-01-31' },
  { lane: 'jobs', label: 'VA claim before discharge (BDD window)', start: '2027-02-01', end: '2027-05-02', note: '180 to 90 days before release on 31 Jul. 30%+ opens noncompetitive hiring.' },
  { lane: 'jobs', label: 'Apply', start: '2027-02-01', end: '2027-06-30' },
  { lane: 'jobs', label: 'Hiring pipeline (3–5 months)', start: '2027-04-01', end: '2027-08-31', estimated: true },
]

export const PLAN_POINTS: PlanPoint[] = [
  // Service
  { lane: 'service', label: 'Home', date: TIMELINE.expectedReturn, estimated: true },
  { lane: 'service', label: 'Off orders', date: TIMELINE.refrad },
  // MAcc
  { lane: 'macc', label: 'MAcc done', date: '2027-12-10', estimated: true },
  // Law 2027
  { lane: 'law', label: 'LSAT taken (remote)', date: LSAT_TAKEN.date },
  { lane: 'law', label: 'Score', date: LSAT_TAKEN.scoreExpected, estimated: true, note: 'About three weeks after the sitting — your LSAC account has the real date.' },
  // Your schools (19 Nov): Texas Tech, UNT Dallas, UH; A&M a reach. Deadlines are the
  // schools' published ones for the last cycle — they rarely move, but confirm on each site.
  { lane: 'law', label: 'Texas A&M (reach) — priority deadline', date: '2027-02-01', estimated: true, note: 'Late deadline 1 Mar; the class can fill before the final date. law.tamu.edu' },
  { lane: 'law', label: 'Texas Tech — deadline', date: '2027-03-01', estimated: true, note: 'Rolling admissions. depts.ttu.edu/law' },
  {
    lane: 'law',
    label: 'UH full-time + UNT Dallas (day or evening) — deadlines',
    date: '2027-03-15',
    estimated: true,
    note: 'UH says its dates do not change year to year. UNT Dallas: one deadline for its full-time day and part-time evening divisions (2025 ABA report), no application fee; you can switch division after the first year.',
  },
  { lane: 'law', label: 'UH part-time evening — deadline', date: '2027-05-15', estimated: true, note: 'The night-law path: UH’s part-time evening JD.' },
  {
    lane: 'law',
    label: 'Retake? Register for the February LSAT',
    date: lsat('feb_2027').registrationDeadline!,
    note: `Only if the score is under target. Sitting ${lsat('feb_2027').testDate}, score ${lsat('feb_2027').scoreRelease} — which pushes applications into the costly weeks.`,
  },
  { lane: 'law', label: 'Decision: which school, or MAcc + job', date: '2027-05-01', decision: true, estimated: true, note: 'Admissions and scholarship offers in hand; seat deposits due around now. Weigh against job offers.' },
  { lane: 'law', label: '1L starts', date: '2027-08-16', estimated: true },
  // Law 2028
  { lane: 'law28', label: 'Decision', date: '2028-04-15', decision: true, estimated: true },
  { lane: 'law28', label: '1L starts', date: '2028-08-14', estimated: true },
  // Jobs
  { lane: 'jobs', label: 'Statement of Service', date: '2027-02-01', estimated: true },
  { lane: 'jobs', label: 'Target start', date: '2027-08-02' },
  // Money
  { lane: 'money', label: 'Mortgage current', date: '2027-01-13', note: `Last catch-up: the ${MORTGAGE_CATCHUP_LAST} cheque.` },
  { lane: 'money', label: 'Caine & Weiner paid', date: COLLECTION_PAY_DATE as LocalDate },
  { lane: 'money', label: 'MAcc course — 1st half', date: '2027-03-08' },
  { lane: 'money', label: 'MAcc course — 2nd half', date: '2027-04-08' },
  { lane: 'money', label: 'Student loan payments resume', date: '2027-08-02', note: 'Nelnet deferment pending.' },
  { lane: 'money', label: 'NordVPN renews — $100/yr', date: '2027-01-28', note: 'Your note, 19 Nov. Cancel before then if you will not need it once home.' },
  {
    lane: 'money',
    label: 'Monarch renews — $106.39/yr',
    date: '2027-10-08',
    estimated: true,
    note: 'On the statements: "Recurring Payment" 8 Oct 2026. The plan runs on the bank now — cancel before it renews?',
  },
]

/** Everything with a date, soonest first, from `today`. */
export function upcoming(today: LocalDate): (PlanPoint & { kind: 'point' | 'start' | 'end' })[] {
  const out: (PlanPoint & { kind: 'point' | 'start' | 'end' })[] = [
    ...PLAN_POINTS.map((p) => ({ ...p, kind: 'point' as const })),
    ...PLAN_BARS.map((b) => ({ lane: b.lane, label: `${b.label} — begins`, date: b.start, estimated: b.estimated, note: b.note, kind: 'start' as const })),
  ]
  return out.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
