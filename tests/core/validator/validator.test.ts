import { describe, expect, it } from 'vitest'
import { validate, VIOLATION_CODES } from '@/core/validator/index'
import type { Violation } from '@/core/validator/codes'
import {
  block,
  budget,
  commitment,
  healthyWorld,
  item,
  milestone,
  node,
  outcome,
  proposal,
  world,
} from '../../fixtures/world'

const codes = (violations: Violation[]) => violations.map((v) => v.code)

describe('empty state', () => {
  it('reports what is missing instead of crashing or approving', () => {
    const { violations, feasible } = validate(world(), proposal())

    expect(feasible).toBe(false)
    expect(codes(violations)).toContain(VIOLATION_CODES.EMPTY_STATE)
    expect(violations.every((v) => typeof v.message === 'string' && v.message.length > 0)).toBe(true)
  })

  it('reports a missing timezone period rather than throwing out of a rule', () => {
    const { violations } = validate(world({ timezonePeriods: [] }), proposal())
    const tz = violations.find((v) => v.message.includes('timezone'))
    expect(tz).toBeDefined()
    expect(tz?.severity).toBe('hard')
  })

  it('a healthy world with an empty proposal is feasible', () => {
    const { feasible, violations } = validate(healthyWorld(), proposal())
    expect(violations.filter((v) => v.severity === 'hard')).toEqual([])
    expect(feasible).toBe(true)
  })
})

describe('over-capacity periods', () => {
  it('flags a week that exceeds the domain ceiling, with the numbers', () => {
    const w = healthyWorld()
    w.capacityBudgets = [budget({ nodeId: 'law', hoursPerWeek: 5 })]

    // Eight one-hour blocks across the week against a five-hour ceiling.
    const blocks = Array.from({ length: 8 }, (_, i) =>
      block({
        itemId: 'prep',
        startsAt: new Date(`2026-08-0${3 + (i % 5)}T14:00:00Z`),
        endsAt: new Date(`2026-08-0${3 + (i % 5)}T15:00:00Z`),
      }),
    )

    const { violations, feasible } = validate(w, proposal({ blocks }))
    const over = violations.find((v) => v.code === VIOLATION_CODES.OVER_CAPACITY)

    expect(feasible).toBe(false)
    expect(over).toBeDefined()
    expect(over?.details?.ceilingHours).toBe(5)
    expect(over?.details?.overByHours).toBe(3)
    expect(over?.message).toContain('Over by 3.0h')
  })

  it('never complains about coming in under the ceiling', () => {
    const w = healthyWorld()
    const { violations } = validate(
      w,
      proposal({ blocks: [block({ itemId: 'prep' })] }),
    )
    expect(codes(violations)).not.toContain(VIOLATION_CODES.OVER_CAPACITY)
  })

  it('flags work that belongs to no domain instead of silently exempting it', () => {
    const w = healthyWorld()
    w.items = [...w.items, item({ id: 'loose', nodeId: null })]

    const { violations } = validate(w, proposal({ blocks: [block({ itemId: 'loose' })] }))
    const loose = violations.find((v) => v.code === VIOLATION_CODES.OVER_CAPACITY)
    expect(loose?.severity).toBe('soft')
    expect(loose?.message).toContain('belongs to no domain')
  })
})

describe('conflicting fixed commitments', () => {
  it('is hard when a proposed block collides with an external commitment', () => {
    const w = healthyWorld()
    w.commitments = [
      commitment({
        id: 'drill',
        title: 'Drill',
        startsAt: new Date('2026-08-05T12:00:00Z'),
        endsAt: new Date('2026-08-05T20:00:00Z'),
      }),
    ]

    const { violations, feasible } = validate(
      w,
      proposal({ blocks: [block({ itemId: 'prep', firmness: 'soft' })] }),
    )
    const conflict = violations.find((v) => v.code === VIOLATION_CODES.FIXED_CONFLICT)

    expect(feasible).toBe(false)
    expect(conflict?.severity).toBe('hard')
    expect(conflict?.message).toContain('Drill')
    expect(conflict?.details?.overlapMinutes).toBe(60)
  })

  it('is soft when two elastic blocks overlap, because re-slotting fixes it', () => {
    const w = healthyWorld()
    w.items = [...w.items, item({ id: 'other', nodeId: 'lsat' })]

    const { violations } = validate(
      w,
      proposal({
        blocks: [
          block({ itemId: 'prep', firmness: 'soft' }),
          block({ itemId: 'other', firmness: 'soft' }),
        ],
      }),
    )
    const conflict = violations.find((v) => v.code === VIOLATION_CODES.FIXED_CONFLICT)
    expect(conflict?.severity).toBe('soft')
  })

  it('calls two overlapping commitments a real-world conflict the plan cannot fix', () => {
    const w = healthyWorld()
    w.commitments = [
      commitment({ id: 'a', title: 'Drill' }),
      commitment({ id: 'b', title: 'Dentist' }),
    ]

    const { violations } = validate(w, proposal())
    const conflict = violations.find((v) => v.code === VIOLATION_CODES.FIXED_CONFLICT)
    expect(conflict?.severity).toBe('hard')
    expect(conflict?.message).toContain('real-world conflict')
  })
})

