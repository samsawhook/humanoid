import { ITEMS, COMMITMENTS } from '@/core/goals/items'
import { NODES } from '@/core/goals/seed'
import { orderQueue } from '@/core/schedule/order'
import { reslotDay, freeIntervals } from '@/core/schedule/reslot'
import { addLocalDays, startOfIsoWeek, localDayFor } from '@/core/time/localDay'
import { Figure, seriesColor } from '@/components/viz'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'
const ZONE = 'America/Chicago'

const hhmm = (d: Date) =>
  d.toLocaleTimeString('en-US', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false })

export default function WeekPage() {
  const weekStart = startOfIsoWeek(TODAY)
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart, i))
  const queue = orderQueue(ITEMS, NODES, TODAY)

  const slotted = days.map((d) =>
    reslotDay(
      ZONE,
      d,
      queue.map((r) => r.item),
      COMMITMENTS.filter((c) => localDayFor(ZONE, c.startsAt) === d),
    ),
  )

  const todayIdx = days.indexOf(TODAY)
  const todaySlot = slotted[todayIdx >= 0 ? todayIdx : 0]!

  return (
    <>
      <h1>This week</h1>
      <p className="sub">
        Week of {weekStart}. The queue is an ordering, not a timetable — free time is
        exogenous and its size is unknown until the day happens. Times below are a
        deterministic first-fit into whatever the day actually has left.
      </p>

      <h2>The queue</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Effort</th>
              <th>Why here</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r, i) => (
              <tr key={r.item.id}>
                <td className="muted">{r.pinned ? '📌' : i + 1}</td>
                <td style={{ whiteSpace: 'normal' }}>
                  {r.item.title}
                  {r.item.recurrenceRule && <span className="muted"> · daily</span>}
                </td>
                <td className="muted">{r.item.effortMinutes}m</td>
                <td className={r.pinned ? 'warn' : 'muted'} style={{ whiteSpace: 'normal' }}>
                  {r.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Today — {TODAY}</h2>
      <div className="panel">
        <div className="muted" style={{ marginBottom: 8 }}>
          {Math.round(todaySlot.freeMinutes / 6) / 10}h free after commitments ·{' '}
          {Math.round(todaySlot.usedMinutes / 6) / 10}h allocated ·{' '}
          {todaySlot.unplaced.length} item(s) did not fit
        </div>
        <table>
          <tbody>
            {todaySlot.blocks.map((b, i) => (
              <tr key={`${b.itemId ?? b.commitmentId}-${i}`}>
                <td style={{ width: 110 }}>
                  {hhmm(b.start)}–{hhmm(b.end)}
                </td>
                <td>
                  <span className={b.firmness === 'firm' ? 'tag on' : 'tag'}>{b.firmness}</span>
                </td>
                <td style={{ whiteSpace: 'normal' }}>{b.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {todaySlot.unplaced.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong className="bad">Did not fit</strong>
            <ul className="tight">
              {todaySlot.unplaced.map((u) => (
                <li key={u.itemId} className="muted">
                  {u.title} ({u.effortMinutes}m)
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
              Reported rather than dropped. The queue order is a judgement about what
              matters, and re-ordering it to fit one more task is exactly the optimisation
              this system refuses to make.
            </p>
          </div>
        )}
      </div>

      <h2>The week</h2>
      <Figure
        title="Committed vs free, by day"
        caption="Firm blocks are commitments and pinned work. Soft blocks carry real times but any re-slot may rewrite them — an overrun on one is absorbed by moving the rest, with no model call."
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Free</th>
                <th>Allocated</th>
                <th>Unfitted</th>
                <th>First block</th>
              </tr>
            </thead>
            <tbody>
              {slotted.map((s) => (
                <tr key={s.localDate}>
                  <td className={s.localDate === TODAY ? 'warn' : ''}>{s.localDate}</td>
                  <td>{Math.round(s.freeMinutes / 6) / 10}h</td>
                  <td>{Math.round(s.usedMinutes / 6) / 10}h</td>
                  <td className={s.unplaced.length ? 'bad' : 'muted'}>{s.unplaced.length}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {s.blocks[0] ? `${hhmm(s.blocks[0].start)} ${s.blocks[0].title}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Figure>

      <div className="note">
        <strong>Commitments are placeholders.</strong> I do not have your real pre-mob
        schedule, so weekdays are stubbed as 08:00–17:00 duty in{' '}
        <code>src/core/goals/items.ts</code>. Everything above is only as good as those —
        replace them and the whole week re-slots deterministically. Nothing here is
        persisted yet; the database still needs migrating.
      </div>
    </>
  )
}
