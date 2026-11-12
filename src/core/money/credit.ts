/**
 * Credit recovery — for the security review, not for borrowing.
 *
 * Your framing, 2026-11-12: credit recovery is a goal "for the purpose of military
 * security reviews rather than for its own / more debt sake". That changes what success
 * means. A score is not the target and no new credit is wanted. What an adjudicator weighs
 * under Guideline F (Financial Considerations) is:
 *
 *  - Is anything delinquent RIGHT NOW?
 *  - Is any FEDERAL debt in default? (A distinct, heavily weighted concern.)
 *  - For every derogatory account: is it paid, settled, or under a written plan being
 *    followed — a good-faith effort, with paper to prove it?
 *  - Is the person getting financial counseling, with clear signs the problem is under
 *    control? (You are — Magellan Federal PFC sessions. Keep the emails.)
 *  - Did conditions outside your control contribute (mobilisation, deployment)?
 *
 * Each tradeline below is scored against exactly those questions. Transcribed from the
 * Credit Karma (TransUnion) screens you shared, 2026-11-12; no account numbers kept.
 *
 * NOT LEGAL ADVICE. The limitations-period points are consequential: take the charge-offs
 * to JAG Legal Assistance (free) before contacting those creditors at all.
 *
 * Pure data plus pure functions.
 */

import type { LocalDate } from '../types'

export type ReviewStatus =
  /** Paid as agreed or closed clean. Helps; nothing to do. */
  | 'clean'
  /** Past due now. The first thing a reviewer looks for. */
  | 'delinquent'
  /** Federal debt past due — on the road to default. Weighted heavily. */
  | 'federal_delinquent'
  /** With a collection agency. Needs a written resolution. */
  | 'collections'
  /** Charged off. Needs a documented decision, ideally with JAG advice on file. */
  | 'charged_off'
  /** Was a problem; now current and staying current. Mitigated by the record. */
  | 'recovering'

export interface Tradeline {
  key: string
  creditor: string
  kind: string
  balance: number
  status: ReviewStatus
  /** What the report says, in a line. */
  reported: string
  /** The one action that moves it to `clean` or `recovering`, and the paper to keep. */
  action: string
  /** When that action should be done by. */
  by: LocalDate
  /** Key into debts.ts, where the balance also lives. */
  debtKey?: string
}