describe('a closing window', () => {
  it('escalates immediately rather than waiting for the propagation threshold', () => {
    const w = healthyWorld()
    // 40 hours of work left, window shuts in a week, ceiling is 10h/wk.
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat' ? { ...n, windowClose: '2026-08-12', reversible: false } : n,
    )
    w.items = [item({ id: 'prep', nodeId: 'lsat', effortMinutes: 40 * 60 })]

    const { violations, feasible } = validate(w, proposal())
    const risk = violations.find((v) => v.code === VIOLATION_CODES.WINDOW_CLOSURE_RISK)

    expect(feasible).toBe(false)
    expect(risk).toBeDefined()
    expect(risk?.details?.daysLeft).toBe(7)
    expect(risk?.message).toContain('irreversible')
  })

  it('flags work scheduled outside the window it belongs to', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat' ? { ...n, windowOpen: '2026-01-01', windowClose: '2026-06-30' } : n,
    )

    const { violations } = validate(w, proposal({ blocks: [block({ itemId: 'prep' })] }))
    const breach = violations.find((v) => v.code === VIOLATION_CODES.WINDOW_BREACH)

    expect(breach?.severity).toBe('hard')
    expect(breach?.message).toContain('after the window')
  })

  it('inherits an ancestor window', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) =>
      n.id === 'law' ? { ...n, windowClose: '2026-06-30' } : n,
    )

    const { violations } = validate(w, proposal({ blocks: [block({ itemId: 'prep' })] }))
    expect(codes(violations)).toContain(VIOLATION_CODES.WINDOW_BREACH)
  })

  it('says nothing about a window that has already closed', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) => (n.id === 'lsat' ? { ...n, windowClose: '2020-01-01' } : n))

    const { violations } = validate(w, proposal())
    expect(codes(violations)).not.toContain(VIOLATION_CODES.WINDOW_CLOSURE_RISK)
  })
})

describe('a node with no parent', () => {
  it('is a violation for any level below life', () => {
    const w = healthyWorld()
    w.nodes = [...w.nodes, node({ id: 'stray', parentId: null, level: 'campaign' })]

    const { violations, feasible } = validate(w, proposal())
    const orphan = violations.find((v) => v.code === VIOLATION_CODES.ORPHAN_NODE)

    expect(feasible).toBe(false)
    expect(orphan?.subjectId).toBe('stray')
    expect(orphan?.message).toContain('no parent')
  })

  it('is fine for a life node, which is meant to be a root', () => {
    const { violations } = validate(healthyWorld(), proposal())
    expect(codes(violations)).not.toContain(VIOLATION_CODES.ORPHAN_NODE)
  })

  it('catches a parent id that resolves to nothing', () => {
    const w = healthyWorld()
    w.nodes = [...w.nodes, node({ id: 'ghosted', parentId: 'does-not-exist', level: 'year' })]

    const { violations } = validate(w, proposal())
    expect(codes(violations)).toContain(VIOLATION_CODES.ORPHAN_NODE)
  })

  it('allows skipping levels but not inverting them', () => {
    const w = healthyWorld()
    // campaign directly under life is fine; a decade under a campaign is not.
    w.nodes = [...w.nodes, node({ id: 'bad', parentId: 'lsat', level: 'decade' })]

    const { violations } = validate(w, proposal())
    expect(codes(violations)).toContain(VIOLATION_CODES.LEVEL_INVERSION)
  })
})

