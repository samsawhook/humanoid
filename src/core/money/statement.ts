/**
 * One paycheck as an income statement, from GROSS pay down to the change in cash, plus
 * what it does to the balance sheet.
 *
 *   Gross income
 *   − Deduction expenses (taxes, FICA, SGLI, the 1st/15th pay-timing shift)
 *   = Net income
 *   − Home, Car, Wife & Kids, Personal spending, Debt payments
 *   = Free cash flow
 *   − Investing (your 5% TSP — withheld from pay — and Nth)
 *   = Net cash: change to checking + change to savings
 *
 * The identity is exact: every dollar of gross lands in exactly one line. The TSP match
 * is shown under Investing but is NOT cash from your pay, so it sits outside the totals
 * and appears again only in the balance-sheet impact.
 *
 * Spending dated between this payday and the next (a gift, the course, an emergency) is
 * this paycheck's money, so it is booked here. Spending cuts reduce Personal local.
 *
 * Pure: an Allocation (and the next one) in, a statement out.
 */

import type { Allocation } from './allocation'
import { DEPLOYED_ACTUALS } from './household'
import { ACTUALS, type Actual } from './actuals'
import { CARD_ACCOUNTS, CLOSED_ACCOUNTS_LABEL, PAYMENT_INFO, SETUP_TODOS, SPENDING_INFO, scheduledFor, type PaymentInfo, type Scheduled } from './execution'
import { DEBTS, minimumPayment } from './debts'
import { PHONE_BILL, PHONE_ROAMING_NOV, phoneBillOn, subscriptionsOn, type TechItem } from './tech'
import type { LocalDate } from '../types'

/** Your regular transfer for the nanny; anything above it on that line is the top-up. */
export const NANNY_REGULAR = 1000

/** Rough principal share of a regular mortgage payment (5.75% est., ~$163k). For the balance-sheet line only. */
export const MORTGAGE_PRINCIPAL_EST = 180

export interface StatementLine {
  key: string
  label: string
  amount: number
  /** Not cash from your pay (the TSP match): shown, not totalled. */
  nonCash?: boolean
  /** Paid so far, from the actuals. */
  spent?: number
  txns: Actual[]
  info?: PaymentInfo
  scheduled?: Scheduled
  byHand?: boolean
  date?: LocalDate
  note?: string
  short?: number
  /** A one-time set-up task for this line on this paycheck. */
  todo?: string
  /** One row per account behind the line (the card minimums). */
  accounts?: AccountRow[]
  /** Bills behind the line that the budget does not cover (subscriptions over budget). */
  unfunded?: number
}

export interface AccountRow {
  key: string
  name: string
  /** Estimated minimum. */
  minimum: number
  paid: number
  txns: Actual[]
  status: 'paid' | 'todo' | 'check' | 'later' | 'auto' | 'part'
  /** One sentence: what happened or what to do. */
  text: string
  payAt: string
}

export interface StatementSection {
  key: string
  label: string
  lines: StatementLine[]
  total: number
}

