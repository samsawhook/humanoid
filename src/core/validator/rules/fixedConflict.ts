import type { Proposal, ProposedBlock, World } from '../../types.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Double-booking. The single most common way a language model silently ruins a plan.
 *
 * Two soft blocks overlapping is a soft violation — the day gets re-slotted anyway and
 * the queue is an ordering, not a timetable. Anything involving a firm block is hard:
 * firm means drill, an appointment, something with a consequence for missing it.
 *
 * Commitments are always firm regardless of what the proposal claims, since they are
 * externally imposed and consume capacity before anything else is allocated.
 */
export function fixedConflict(world: World, proposal: Proposal): Violation[] {
  const out: Violation[] = []

  const commitmentBlocks: ProposedBlock[] = world.commitments
    .filter((c) => overlapsScope(c.startsAt, c.endsAt, proposal))
    .map((c) => ({
      itemId: null,
      commitmentId: c.id,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      firmness: 'firm' as const,
    }))

  const all = [...commitmentBlocks, ...proposal.blocks].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )

  for (let i = 0; i < all.length; i++) {
    const a = all[i]
    if (!a) continue

    if (a.endsAt.getTime() <= a.startsAt.getTime()) {
      out.push({
        code: VIOLATION_CODES.FIXED_CONFLICT,
        severity: 'hard',
        message: `${describe(world, a)} ends at or before it starts.`,
        subjectType: 'block',
        subjectId: a.itemId ?? a.commitmentId,
      })
      continue
    }

    for (let j = i + 1; j < all.length; j++) {
      const b = all[j]
      if (!b) continue
      // Sorted by start, so once b starts after a ends nothing later can overlap a.
      if (b.startsAt.getTime() >= a.endsAt.getTime()) break

      const bothCommitments = a.commitmentId !== null && b.commitmentId !== null
      const eitherFirm = a.firmness === 'firm' || b.firmness === 'firm'
      const overlapMinutes = Math.round(
        (Math.min(a.endsAt.getTime(), b.endsAt.getTime()) -
          Math.max(a.startsAt.getTime(), b.startsAt.getTime())) /
          60_000,
      )

      out.push({
        code: VIOLATION_CODES.FIXED_CONFLICT,
        severity: eitherFirm ? 'hard' : 'soft',
        message:
          `${describe(world, a)} overlaps ${describe(world, b)} by ${overlapMinutes} min` +
          (bothCommitments
            ? '. Both are external commitments — this is a real-world conflict the plan cannot resolve.'
            : eitherFirm
              ? '. One of them is firm, so the other has to move.'
              : '. Both are elastic; re-slotting will resolve it.'),
        subjectType: 'block',
        subjectId: a.itemId ?? a.commitmentId,
        details: {
          overlapMinutes,
          a: { itemId: a.itemId, commitmentId: a.commitmentId },
          b: { itemId: b.itemId, commitmentId: b.commitmentId },
        },
      })
    }
  }

  return out
}

function describe(world: World, block: ProposedBlock): string {
  if (block.commitmentId) {
    const c = world.commitments.find((x) => x.id === block.commitmentId)
    return `commitment "${c?.title ?? block.commitmentId}"`
  }
  const i = world.items.find((x) => x.id === block.itemId)
  return `"${i?.title ?? block.itemId ?? 'unknown block'}"`
}

function overlapsScope(start: Date, end: Date, proposal: Proposal): boolean {
  // Cheap date-string bound; blocks are compared precisely above.
  const startDay = start.toISOString().slice(0, 10)
  const endDay = end.toISOString().slice(0, 10)
  return endDay >= proposal.scopeStart && startDay <= proposal.scopeEnd
}
