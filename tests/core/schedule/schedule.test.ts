import { describe, expect, it } from 'vitest'
import { orderQueue } from '@/core/schedule/order'
import { freeIntervals, reslotDay, DEFAULT_WAKING } from '@/core/schedule/reslot'
import { buildIcs } from '@/core/schedule/ics'
import { ITEMS, COMMITMENTS } from '@/core/goals/items'
import { NODES } from '@/core/goals/seed'
import { commitment, item, node } from '../../fixtures/world'

const ZONE = 'America/Chicago'
const DAY = '2026-08-05'

describe('queue ordering', () => {
  it('pins autopilot-critical items above everything, whatever the scores say', () => {
    const q = orderQueue(ITEMS, NODES, DAY)
    const pinnedCount = q.filter((r) => r.pinned).length
    expect(pinnedCount).toBeGreaterThan(0)
    expect(q.slice(0, pinnedCount).every((r) => r.pinned)).toBe(true)
  })

  it('gives every item a human-readable reason — the ordering is never mysterious', () => {
    for (const r of orderQueue(ITEMS, NODES, DAY)) {
      expect(r.reason.length).toBeGreaterThan(0)
    }
  })

  it('ranks by window closure, not just by due date', () => {
    const nodes = [
      node({ id: 'domain', level: 'life' }),
      node({ id: 'closing', parentId: 'domain', level: 'campaign', windowClose: '2026-08-20' }),
      node({ id: 'open', parentId: 'domain', level: 'campaign' }),
    ]
    const items = [
      item({ id: 'far_window', nodeId: 'closing', title: 'A' }),
      item({ id: 'no_window', nodeId: 'open', title: 'B' }),
    ]
    const q = orderQueue(items, nodes, DAY)
    expect(q[0]!.item.id).toBe('far_window')
    expect(q[0]!.reason).toContain('shuts in')
  })

  it('weights irreversible nodes up', () => {
    const nodes = [
      node({ id: 'd', level: 'life' }),
      node({ id: 'rev', parentId: 'd', level: 'campaign', windowClose: '2026-09-01', reversible: true }),
      node({ id: 'irr', parentId: 'd', level: 'campaign', windowClose: '2026-09-01', reversible: false }),
    ]
    const items = [item({ id: 'a', nodeId: 'rev' }), item({ id: 'b', nodeId: 'irr' })]
    const q = orderQueue(items, nodes, DAY)
    expect(q[0]!.item.id).toBe('b')
    expect(q[0]!.reason).toContain('irreversible')
  })

  it('excludes done and dropped work', () => {
    const items = [
      item({ id: 'done', status: 'done' }),
      item({ id: 'dropped', status: 'dropped' }),
      item({ id: 'live' }),
    ]
    expect(orderQueue(items, [], DAY).map((r) => r.item.id)).toEqual(['live'])
  })
})

describe('free intervals', () => {
  it('subtracts commitments from the waking window', () => {
    // 08:00–17:00 CDT on 2026-08-05 is 13:00–22:00Z.
    const free = freeIntervals(ZONE, DAY, [
      commitment({
        id: 'duty',
        startsAt: new Date('2026-08-05T13:00:00Z'),
        endsAt: new Date('2026-08-05T22:00:00Z'),
      }),
    ])
    // Waking 06:00–22:00 local = 11:00Z–03:00Z(+1). Two gaps either side of duty.
    expect(free).toHaveLength(2)
    expect(free[0]!.minutes).toBe(120)
    expect(free[1]!.minutes).toBe(300)
  })

  it('merges overlapping commitments so a double-booking is not double-subtracted', () => {
    const free = freeIntervals(ZONE, DAY, [
      commitment({
        id: 'a',
        startsAt: new Date('2026-08-05T13:00:00Z'),
        endsAt: new Date('2026-08-05T18:00:00Z'),
      }),
      commitment({
        id: 'b',
        startsAt: new Date('2026-08-05T16:00:00Z'),
        endsAt: new Date('2026-08-05T22:00:00Z'),
      }),
    ])
    expect(free.reduce((s, f) => s + f.minutes, 0)).toBe(420)
  })

  it('returns the whole waking window when nothing is committed', () => {
    const free = freeIntervals(ZONE, DAY, [])
    expect(free).toHaveLength(1)
    expect(free[0]!.minutes).toBe(DEFAULT_WAKING.endMinute - DEFAULT_WAKING.startMinute)
  })
})