export interface PaycheckStatement {
  payday: LocalDate
  gross: StatementSection
  deductions: StatementSection
  netIncome: number
  spending: StatementSection[]
  freeCashFlow: number
  investing: StatementSection
  netCash: StatementSection
  /** Changes to what you own and owe this paycheck (approximate where marked). */
  balanceSheet: StatementSection
  /** Take-home as DFAS pays it — a check on the arithmetic. */
  takeHome: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (ls: StatementLine[]) => r2(ls.filter((l) => !l.nonCash).reduce((s, l) => s + l.amount, 0))

/** Where each plan line belongs. Lines not listed fall into "Other". */
const LINE_HOME: Record<string, string> = {
  phone: 'tech',
  phone_home: 'tech',
  phone_nov: 'tech',
  tmobile_past_due: 'tech',
  subscriptions: 'tech',
  subscriptions_mid: 'tech',
  nordvpn: 'tech',
  hvac_plan: 'home',
  mortgage_current: 'home',
  arrears_catchup_payment: 'home',
  mortgage_arrears: 'home',
  auto_liability: 'car',
  car_payoff_now: 'car',
  car_payoff: 'car',
  support_home_deployed: 'sent',
  nanny_topup: 'sent',
  support_home_extras: 'sent',
  support_home_extras_2027: 'sent',
  christmas: 'sent',
  boat: 'personal',
  card_minimums_open: 'debt',
  card_minimums_closed: 'debt',
  avant_payment: 'debt',
  avant_past_due: 'debt',
  debt_agreements: 'debt',
  student_loan_payment: 'debt',
  late_payments: 'debt',
  debt_paydown_open: 'debt',
  debt_paydown_closed: 'debt',
  nth_investments: 'invest',
  sdp: 'invest',
  future_fund: 'invest',
  emergency_starter: 'save',
  emergency_fund: 'save',
}

/** "Your own spending (deployed)" broken into the categories you think in. */
const LIVING_SPLIT: { sub: string; label: string; section: string; keys: string[] }[] = [
  { sub: 'fuel', label: 'Fuel', section: 'car', keys: ['gas'] },
  { sub: 'entertainment', label: 'Entertainment & outings', section: 'personal', keys: ['entertainment'] },
  {
    sub: 'personal_local',
    label: 'Personal local (PX, food, shopping)',
    section: 'personal',
    keys: ['personal', 'restaurants', 'clothing', 'business', 'financial_fees'],
  },
]

/** One-offs by key prefix. */
const ONE_OFF_HOME: [RegExp, string, string][] = [
  [/^macc_/, 'personal', 'Education'],
  [/^anniversary_|^gift_/, 'sent', 'Gifts'],
  [/^geico_start/, 'car', ''],
  [/^emergency_/, 'emergency', ''],
]

const SECTION_LABEL: Record<string, string> = {
  home: 'Home',
  car: 'Car',
  sent: 'Wife & Kids',
  personal: 'Personal spending',
  tech: 'Tech',
  debt: 'Debt payments',
  emergency: 'Emergencies (assumed)',
  other: 'Other',
}

function txnsFor(payday: LocalDate, key: string, sub?: string, actuals: Actual[] = ACTUALS): Actual[] {
  return actuals
    .filter((a) => a.payday === payday && (a.lineKey === key || a.oneOffKey === key) && (sub ? a.sub === sub : !a.sub || a.lineKey !== 'living_deployed'))
    .sort((x, y) => (x.date < y.date ? -1 : 1))
}

const spentOf = (t: Actual[]) => r2(t.reduce((s, a) => s + a.amount, 0))

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function niceDate(d: string): string {
  const t = new Date(d + 'T12:00:00Z')
  return `${DOW[t.getUTCDay()]} ${t.getUTCDate()} ${MON3[t.getUTCMonth()]}`
}

const ord = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`

/** The items behind a Tech line: each subscription, or the parts of the phone bill. */
function techRowsFor(key: string, payday: LocalDate, txns: Actual[]): AccountRow[] | undefined {
  const sub = (i: TechItem): AccountRow => {
    const t = i.match ? txns.filter((x) => i.match!.test(x.description)) : []
    const paid = spentOf(t)
    return {
      key: i.key,
      name: i.name,
      minimum: i.amount,
      paid,
      txns: t,
      status: paid > 0 ? 'paid' : 'auto',
      text:
        paid > 0
          ? `Paid $${paid.toFixed(2)} on ${niceDate(t.at(-1)!.date)}`
          : `${i.what}. Drafts ~${ord(i.day ?? 1)}; statements: ${i.seen ?? '—'}.${i.note ? ' ' + i.note : ''}`,
      payAt: '',
    }
  }
  const part = (i: TechItem): AccountRow => ({
    key: i.key,
    name: i.name,
    minimum: i.amount,
    paid: 0,
    txns: [],
    status: 'part',
    text: `${i.what}${i.note ? '. ' + i.note : ''}`,
    payAt: '',
  })
  if (key === 'subscriptions') return subscriptionsOn(payday).filter((i) => i.payday === 'first').map(sub)
  if (key === 'subscriptions_mid') return subscriptionsOn(payday).filter((i) => i.payday === 'fifteenth').map(sub)
  if (key === 'phone_nov') return [...PHONE_BILL.filter((i) => i.key !== 'pass'), PHONE_ROAMING_NOV].map(part)
  if (key === 'phone' || key === 'phone_home') return phoneBillOn(payday).map(part)
  return undefined
}

export function paycheckStatement(a: Allocation, next: Allocation | undefined, actuals: Actual[] = ACTUALS): PaycheckStatement {
  const payday = a.paycheck.scheduledDate
  const p = a.paycheck

  // ── Gross and deductions ──
  const gross: StatementSection = {
    key: 'gross',
    label: 'Gross income',
    lines: p.lines.map((l) => ({ key: l.key, label: l.label, amount: l.amount, txns: [] })),
    total: r2(p.gross),
  }
  const tspEmployee = p.deductions.find((d) => d.key === 'tsp')?.amount ?? 0
  const ss = r2(p.fica * (6.2 / 7.65))
  const dLines: StatementLine[] = [
    { key: 'fed', label: p.czte ? 'Federal income tax (CZTE: $0)' : 'Federal income tax', amount: r2(p.federalTax), txns: [] },
    { key: 'fica_ss', label: 'FICA — Social Security', amount: ss, txns: [] },
    { key: 'fica_med', label: 'FICA — Medicare', amount: r2(p.fica - ss), txns: [] },
    ...p.deductions
      .filter((d) => d.key !== 'tsp')
      .map((d) => ({ key: d.key, label: d.label, amount: d.amount, txns: [] })),
  ]
  if (Math.abs(p.splitAdjustment ?? 0) > 0.005) {
    dLines.push({
      key: 'split',
      label: 'Pay timing (DFAS pays more on the 1st, less on the 15th)',
      amount: r2(-(p.splitAdjustment ?? 0)),
      txns: [],
    })
  }
  const deductions: StatementSection = { key: 'deductions', label: 'Deduction expenses', lines: dLines, total: sum(dLines) }
  const netIncome = r2(gross.total - deductions.total)

  // ── Spending ──
  const sections = new Map<string, StatementLine[]>()
  const push = (sec: string, line: StatementLine) => {
    if (!sections.has(sec)) sections.set(sec, [])
    sections.get(sec)!.push(line)
  }
  const investLines: StatementLine[] = [
    {
      key: 'tsp',
      label: 'TSP — your 5% of base pay (Roth, withheld)',
      amount: tspEmployee,
      // Withheld at source: it has gone the moment the pay lands.
      spent: tspEmployee,
      txns: [],
      note: (() => {
        const base = p.lines.find((l) => l.key === 'base_pay')?.amount ?? 0
        return base > 0
          ? `5% of base pay ($${base.toFixed(2)}), not of gross: BAH, BAS, FSA and the danger pays aren't TSP-eligible unless you elect them, so it shows as ${((tspEmployee / p.gross) * 100).toFixed(1)}% of gross. Withheld by DFAS before take-home.`
          : 'Withheld by DFAS before take-home.'
      })(),
    },
    {
      key: 'tsp_match',
      label: 'TSP — 5% match on base pay (from the Army, not your pay)',
      amount: tspEmployee,
      nonCash: true,
      txns: [],
    },
  ]
  let toSavings = 0

  const live = actuals.some((x) => x.payday === payday)
  const baseLine = (key: string, label: string, amount: number, short = 0, sub?: string): StatementLine => {
    const txns = txnsFor(payday, key, sub, actuals)
    const cards = CARD_ACCOUNTS.filter((c) => c.line === key)
    if (cards.length) {
      const accounts: AccountRow[] = cards.map((c) => {
        const t = txns.filter((x) => c.match.test(x.description))
        const paid = spentOf(t)
        const minimum = minimumPayment(DEBTS.find((d) => d.key === c.key)!)
        const est = `the minimum shown in the app (~$${minimum} est.)`
        let status: AccountRow['status']
        let text: string
        if (paid > 0) {
          status = 'paid'
          text = `Paid ${'$' + paid.toFixed(2)} on ${niceDate(t.at(-1)!.date)}`
        } else if (c.autopay) {
          // The first autopay date on or after this paycheck is spendable.
          const sp = new Date(a.paycheck.payDate + 'T12:00:00Z')
          sp.setUTCDate(sp.getUTCDate() - 4)
          const d = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth() + (sp.getUTCDate() > c.autopay.day ? 1 : 0), c.autopay.day, 12))
          status = 'auto'
          text = `Autopay $${c.autopay.amount} on ${niceDate(d.toISOString().slice(0, 10))} — nothing to do.${live && c.last ? ` Last payment: ${c.last}.` : ''}`
        } else if (c.unseen) {
          status = 'check'
          text =
            c.key === 'chase'
              ? `${c.unseen} Open the app: confirm the $${minimum} plan payment is drafting, and from which account.`
              : `${c.unseen} Open the app — if a minimum is due, pay it (~$${minimum} est.) from WF Joint Checking.`
        } else if (live) {
          status = 'todo'
          text = `Not paid yet this month. Pay ${est}.${c.last ? ` Last payment: ${c.last}.` : ''}`
        } else {
          status = 'later'
          text = `Pay ${est} — ${c.when}.`
        }
        return { key: c.key, name: c.name, minimum: c.autopay?.amount ?? minimum, paid, txns: t, status, text, payAt: c.payAt }
      })
      return {
        key,
        label,
        amount: r2(amount),
        spent: spentOf(txns),
        txns: [],
        info: PAYMENT_INFO[key],
        short,
        accounts,
      }
    }
    const techItems = techRowsFor(key, payday, txns)
    const itemsTotal = techItems && key.startsWith('subscriptions') ? r2(techItems.reduce((t, i) => t + i.minimum, 0)) : 0
    const unfunded = r2(Math.max(0, itemsTotal - amount))
    return {
      key: sub ?? key,
      label,
      amount: r2(amount),
      ...(techItems ? { accounts: techItems } : {}),
      ...(unfunded > 0
        ? { unfunded, note: `The items come to $${itemsTotal.toFixed(2)}; the budget is $${r2(amount).toFixed(2)}. $${unfunded.toFixed(2)} is not covered — cut something or it comes out of checking.` }
        : {}),
      spent: spentOf(txns),
      txns,
      info: sub ? SPENDING_INFO[sub] : PAYMENT_INFO[key],
      scheduled: scheduledFor(key, payday),
      short,
      todo: SETUP_TODOS.find((t) => t.key === key && t.payday === payday)?.text,
    }
  }

  // Spending cuts between this payday and the next come off Personal local.
  const cuts = r2((next?.oneOffs ?? []).filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0))

  for (const l of a.lines) {
    if (l.allocated <= 0 && l.shortfall <= 0) continue
    const sec = LINE_HOME[l.key] ?? (l.key.startsWith('lawn_') ? 'home' : l.key === 'living_deployed' ? 'living' : 'other')
    if (sec === 'save') {
      toSavings += l.allocated
      continue
    }
    if (sec === 'invest') {
      investLines.push(baseLine(l.key, l.label, l.allocated, l.shortfall))
      continue
    }
    if (l.key === 'living_deployed') {
      const monthly = DEPLOYED_ACTUALS.filter((d) => d.key !== 'phone' && d.key !== 'home_improvement' && d.key !== 'subscriptions').reduce((s, d) => s + d.monthly, 0)
      for (const part of LIVING_SPLIT) {
        const share = DEPLOYED_ACTUALS.filter((d) => part.keys.includes(d.key)).reduce((s, d) => s + d.monthly, 0) / monthly
        let amt = l.allocated * share
        if (part.sub === 'personal_local') amt -= cuts
        const line = baseLine('living_deployed', part.label, amt, 0, part.sub)
        if (part.sub === 'personal_local' && cuts > 0) line.note = `After a ${'$' + cuts.toFixed(2)} spending cut this period.`
        push(part.section, line)
      }
      continue
    }
    const label =
      l.key === 'support_home_extras' || l.key === 'support_home_extras_2027'
        ? 'Supplemental'
        : l.key === 'christmas'
          ? 'Supplemental — Christmas'
          : l.label
    push(sec, { ...baseLine(l.key, label, l.allocated, l.shortfall), byHand: l.execution === 'manual' })
  }

  // One-offs between this payday and the next: this paycheck's money.
  for (const o of next?.oneOffs ?? []) {
    if (o.amount > 0) continue // cuts, handled above
    const [, sec, prefix] = ONE_OFF_HOME.find(([re]) => re.test(o.key)) ?? [null, 'personal', '']
    const txns = txnsFor(payday, o.key, undefined, actuals)
    push(sec as string, {
      key: o.key,
      label: prefix ? `${prefix} — ${o.label.replace(/^4th anniversary — /, 'anniversary ')}` : o.label,
      amount: r2(-o.amount),
      spent: spentOf(txns),
      txns,
      date: o.date,
      byHand: true,
    })
  }
  // An emergency drawn from savings: the draw is a savings outflow, not more spending.
  const draws = r2((next?.draws ?? []).reduce((s, d) => s + d.amount, 0))

  // Citi, Capital One and the Chase plan are one line: closed accounts. Citi and Capital
  // One fall on the 15th, Chase on the 1st, so each paycheck shows the ones it pays.
  const debtLines = sections.get('debt')
  if (debtLines) {
    const cl = debtLines.find((l) => l.key === 'card_minimums_closed')
    const ch = debtLines.find((l) => l.key === 'debt_agreements')
    if (cl || ch) {
      const merged: StatementLine = {
        ...(cl ?? ch)!,
        key: 'closed_accounts',
        label: CLOSED_ACCOUNTS_LABEL,
        amount: r2((cl?.amount ?? 0) + (ch?.amount ?? 0)),
        spent: r2((cl?.spent ?? 0) + (ch?.spent ?? 0)),
        short: r2((cl?.short ?? 0) + (ch?.short ?? 0)) || undefined,
        accounts: [...(cl?.accounts ?? []), ...(ch?.accounts ?? [])],
        note: cl && ch ? undefined : cl ? 'The Chase plan is on the 1st paycheck.' : 'Citi and Capital One are on the 15th paycheck.',
      }
      const at = debtLines.indexOf((cl ?? ch)!)
      sections.set('debt', debtLines.filter((l) => l !== cl && l !== ch))
      sections.get('debt')!.splice(at, 0, merged)
    }
  }

  const order = ['home', 'car', 'sent', 'personal', 'tech', 'debt', 'emergency', 'other']
  const spending: StatementSection[] = order
    .filter((k) => sections.has(k))
    .map((k) => ({ key: k, label: SECTION_LABEL[k]!, lines: sections.get(k)!, total: sum(sections.get(k)!) }))
  const spendTotal = r2(spending.reduce((s, x) => s + x.total, 0))
  const freeCashFlow = r2(netIncome - spendTotal)

  const investing: StatementSection = { key: 'invest', label: 'Investing', lines: investLines, total: sum(investLines) }
  const savingsChange = r2(toSavings - draws)
  const checkingChange = r2(freeCashFlow - investing.total - savingsChange)
  const netCash: StatementSection = {
    key: 'cash',
    label: 'Net cash',
    lines: [
      { key: 'checking', label: 'Change to checking', amount: checkingChange, txns: [] },
      { key: 'savings', label: 'Change to savings', amount: savingsChange, txns: [] },
    ],
    total: r2(checkingChange + savingsChange),
  }

  // ── Balance-sheet impact ──
  const debtPaid = spending.find((s) => s.key === 'debt')?.total ?? 0
  const carPaid = (sections.get('car') ?? []).filter((l) => l.key.startsWith('car_payoff')).reduce((s, l) => s + l.amount, 0)
  const catchUp = (sections.get('home') ?? []).filter((l) => l.key === 'arrears_catchup_payment' || l.key === 'mortgage_arrears').reduce((s, l) => s + l.amount, 0)
  const regularMortgage = (sections.get('home') ?? []).some((l) => l.key === 'mortgage_current') ? MORTGAGE_PRINCIPAL_EST : 0
  const nth = investLines.filter((l) => l.key === 'nth_investments').reduce((s, l) => s + l.amount, 0)
  const bsLines: StatementLine[] = [
    { key: 'bs_cash', label: 'Cash (checking + savings)', amount: netCash.total, txns: [] },
    { key: 'bs_tsp', label: 'TSP (your 5% + the match)', amount: r2(tspEmployee * 2), txns: [] },
    ...(nth ? [{ key: 'bs_nth', label: 'Nth Venture — your business, at cost', amount: nth, txns: [] }] : []),
    ...(debtPaid + carPaid ? [{ key: 'bs_debt', label: 'Debt paid down (incl. some interest — approx.)', amount: r2(debtPaid + carPaid), txns: [] }] : []),
    ...(catchUp ? [{ key: 'bs_arrears', label: 'Mortgage past-due made good', amount: r2(catchUp), txns: [] }] : []),
    ...(regularMortgage ? [{ key: 'bs_mortgage', label: 'Mortgage principal (approx.)', amount: regularMortgage, txns: [] }] : []),
  ]
  const balanceSheet: StatementSection = { key: 'bs', label: 'Balance sheet impact', lines: bsLines, total: sum(bsLines) }

  return {
    payday,
    gross,
    deductions,
    netIncome,
    spending,
    freeCashFlow,
    investing,
    netCash,
    balanceSheet,
    takeHome: p.net,
  }
}

