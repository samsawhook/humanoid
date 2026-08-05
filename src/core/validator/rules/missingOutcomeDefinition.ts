import type { World, Proposal } from '../../types.js'
import { VIOLATION_CODES, type Violation } from '../codes.js'

/**
 * Goals are defined by output, never by time spent. See LIFE_DASH.md D2.
 *
 * This is the enforcement point for that rule. An achievement node has to say what
 * output counts as achieved, and "study 10 hrs/wk" is not an output — it's a
 * prediction about cost, and predictions get corrected by measurement instead of
 * being chased.
 *
 * The phrase check is a tripwire, not a parser. It catches the obvious cases and is
 * meant to be easy to read and easy to extend; anything subtler is a judgment call
 * that belongs to the model narrating the plan, not to a regex.
 */

const TIME_SHAPED = [
  /\b\d+\s*(hours?|hrs?|minutes?|mins?)\b/i,
  /\bhours?\s+(per|a|each)\s+(day|week|month)\b/i,
  /\bspend\s+(time|\d)/i,
  /\btime\s+(on|spent)\b/i,
  /\b(daily|weekly)\s+(hours?|time)\b/i,
]

export function missingOutcomeDefinition(world: World, _proposal: Proposal): Violation[] {
  const out: Violation[] = []

  for (const node of world.nodes) {
    if (node.kind !== 'achievement') continue
    if (node.status === 'abandoned' || node.status === 'achieved') continue

    const definition = node.outcomeDefinition?.trim() ?? ''

    if (definition.length === 0) {
      out.push({
        code: VIOLATION_CODES.MISSING_OUTCOME_DEFINITION,
        severity: 'hard',
        message:
          `"${node.title}" is an achievement node with no stated outcome. Say what ` +
          'output counts as achieved — a score, a submission, a completion, a figure.',
        subjectType: 'node',
        subjectId: node.id,
      })
      continue
    }

    const matched = TIME_SHAPED.find((re) => re.test(definition))
    if (matched) {
      out.push({
        code: VIOLATION_CODES.MISSING_OUTCOME_DEFINITION,
        severity: 'hard',
        message:
          `"${node.title}" defines success as time spent ("${definition}"). Hours are ` +
          'a cost, not a goal. Restate this as the output the hours are meant to ' +
          'produce; the hours will be estimated from it.',
        subjectType: 'node',
        subjectId: node.id,
        details: { outcomeDefinition: definition },
      })
    }
  }

  return out
}