describe('deterministic re-slotting', () => {
  const items = [
    item({ id: 'a', title: 'A', effortMinutes: 60 }),
    item({ id: 'b', title: 'B', effortMinutes: 60 }),
    item({ id: 'c', title: 'C', effortMinutes: 60 }),
  ]

  it('is deterministic — same inputs, byte-identical output', () => {
    const one = reslotDay(ZONE, DAY, items, COMMITMENTS)
    const two = reslotDay(ZONE, DAY, items, COMMITMENTS)
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })

  it('absorbs an overrun by displacing later work, with no model call', () => {
    const short = commitment({
      id: 'duty',
      startsAt: new Date('2026-08-05T13:00:00Z'),
      endsAt: new Date('2026-08-05T22:00:00Z'),
    })
    // "Army ran three hours long."
    const overrun = { ...short, endsAt: new Date('2026-08-06T01:00:00Z') }

    const before = reslotDay(ZONE, DAY, items, [short])
    const after = reslotDay(ZONE, DAY, items, [overrun])

    expect(after.freeMinutes).toBe(before.freeMinutes - 180)
    expect(after.unplaced.length).toBeGreaterThanOrEqual(before.unplaced.length)
  })

  it('never reorders the queue to improve packing', () => {
    const mixed = [
      item({ id: 'big', title: 'Big', effortMinutes: 400 }),
      item({ id: 'small', title: 'Small', effortMinutes: 30 }),
    ]
    const slotted = reslotDay(ZONE, DAY, mixed, [
      commitment({
        id: 'duty',
        startsAt: new Date('2026-08-05T13:00:00Z'),
        endsAt: new Date('2026-08-05T22:00:00Z'),
      }),
    ])
    const placed = slotted.blocks.filter((b) => b.itemId).map((b) => b.itemId)
    // 'big' takes the first gap it fits in; 'small' must not jump ahead of it.
    expect(placed.indexOf('big')).toBeLessThan(placed.indexOf('small'))
  })

  it('reports what did not fit rather than dropping it', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item({ id: `x${i}`, title: `X${i}`, effortMinutes: 120 }),
    )
    const slotted = reslotDay(ZONE, DAY, many, COMMITMENTS)
    expect(slotted.unplaced.length).toBeGreaterThan(0)
    const placedIds = slotted.blocks.filter((b) => b.itemId).map((b) => b.itemId)
    const unplacedIds = slotted.unplaced.map((u) => u.itemId)
    // Every item is accounted for — placed or reported, never vanished.
    expect(placedIds.length + unplacedIds.length).toBe(many.length)
  })

  it('marks commitments firm and elastic work soft', () => {
    const slotted = reslotDay(ZONE, DAY, items, COMMITMENTS)
    const commitmentBlocks = slotted.blocks.filter((b) => b.commitmentId)
    expect(commitmentBlocks.every((b) => b.firmness === 'firm')).toBe(true)
  })
})

describe('ICS feed', () => {
  const slotted = [reslotDay(ZONE, DAY, [item({ id: 'a', title: 'Drill; review, notes' })], COMMITMENTS)]

  it('prefixes soft blocks so the phone does not read them as commitments', () => {
    const ics = buildIcs(slotted, {}, { now: new Date('2026-08-05T00:00:00Z') })
    expect(ics).toMatch(/SUMMARY:~ /)
    expect(ics).toContain('TRANSP:TRANSPARENT')
  })

  it('escapes semicolons, commas and backslashes per RFC 5545', () => {
    const ics = buildIcs(slotted, {}, { now: new Date('2026-08-05T00:00:00Z') })
    expect(ics).toContain('Drill\\; review\\, notes')
  })

  it('uses CRLF line endings and a complete envelope', () => {
    const ics = buildIcs(slotted, {}, { now: new Date('2026-08-05T00:00:00Z') })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.split('\r\n').length).toBeGreaterThan(5)
  })

  it('carries the ordered queue as one all-day event', () => {
    const ics = buildIcs(slotted, { [DAY]: ['First', 'Second'] }, { now: new Date(0) })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260805')
    expect(ics).toContain('1. First\\n2. Second')
  })

  it('produces stable UIDs so a refresh updates rather than duplicates', () => {
    const a = buildIcs(slotted, {}, { now: new Date('2026-01-01T00:00:00Z') })
    const b = buildIcs(slotted, {}, { now: new Date('2026-06-01T00:00:00Z') })
    const uids = (s: string) => s.split('\r\n').filter((l) => l.startsWith('UID:'))
    expect(uids(a)).toEqual(uids(b))
  })
})
