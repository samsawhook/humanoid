'use client'

import { useEffect, useState } from 'react'
import type { Todo } from '@/core/todos'

const KEY = 'todo-done-v1'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nice = (d: string) => {
  const t = new Date(d + 'T12:00:00Z')
  return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`
}

export interface PaydayTask {
  id: string
  payday: string
  spendable: string
  lines: { label: string; amount: number; howTo?: string; short: number }[]
}

export interface DebtTask {
  id: string
  payday: string
  spendable: string
  label: string
  amount: number
  howTo?: string
  short: number
}

/** The list, with checkboxes kept in this browser. */
export function TodoList({ todos, today, paydays, debts }: { todos: Todo[]; today: string; paydays: PaydayTask[]; debts: DebtTask[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [showDone, setShowDone] = useState(false)
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
    } catch {}
  }, [])
  const toggle = (id: string) =>
    setDone((d) => {
      const n = { ...d, [id]: !d[id] }
      if (!n[id]) delete n[id]
      try {
        localStorage.setItem(KEY, JSON.stringify(n))
      } catch {}
      return n
    })

  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const items = [
    ...paydays.map((p) => ({
      id: p.id,
      title: `Payday ${nice(p.payday)} — move ${p.lines.length} payment${p.lines.length === 1 ? '' : 's'} by hand, ${usd(p.lines.reduce((t, l) => t + l.amount, 0))}`,
      next: `Spendable ~${nice(p.spendable)}.`,
      why: '',
      due: p.spendable,
      from: p.spendable as string | undefined,
      area: 'Payday',
      detail: p.lines,
    })),
    ...debts.map((d) => ({
      id: d.id,
      title: `Pay by hand: ${d.label} — ${usd(d.amount)}${d.short > 0 ? ` (short ${usd(d.short)})` : ''}`,
      next: d.howTo ?? 'Not on autopay: send it from Joint Checking once the pay lands.',
      why: `From the ${nice(d.payday)} pay, spendable ~${nice(d.spendable)}.`,
      due: d.spendable,
      from: d.spendable as string | undefined,
      area: 'Debt payment',
      detail: null as PaydayTask['lines'] | null,
    })),
    ...todos.map((t) => ({ ...t, from: t.from as string | undefined, detail: null as PaydayTask['lines'] | null })),
  ].sort((a, b) => (a.due ?? '9999') .localeCompare(b.due ?? '9999'))
  const [showLater, setShowLater] = useState(false)
  // Lead with what can be done today; the rest waits, folded, until its day comes.
  const open = items.filter((i) => !done[i.id] && (!i.from || i.from <= today))
  const later = items
    .filter((i) => !done[i.id] && i.from && i.from > today && i.area !== 'Debt payment')
    .sort((a, b) => a.from!.localeCompare(b.from!))
  // Debt payments not on autopay stay in view even before their money lands.
  const debtNext = items.filter((i) => !done[i.id] && i.area === 'Debt payment' && i.from! > today).sort((a, b) => a.from!.localeCompare(b.from!))
  const closed = items.filter((i) => done[i.id])
  const row = (i: (typeof items)[number]) => (
    <li key={i.id} className={`todo ${done[i.id] ? 'done' : ''} ${i.due && i.due < today && !done[i.id] ? 'late' : ''}`}>
      <label>
        <input type="checkbox" checked={!!done[i.id]} onChange={() => toggle(i.id)} />
        <span className="todo-main">
          <span className="todo-title">{i.title}</span>
          <span className="todo-next">{i.next}</span>
          {i.why && <span className="todo-why">{i.why}</span>}
          {i.detail && (
            <span className="todo-lines">
              {i.detail.map((l) => (
                <span key={l.label}>
                  {l.label} — {usd(l.amount)}
                  {l.short > 0 && <b className="neg"> (short {usd(l.short)})</b>}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="todo-meta">
          {i.from && i.from > today ? <span className="todo-due">from {nice(i.from)}</span> : i.due && <span className="todo-due">by {nice(i.due)}</span>}
          <span className="todo-area">{i.area}</span>
        </span>
      </label>
    </li>
  )
  return (
    <div className="todos">
      <section>
        <h3>
          Do now <span>{open.length}</span>
        </h3>
        {open.length ? <ul>{open.map(row)}</ul> : <p className="sub">Nothing can be done today. Next up below.</p>}
      </section>
      {debtNext.length > 0 && (
        <section>
          <h3>
            Debt payments by hand — next 3 months <span>{debtNext.length}</span>
          </h3>
          <ul>{debtNext.map(row)}</ul>
        </section>
      )}
      {later.length > 0 && (
        <section>
          <button className="linkish" onClick={() => setShowLater(!showLater)}>
            {showLater ? 'Hide' : 'Show'} coming up ({later.length}) — not doable yet
          </button>
          {showLater && <ul>{later.map(row)}</ul>}
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <button className="linkish" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Hide' : 'Show'} done ({closed.length})
          </button>
          {showDone && <ul>{closed.map(row)}</ul>}
        </section>
      )}
    </div>
  )
}
