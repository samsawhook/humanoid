/**
 * Goal-tree walking. Shared by the validator and both planning passes.
 *
 * The tree is the only taxonomy in the system. A "domain" — Army, Law School, MAcc,
 * Money, Family, Health — is not a separate concept: it is a `level: 'life'` node, and
 * everything below it inherits it by walking up. One taxonomy, nothing to keep in sync.
 */

import type { GoalNode, Item, NodeLevel } from './types'

/** Coarse to fine. A child may sit at the same level as its parent or finer, never coarser. */
export const LEVEL_ORDER: NodeLevel[] = ['life', 'decade', 'campaign', 'year', 'quarter']

export function levelRank(level: NodeLevel): number {
  const i = LEVEL_ORDER.indexOf(level)
  if (i < 0) throw new Error(`Unknown node level: ${level}`)
  return i
}

export function indexNodes(nodes: GoalNode[]): Map<string, GoalNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

/**
 * The `level: 'life'` ancestor of a node — its domain.
 *
 * Returns null for a node whose chain never reaches one, which is a broken tree; the
 * ORPHAN_NODE rule reports that separately rather than throwing here.
 */
export function domainOf(nodes: Map<string, GoalNode>, nodeId: string): GoalNode | null {
  const seen = new Set<string>()
  let current = nodes.get(nodeId)
  while (current) {
    if (current.level === 'life') return current
    if (seen.has(current.id)) return null // cycle in parent links; reported elsewhere
    seen.add(current.id)
    if (!current.parentId) return null
    current = nodes.get(current.parentId)
  }
  return null
}

export function domainOfItem(nodes: Map<string, GoalNode>, item: Item): GoalNode | null {
  if (!item.nodeId) return null
  return domainOf(nodes, item.nodeId)
}

export function ancestorsOf(nodes: Map<string, GoalNode>, nodeId: string): GoalNode[] {
  const out: GoalNode[] = []
  const seen = new Set<string>([nodeId])
  let current = nodes.get(nodeId)
  while (current?.parentId) {
    const parent = nodes.get(current.parentId)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    out.push(parent)
    current = parent
  }
  return out
}

export function childrenOf(nodes: GoalNode[], nodeId: string): GoalNode[] {
  return nodes.filter((n) => n.parentId === nodeId)
}

/** A node and everything beneath it. */
export function subtreeOf(nodes: GoalNode[], rootId: string): GoalNode[] {
  const byParent = new Map<string, GoalNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }

  const out: GoalNode[] = []
  const seen = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const node = nodes.find((n) => n.id === id)
    if (node) out.push(node)
    for (const child of byParent.get(id) ?? []) stack.push(child.id)
  }
  return out
}

/** Items belonging to a node or any of its descendants. */
export function itemsUnder(nodes: GoalNode[], items: Item[], rootId: string): Item[] {
  const ids = new Set(subtreeOf(nodes, rootId).map((n) => n.id))
  return items.filter((i) => i.nodeId && ids.has(i.nodeId))
}