describe('an unreachable required velocity', () => {
  it('converts required output into hours and reports the shortfall', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat'
        ? {
            ...n,
            requiredVelocity: {
              amount: 4,
              unit: 'milestones' as const,
              unitLabel: 'practice sections',
              period: 'week' as const,
            },
          }
        : n,
    )
    w.items = [item({ id: 'prep', nodeId: 'lsat', effortMinutes: 20 * 60 })]
    w.milestones = [
      milestone({ id: 'm1', nodeId: 'lsat' }),
      milestone({ id: 'm2', nodeId: 'lsat' }),
    ]

    const { violations, feasible } = validate(w, proposal())
    const unreachable = violations.find((v) => v.code === VIOLATION_CODES.UNREACHABLE_VELOCITY)

    expect(feasible).toBe(false)
    // 20h of work over 2 remaining milestones = 10h each; 4/wk needs 40h/wk vs a 10h ceiling.
    expect(unreachable?.details?.requiredHoursPerWeek).toBe(40)
    expect(unreachable?.details?.capacityHoursPerWeek).toBe(10)
    expect(unreachable?.details?.capacitySource).toBe('declared')
    expect(unreachable?.message).toContain('Short by 30.0h/wk')
  })

  it('says nothing when nothing has been decomposed into items yet', () => {
    const w = healthyWorld()
    w.items = []
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat'
        ? {
            ...n,
            requiredVelocity: {
              amount: 99,
              unit: 'milestones' as const,
              unitLabel: 'x',
              period: 'week' as const,
            },
          }
        : n,
    )

    const { violations } = validate(w, proposal())
    expect(codes(violations)).not.toContain(VIOLATION_CODES.UNREACHABLE_VELOCITY)
  })

  it('uses demonstrated throughput once enough weeks exist, and says so', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat'
        ? {
            ...n,
            requiredVelocity: {
              amount: 1,
              unit: 'milestones' as const,
              unitLabel: 'sections',
              period: 'week' as const,
            },
          }
        : n,
    )
    w.items = [item({ id: 'prep', nodeId: 'lsat', effortMinutes: 9 * 60 })]
    w.milestones = [milestone({ id: 'm1', nodeId: 'lsat' })]
    // Four separate weeks at 2h each — well under the 10h declared ceiling.
    w.outcomes = [
      outcome({ id: 'o1', itemId: 'prep', localDate: '2026-07-06', actualMinutes: 120 }),
      outcome({ id: 'o2', itemId: 'prep', localDate: '2026-07-13', actualMinutes: 120 }),
      outcome({ id: 'o3', itemId: 'prep', localDate: '2026-07-20', actualMinutes: 120 }),
      outcome({ id: 'o4', itemId: 'prep', localDate: '2026-07-27', actualMinutes: 120 }),
    ]

    const { violations } = validate(w, proposal())
    const unreachable = violations.find((v) => v.code === VIOLATION_CODES.UNREACHABLE_VELOCITY)

    expect(unreachable?.details?.capacitySource).toBe('demonstrated')
    expect(unreachable?.details?.weeksObserved).toBe(4)
    expect(unreachable?.message).toContain('4 weeks observed')
  })
})

describe('goals are outputs, not hours', () => {
  it('rejects an achievement node with no stated outcome', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) => (n.id === 'lsat' ? { ...n, outcomeDefinition: '  ' } : n))

    const { violations, feasible } = validate(w, proposal())
    expect(feasible).toBe(false)
    expect(codes(violations)).toContain(VIOLATION_CODES.MISSING_OUTCOME_DEFINITION)
  })

  it('rejects an outcome defined as time spent', () => {
    const w = healthyWorld()
    w.nodes = w.nodes.map((n) =>
      n.id === 'lsat' ? { ...n, outcomeDefinition: 'Study 10 hrs/wk for the LSAT' } : n,
    )

    const { violations } = validate(w, proposal())
    const bad = violations.find((v) => v.code === VIOLATION_CODES.MISSING_OUTCOME_DEFINITION)
    expect(bad?.message).toContain('Hours are a cost, not a goal')
  })

  it('leaves state nodes alone — they never complete', () => {
    const w = healthyWorld()
    w.nodes = [
      ...w.nodes,
      node({ id: 'family', parentId: 'law', level: 'campaign', kind: 'state', outcomeDefinition: null }),
    ]

    const { violations } = validate(w, proposal())
    expect(codes(violations)).not.toContain(VIOLATION_CODES.MISSING_OUTCOME_DEFINITION)
  })
})

describe('dependency graph', () => {
  it('reports a cycle with the path through it', () => {
    const w = healthyWorld()
    w.nodes = [...w.nodes, node({ id: 'apps', parentId: 'law', level: 'campaign' })]
    w.dependencies = [
      { predecessorId: 'lsat', successorId: 'apps', kind: 'finish_to_start' },
      { predecessorId: 'apps', successorId: 'lsat', kind: 'finish_to_start' },
    ]

    const { violations, feasible } = validate(w, proposal())
    const cycle = violations.find((v) => v.code === VIOLATION_CODES.DEPENDENCY_CYCLE)

    expect(feasible).toBe(false)
    expect(cycle?.message).toContain('→')
    expect(cycle?.message).toContain('Nothing in this loop can ever start')
  })

  it('accepts a plain chain', () => {
    const w = healthyWorld()
    w.nodes = [...w.nodes, node({ id: 'apps', parentId: 'law', level: 'campaign' })]
    w.dependencies = [{ predecessorId: 'lsat', successorId: 'apps', kind: 'finish_to_start' }]

    const { violations } = validate(w, proposal())
    expect(codes(violations)).not.toContain(VIOLATION_CODES.DEPENDENCY_CYCLE)
  })
})

describe('validator contract', () => {
  it('returns violations, never a bare boolean, and every one names a subject', () => {
    const { violations } = validate(world(), proposal())
    for (const v of violations) {
      expect(v.code).toBeTruthy()
      expect(['hard', 'soft']).toContain(v.severity)
      expect(v.subjectType).toBeTruthy()
    }
  })

  it('a rule that throws degrades to a reported gap, not a crash', () => {
    // A malformed budget date makes the capacity rule throw when it parses it.
    const w = healthyWorld()
    w.capacityBudgets = [budget({ nodeId: 'law', effectiveFrom: 'not-a-date' })]

    const result = validate(w, proposal({ blocks: [block({ itemId: 'prep' })] }))
    expect(result.feasible).toBe(false)
    expect(result.violations.some((v) => v.message.includes('NOT validated'))).toBe(true)
  })
})