/**
 * Several paychecks as one statement — a month's 1st and 15th, summed line by line.
 * Lines with the same key add; their transactions are listed together; a set-up to-do or
 * a scheduled payment on either paycheck carries through.
 */
export function combineStatements(list: PaycheckStatement[]): PaycheckStatement {
  if (list.length === 1) return list[0]!
  const mergeSection = (secs: StatementSection[]): StatementSection => {
    const lines: StatementLine[] = []
    for (const sec of secs) {
      for (const l of sec.lines) {
        const have = lines.find((x) => x.key === l.key)
        if (!have) {
          lines.push({ ...l, txns: [...l.txns], spent: l.spent })
          continue
        }
        have.amount = r2(have.amount + l.amount)
        if (l.spent !== undefined || have.spent !== undefined) have.spent = r2((have.spent ?? 0) + (l.spent ?? 0))
        have.txns = [...have.txns, ...l.txns]
        have.short = r2((have.short ?? 0) + (l.short ?? 0)) || undefined
        have.todo = have.todo ?? l.todo
        have.scheduled = have.scheduled ?? l.scheduled
        if (l.accounts) {
          const acc = [...(have.accounts ?? [])]
          for (const r of l.accounts) {
            const i = acc.findIndex((x) => x.key === r.key)
            if (i < 0) acc.push(r)
            else acc[i] = { ...acc[i]!, paid: r2(acc[i]!.paid + r.paid), txns: [...acc[i]!.txns, ...r.txns], minimum: r2(acc[i]!.minimum + r.minimum) }
          }
          have.accounts = acc
          if (acc.some((r) => r.key === 'chase') && acc.some((r) => r.key === 'citi')) have.note = undefined
        }
        have.date = undefined
        if (l.note && l.note !== have.note) have.note = have.note ? `${have.note} ${l.note}` : l.note
      }
    }
    return { key: secs[0]!.key, label: secs[0]!.label, lines, total: r2(sum(lines)) }
  }
  const spendingKeys: string[] = []
  for (const s of list) for (const sec of s.spending) if (!spendingKeys.includes(sec.key)) spendingKeys.push(sec.key)
  return {
    payday: list[0]!.payday,
    gross: mergeSection(list.map((s) => s.gross)),
    deductions: mergeSection(list.map((s) => s.deductions)),
    netIncome: r2(list.reduce((t, s) => t + s.netIncome, 0)),
    spending: spendingKeys.map((k) => mergeSection(list.flatMap((s) => s.spending.filter((x) => x.key === k)))),
    freeCashFlow: r2(list.reduce((t, s) => t + s.freeCashFlow, 0)),
    investing: mergeSection(list.map((s) => s.investing)),
    netCash: mergeSection(list.map((s) => s.netCash)),
    balanceSheet: mergeSection(list.map((s) => s.balanceSheet)),
    takeHome: r2(list.reduce((t, s) => t + s.takeHome, 0)),
  }
}
