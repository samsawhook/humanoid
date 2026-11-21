/**
 * The to-do list: things that actually need doing, by a date, each with the one next step.
 *
 * Kept short on purpose. A thing goes here only if it needs you to act (a call, a letter,
 * a form, a screenshot), not if it is simply happening (autopays, the plan's own transfers
 * — those are generated per payday from the allocation, below the list). Pulled from the
 * briefing's attention items and the open questions in the planner. Tick-offs are kept in
 * the browser; when something is done for good, delete it here.
 */

import type { LocalDate } from './types'

export type TodoArea = 'Money' | 'Debt & credit' | 'School' | 'Army & VA' | 'Planner'

export interface Todo {
  id: string
  title: string
  /** The one next step. */
  next: string
  /** Why it matters, in a line. */
  why: string
  due: LocalDate | null
  area: TodoArea
}

export const TODOS: Todo[] = [
  {
    id: 'nth-ach',
    title: 'Switch Nth to ACH',
    next: 'Set up the $500 ACH from the Bank of America side, or ask Nth for ACH details.',
    why: 'Otherwise the 1 Dec transfer goes as a wire: $30 a month for nothing.',
    due: '2026-11-30',
    area: 'Money',
  },
  {
    id: 'mortgage-oldest',
    title: 'Mortgage catch-up: mark each extra payment “apply to oldest past-due”',
    next: 'With the 1 Dec pay (~27 Nov): pay October’s payment and pick “oldest past-due” — not principal.',
    why: 'Two behind. Applied to principal, it leaves the delinquency in place.',
    due: '2026-11-27',
    area: 'Money',
  },
  {
    id: 'nelnet-deferment',
    title: 'Call Nelnet — military service deferment',
    next: 'Ask for the deferment and the 0% interest benefit for imminent-danger service.',
    why: 'The plan assumes no $75.83 payments from Feb; forbearance ends 10 Feb.',
    due: '2026-12-15',
    area: 'Debt & credit',
  },
  {
    id: 'ut-loan',
    title: 'Find the UT loan ($9,907) at the Dept of Education',
    next: 'studentaid.gov → My Aid: find its type and servicer (myeddebt.ed.gov if in default).',
    why: 'Then dispute the UT tradeline and ask ED for deferment / Perkins cancellation.',
    due: '2026-12-15',
    area: 'Debt & credit',
  },
  {
    id: 'chase-citi-capone',
    title: 'Chase, Citi, Capital One — confirm who is paying',
    next: 'Check the other accounts or call each: is the $110 Chase agreement and the minimums going out?',
    why: 'Four months of statements show no payment; the Chase agreement may have lapsed.',
    due: '2026-12-01',
    area: 'Debt & credit',
  },
  {
    id: 'scra',
    title: 'SCRA 6% interest-cap letters — if not already sent',
    next: 'Orders + one letter each: Avant first, then the open cards. Not Goldman or PSECU.',
    why: 'Interest above 6% since 31 Jul is forgiven, not deferred — every month it slips costs money.',
    due: '2026-12-15',
    area: 'Debt & credit',
  },
  {
    id: 'westlake-title',
    title: 'Westlake — lien release and title',
    next: 'Watch for the title; call Westlake if nothing by mid-December. Keep the payoff letter.',
    why: 'Paid off 18 Nov. The title proves it, and you will sell or trade the Expedition.',
    due: '2026-12-15',
    area: 'Debt & credit',
  },
  {
    id: 'caine-letter',
    title: 'Caine & Weiner — validation and pay-for-delete letter',
    next: 'Write for validation and a letter saying it will be reported paid (ask for deletion).',
    why: 'Pay the $475 on 15 Feb only against that letter.',
    due: '2027-01-31',
    area: 'Debt & credit',
  },
  {
    id: 'nfcu-letter',
    title: 'NFCU — letter confirming the mortgage is current',
    next: 'Once the 15 Jan payment posts, ask for it in writing.',
    why: 'For the review file.',
    due: '2027-01-31',
    area: 'Money',
  },
  {
    id: 'macc-course',
    title: 'MAcc catch-up course — Spring II',
    next: 'Register; $875 on 8 Mar and $875 on 8 Apr. It has to be an A.',
    why: 'Brings the GPA to 3.00 and restores Hazlewood.',
    due: '2027-02-15',
    area: 'School',
  },
  {
    id: 'sdp',
    title: 'Open the SDP account',
    next: 'Through finance while in theatre; nothing needs to go in yet.',
    why: '10% guaranteed — any windfall (back pay, a refund) can earn it until you leave.',
    due: '2027-01-15',
    area: 'Army & VA',
  },
  {
    id: 'reenlist',
    title: 'Re-enlistment bonus — amount and schedule',
    next: 'Ask the retention NCO: how much, and is it lump-sum or half up front?',
    why: 'The planner assumes $10k, paid at once, Sep 2027.',
    due: null,
    area: 'Army & VA',
  },
  {
    id: 'va-claim',
    title: 'VA claim for the new rating',
    next: 'File through BDD 180–90 days before release, so the rating lands soon after you are home.',
    why: 'The planner pays 10% until ~4 months home, then 30% with back pay.',
    due: '2027-03-01',
    area: 'Army & VA',
  },
  {
    id: 'sommer-balances',
    title: 'Send Sommer’s checking and savings balances',
    next: 'Two numbers, roughly.',
    why: 'The Sommer and Combined views assume she starts at $0.',
    due: null,
    area: 'Planner',
  },
  {
    id: 'screenshots',
    title: 'Bank screenshot after each payday',
    next: 'Joint checking, the pending and posted list.',
    why: 'Keeps the paycheck cards tied to the bank.',
    due: null,
    area: 'Planner',
  },
]
