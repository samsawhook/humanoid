import type { World, Proposal } from '../../types.js'
import { indexNodes } from '../../tree.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * The dependency graph is what survives when dates don't.
 *
 * Beyond roughly two years, dates are wrong by definition but the graph of
 * what-must-precede-what is stable, which is what makes replanning cheap. A cycle in
 * it makes the backward pass non-terminating and the plan meaningless, so it is a
 * hard violation even though nothing is scheduled yet.
 */
export function dependencyCycle(world: World, _proposal: Proposal): Violation[] {
  const out: Violation[] = []
  const byId = indexNodes(world.nodes)

  const edges = new Map<string, string[]>()
  for (const dep of world.dependencies) {
    if (!byId.has(dep.predecessorId) || !byId.has(dep.successorId)) {
      out.push({
        code: VIOLATION_CODES.UNKNOWN_REFERENCE,
        severity: 'hard',
        message:
          `Dependency ${dep.predecessorId} → ${dep.successorId} references a node that ` +
          'does not exist.',
        subjectType: 'node',
        subjectId: byId.has(dep.predecessorId) ? dep.successorId : dep.predecessorId,
      })
      continue
    }
    const list = edges.get(dep.predecessorId) ?? []
    list.push(dep.successorId)
    edges.set(dep.predecessorId, list)
  }

  const UNVISITED = 0
  const IN_PROGRESS = 1
  const DONE = 2
  const state = new Map<string, number>()
  const path: string[] = []
  const reported = new Set<string>()

  const visit = (id: string): void => {
    const current = state.get(id) ?? UNVISITED
    if (current === DONE) return

    if (current === IN_PROGRESS) {
      const start = path.indexOf(id)
      const cycle = path.slice(start === -1 ? 0 : start).concat(id)
      const key = [...cycle].sort().join('|')
      if (!reported.has(key)) {
        reported.add(key)
        out.push({
          code: VIOLATION_CODES.DEPENDENCY_CYCLE,
          severity: 'hard',
          message:
            'Dependency cycle: ' +
            cycle.map((n) => `"${byId.get(n)?.title ?? n}"`).join(' → ') +
            '. Nothing in this loop can ever start.',
          subjectType: 'node',
          subjectId: cycle[0] ?? null,
          details: { cycle },
        })
      }
      return
    }

    state.set(id, IN_PROGRESS)
    path.push(id)
    for (const next of edges.get(id) ?? []) visit(next)
    path.pop()
    state.set(id, DONE)
  }

  for (const node of world.nodes) visit(node.id)

  return out
}
