import type { World, Proposal } from '../../types.js'
import { indexNodes, levelRank } from '../../tree.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Structural integrity of the goal tree.
 *
 * A node that doesn't reach a life-level root is invisible to capacity checking — its
 * work consumes hours from a domain that can't be identified, so it silently escapes
 * every ceiling. That is exactly the failure mode this system exists to prevent.
 *
 * Level adjacency is deliberately NOT enforced: a life node may parent a campaign
 * directly. Requiring every path to run life → decade → campaign → year → quarter
 * would produce filler nodes that exist only to satisfy the schema. The only rule is
 * that a child may not be coarser than its parent.
 */
export function orphanNode(world: World, _proposal: Proposal): Violation[] {
  const out: Violation[] = []
  const byId = indexNodes(world.nodes)

  for (const node of world.nodes) {
    if (node.parentId === null) {
      if (node.level !== 'life') {
        out.push({
          code: VIOLATION_CODES.ORPHAN_NODE,
          severity: 'hard',
          message:
            `"${node.title}" is a ${node.level}-level node with no parent. Only ` +
            'life-level nodes may be roots; everything else needs a domain to belong to.',
          subjectType: 'node',
          subjectId: node.id,
          details: { level: node.level },
        })
      }
      continue
    }

    const parent = byId.get(node.parentId)
    if (!parent) {
      out.push({
        code: VIOLATION_CODES.ORPHAN_NODE,
        severity: 'hard',
        message: `"${node.title}" points at parent ${node.parentId}, which does not exist.`,
        subjectType: 'node',
        subjectId: node.id,
        details: { missingParentId: node.parentId },
      })
      continue
    }

    if (levelRank(node.level) < levelRank(parent.level)) {
      out.push({
        code: VIOLATION_CODES.LEVEL_INVERSION,
        severity: 'hard',
        message:
          `"${node.title}" (${node.level}) sits under "${parent.title}" (${parent.level}). ` +
          'A child may be the same resolution as its parent or finer, never coarser.',
        subjectType: 'node',
        subjectId: node.id,
        details: { childLevel: node.level, parentLevel: parent.level },
      })
    }
  }

  return out
}