export const TRADELINES: Tradeline[] = [
  {
    key: 'nelnet',
    creditor: 'Dept of Education / Nelnet',
    kind: 'Federal student loan',
    balance: 7900.12,
    status: 'federal_delinquent',
    reported:
      '120+ days late; last payment 6 Feb 2025; 7× 90+ days late in 2026. Not yet in default ' +
      'or collections — federal loans default at 270 days.',
    action:
      'Before 10 Dec: military service deferment + 0% interest (imminent-danger area) + ' +
      'forbearance on the $974.60 past due. Keep the written confirmation it is current. The ' +
      'Nov SLRP payment ($20k+) went to principal and did not cure the past due — and a ' +
      'defaulted loan can lose SLRP eligibility, so this protects the next payment too.',
    by: '2026-12-10',
    debtKey: 'student_loan',
  },
  {
    key: 'ut_loan',
    creditor: 'University of Texas',
    kind: 'Student loan (likely Perkins — confirm)',
    balance: 11082,
    status: 'collections',
    reported:
      'Placed for collection; closed 7 Apr 2026. Was current Jul 2025–Feb 2026, late Mar 2026, ' +
      'derogatory Apr–Jul. $129/mo, 120-month term from 2015.',
    action:
      'Call UT Student Loan Collections: ask (1) is this a Federal Perkins loan, (2) military ' +
      'service deferment, (3) Perkins cancellation for service in an imminent-danger area, ' +
      '(4) rehabilitation or a written payment plan, (5) the balance after the Nov SLRP ' +
      'payment. Ask your SLRP manager whether a loan in collection still qualifies. A ' +
      'school-held federal loan in collection reads as federal debt to a reviewer.',
    by: '2026-12-15',
    debtKey: 'ut_loan',
  },
  {
    key: 'mortgage',
    creditor: 'Navy Federal (mortgage)',
    kind: 'Mortgage',
    balance: 164896,
    status: 'recovering',
    reported:
      '30–59 days late as of 27 Oct — one payment behind. 15/11/6 times 30/60/90 late since ' +
      '2023. "Active military duty" and a dispute noted.',
    action:
      'One extra full payment on 15 Dec makes it current. Then never late again — and ask ' +
      'NFCU for a letter confirming it is current.',
    by: '2026-12-15',
  },
  {
    key: 'upgrade',
    creditor: 'Upgrade Inc (shown in Monarch as PSECU)',
    kind: 'Personal loan',
    balance: 10922,
    status: 'charged_off',
    reported:
      'Charge-off, profit and loss write-off. Last payment 17 Oct 2022; closed 31 Aug 2024. ' +
      'Previously sued and dismissed.',
    action:
      'JAG Legal Assistance first: confirm the Texas limitations period and whether any ' +
      'payment or written acknowledgment would revive it. Then decide — leave it, or a ' +
      'written settlement — and keep the JAG memo either way. Do not call the creditor first.',
    by: '2027-01-31',
    debtKey: 'psecu',
  },
  {
    key: 'goldman',
    creditor: 'Goldman Sachs',
    kind: 'Card',
    balance: 22730,
    status: 'charged_off',
    reported: 'Not in these screens. Previously sued and dismissed.',
    action: 'Same JAG visit as Upgrade. One documented decision covering both.',
    by: '2027-01-31',
    debtKey: 'goldman',
  },
  {
    key: 'avant',
    creditor: 'Avant',
    kind: 'Personal loan',
    balance: 4509,
    status: 'recovering',
    reported: 'Current, in good standing ($4,509, 31 Oct). Late Jan–Apr 2026; on time since May.',
    action: 'Keep paying on time. SCRA 6% letter (opened May 2025, before active duty).',
    by: '2026-12-01',
    debtKey: 'avant',
  },
  {
    key: 'carecredit',
    creditor: 'Synchrony / CareCredit',
    kind: 'Card',
    balance: 0,
    status: 'clean',
    reported: 'Closed by credit grantor Apr 2020; never late.',
    action: 'Nothing.',
    by: '2026-11-12',
  },
]

/** The bar a reviewer applies. Every one of these must be true. */
export interface ReviewReadiness {
  delinquentNow: number
  federalDelinquent: number
  inCollections: number
  chargedOffUndocumented: number
  ready: boolean
}

export function reviewReadiness(lines: Tradeline[] = TRADELINES): ReviewReadiness {
  const count = (s: ReviewStatus) => lines.filter((l) => l.status === s).length
  const delinquentNow = count('delinquent')
  const federalDelinquent = count('federal_delinquent')
  const inCollections = count('collections')
  const chargedOffUndocumented = count('charged_off')
  return {
    delinquentNow,
    federalDelinquent,
    inCollections,
    chargedOffUndocumented,
    ready: delinquentNow + federalDelinquent + inCollections + chargedOffUndocumented === 0,
  }
}

/** The paper file to keep for the review — in the order you will be asked for it. */
export const REVIEW_FILE: string[] = [
  'Magellan Federal financial counseling — dates of sessions and the budget you submitted',
  'Nelnet: deferment approval and a statement showing the loan current',
  'UT: loan type confirmation, post-SLRP balance, and the deferment / cancellation / payment-plan letter',
  'SLRP: each payment notice — the Nov 2026 one was $20k+. Evidence the debt is being paid down',
  'NFCU: letter confirming the mortgage is current',
  'JAG Legal Assistance memo on Upgrade and Goldman, and any settlement letters',
  'SCRA letters sent and creditor responses',
  'This budget and plan, showing every bill paid while deployed',
]
