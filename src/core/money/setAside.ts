/**
 * What the money a paycheck leaves in checking is held for.
 *
 * The allocator keeps back anything a later paycheck will need (allocation.ts: the
 * backward pass), so a paycheck's leftover is rarely spare. This names the later bills it
 * is waiting for: from this paycheck up to the tightest one ahead, every one-time bill
 * (a catch-up payment, Christmas, the course, the collection) and every one-off cost
 * (an assumed emergency, the registration) that lands in between.
 */

import type { Allocation, Obligation, OneOff } from './allocation'

export interface SetAside {
  /** Left in checking by this paycheck. */
  amount: number
  /** True when nothing ahead needs it: it simply carries forward. */
  spare: boolean
  /** The paycheck it has to last to: the tightest one ahead. */
  until: string | null
  items: { label: string; date: string; amount: number }[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** A bill that happens once (or for one month), not every paycheck. */
const oneTime = (o: Obligation | undefined) => {
  if (!o || !o.activeFrom || !o.activeTo) return false
  const days = (Date.parse(o.activeTo) - Date.parse(o.activeFrom)) / 86400000
  return days <= 45
}

export function setAsideFor(allocations: Allocation[], i: number, obligations: Obligation[], oneOffs: OneOff[]): SetAside {
  const a = allocations[i]!
  const amount = r2(Math.max(0, a.remainder))
  if (amount < 0.5) return { amount: 0, spare: false, until: null, items: [] }
  // The tightest paycheck ahead: the one the held money has to carry you to.
  let j = -1
  let low = Infinity
  for (let k = i + 1; k < allocations.length; k++) {
    if (allocations[k]!.remainder < low - 0.005) {
      low = allocations[k]!.remainder
      j = k
    }
  }
  if (j < 0 || low >= amount - 0.5) return { amount, spare: true, until: null, items: [] }
  const byKey = new Map(obligations.map((o) => [o.key, o]))
  const from = a.paycheck.payDate
  const to = allocations[j]!.paycheck.payDate
  const items: SetAside['items'] = []
  for (let k = i + 1; k <= j; k++) {
    const b = allocations[k]!
    for (const l of b.lines)
      if (l.allocated > 0.005 && oneTime(byKey.get(l.key))) items.push({ label: l.label, date: b.paycheck.scheduledDate, amount: l.allocated })
  }
  for (const o of oneOffs)
    if (o.amount < 0 && o.date > from && o.date <= to) items.push({ label: o.label, date: o.date, amount: -o.amount })
  items.sort((x, y) => x.date.localeCompare(y.date))
  // Name the big ones; the small (lawn cuts and the like) are summed into one.
  const big = items.filter((x) => x.amount >= 100)
  const small = r2(items.filter((x) => x.amount < 100).reduce((t, x) => t + x.amount, 0))
  if (small > 0) big.push({ label: 'smaller bills', date: '', amount: small })
  return { amount, spare: false, until: allocations[j]!.paycheck.scheduledDate, items: big }
}
