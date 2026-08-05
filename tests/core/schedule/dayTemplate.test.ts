import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAY_TEMPLATE,
  fillTemplate,
  survivingIntervals,
  templateIntervalsFor,
  weeklyTemplateMinutes,
} from '@/core/schedule/dayTemplate'
import { commitment, item } from '../../fixtures/world'
import type { Item } from '@/core/types'

const ZONE = 'America/Chicago'
const WED = '2026-08-05' // Wednesday
const SAT = '2026-08-08'
const SUN = '2026-08-09'

describe('day template', () => {
  it('emits only the blocks scheduled for that weekday', () => {
    const wed = templateIntervalsFor(ZONE, WED).map((i) => i.block.key)
    expect(wed).toEqual(['am_deep', 'pm_drill', 'admin'])
    expect(templateIntervalsFor(ZONE, SAT).map((i) => i.block.key)).toEqual(['sat_long'])
    expect(templateIntervalsFor(ZONE, SUN).map((i) => i.block.key)).toEqual(['sun_review'])
  })

  it('places blocks at the right local time regardless of UTC offset', () => {
    const [first] = templateIntervalsFor(ZONE, WED)
    // 05:30 CDT = 10:30Z in August.
    expect(first!.start.toISOString()).toBe('2026-08-05T10:30:00.000Z')
    expect(first!.minutes).toBe(90)
  })

  it('offers a modest weekly budget rather than an aspirational one', () => {
    const hours = weeklyTemplateMinutes() / 60
    expect(hours).toBeGreaterThan(15)
    expect(hours).toBeLessThan(30)
  })
})

describe('commitments carve into template blocks', () => {
  it('shrinks a block rather than double-booking it', () => {
    const intervals = templateIntervalsFor(ZONE, WED)
    // Duty running to 20:00 CDT (01:00Z next day) eats most of the evening drill.
    const survived = survivingIntervals(intervals, [
      commitment({
        id: 'duty',
        startsAt: new Date('2026-08-05T13:00:00Z'),
        endsAt: new Date('2026-08-06T01:00:00Z'),
      }),
    ])
    const evening = survived.find((s) => s.block.key === 'pm_drill')
    expect(evening).toBeDefined()
    expect(evening!.minutes).toBeLessThan(75)
    // The morning block is untouched — duty started after it.
    expect(survived.find((s) => s.block.key === 'am_deep')!.minutes).toBe(90)
  })

  it('drops a block entirely when too little of it survives', () => {
    const survived = survivingIntervals(templateIntervalsFor(ZONE, WED), [
      commitment({
        id: 'all_day',
        startsAt: new Date('2026-08-05T00:00:00Z'),
        endsAt: new Date('2026-08-06T06:00:00Z'),
      }),
    ])
    expect(survived).toHaveLength(0)
  })

  it('splits a block a commitment lands in the middle of', () => {
    const survived = survivingIntervals(
      templateIntervalsFor(ZONE, SAT),
      [
        commitment({
          id: 'mid',
          startsAt: new Date('2026-08-08T14:00:00Z'), // 09:00 CDT
          endsAt: new Date('2026-08-08T15:00:00Z'), // 10:00 CDT
        }),
      ],
    )
    expect(survived).toHaveLength(2)
    expect(survived.every((s) => s.block.key === 'sat_long')).toBe(true)
  })
})

describe('filling template blocks from the queue', () => {
  const lsatItems: Item[] = [
    item({ id: 'a', nodeId: 'lsat', title: 'Drill LR', effortMinutes: 60 }),
    item({ id: 'b', nodeId: 'lsat', title: 'Drill RC', effortMinutes: 45 }),
  ]
  const moneyItem = item({ id: 'm', nodeId: 'money', title: 'Allocate', effortMinutes: 30 })
  const inDomain = (i: Item, nodeId: string) => i.nodeId === nodeId

  it('only puts an item in a block reserved for its domain', () => {
    const intervals = templateIntervalsFor(ZONE, WED)
    const { fills } = fillTemplate(intervals, [moneyItem, ...lsatItems], inDomain)

    const morning = fills.find((f) => f.interval.block.key === 'am_deep')!
    expect(morning.items.every((x) => x.item.nodeId === 'lsat')).toBe(true)

    const admin = fills.find((f) => f.interval.block.key === 'admin')!
    expect(admin.items.map((x) => x.item.id)).toEqual(['m'])
  })

  it('leaves a block empty rather than back-filling with unrelated work', () => {
    const { fills } = fillTemplate(templateIntervalsFor(ZONE, WED), [moneyItem], inDomain)
    const morning = fills.find((f) => f.interval.block.key === 'am_deep')!
    expect(morning.items).toHaveLength(0)
    expect(morning.unusedMinutes).toBe(90)
  })

  it('never schedules the same item twice in one day', () => {
    const { fills, placedItemIds } = fillTemplate(
      templateIntervalsFor(ZONE, WED),
      lsatItems,
      inDomain,
    )
    const all = fills.flatMap((f) => f.items.map((x) => x.item.id))
    expect(new Set(all).size).toBe(all.length)
    expect(placedItemIds.size).toBe(all.length)
  })

  it('follows queue order inside a block, not a packing heuristic', () => {
    const big = item({ id: 'big', nodeId: 'lsat', title: 'Big', effortMinutes: 85 })
    const small = item({ id: 'small', nodeId: 'lsat', title: 'Small', effortMinutes: 20 })
    const { fills } = fillTemplate(templateIntervalsFor(ZONE, WED), [big, small], inDomain)
    const morning = fills.find((f) => f.interval.block.key === 'am_deep')!
    expect(morning.items[0]!.item.id).toBe('big')
  })

  it('reserves a null-domain block for anything', () => {
    const { fills } = fillTemplate(templateIntervalsFor(ZONE, SUN), [moneyItem], inDomain)
    expect(fills[0]!.interval.block.nodeId).toBeNull()
    expect(fills[0]!.items.map((x) => x.item.id)).toEqual(['m'])
  })
})
