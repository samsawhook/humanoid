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

/** The list, with checkboxes kept in this browser. */
export function TodoList({ todos, today, paydays }: { todos: Todo[]; today: string; paydays: PaydayTask[] }) {
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
      area: 'Payday',
      detail: p.lines,
    })),
    ...todos.map((t) => ({ ...t, detail: null as PaydayTask['lines'] | null })),
  ].sort((a, b) => (a.due ?? '9999') .localeCompare(b.due ?? '9999'))
  const open = items.filter((i) => !done[i.id])
  const closed = items.filter((i) => done[i.id])
  const bucket = (due: string | null) => {
    if (!due) return 'Whenever — no date'
    if (due < today) return 'Overdue'
    const days = (Date.parse(due) - Date.parse(today)) / 86400000
    if (days <= 7) return 'This week'
    if (days <= 31) return 'This month'
    return 'Later'
  }
  const ORDER = ['Overdue', 'This week', 'This month', 'Later', 'Whenever — no date']
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
          {i.due && <span className="todo-due">{nice(i.due)}</span>}
          <span className="todo-area">{i.area}</span>
        </span>
      </label>
    </li>
  )
  return (
    <div className="todos">
      {ORDER.map((b) => {
        const list = open.filter((i) => bucket(i.due) === b)
        if (!list.length) return null
        return (
          <section key={b}>
            <h3>
              {b} <span>{list.length}</span>
            </h3>
            <ul>{list.map(row)}</ul>
          </section>
        )
      })}
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
