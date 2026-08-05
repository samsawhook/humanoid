/**
 * The validator.
 *
 * Pure functions, no network, no database, no clock. Every proposal the model makes
 * comes through here before it is trusted, and what comes back is a list of named
 * violations — never a boolean, never a score.
 *
 * The division of labour this enforces: the model has judgment and does not do
 * arithmetic. It reads the numbers this file produces.
 */

import type { Proposal, World } from '../types.js'
import type { Violation } from './codes.js'
import { emptyState } from './rules/emptyState.js'
import { orphanNode } from './rules/orphanNode.js'
import { missingOutcomeDefinition } from './rules/missingOutcomeDefinition.js'
import { dependencyCycle } from './rules/dependencyCycle.js'
import { fixedConflict } from './rules/fixedConflict.js'
import { overCapacity } from './rules/overCapacity.js'
import { windowBreach } from './rules/windowBreach.js'
import { unreachableVelocity } from './rules/unreachableVelocity.js'

export type Rule = (world: World, proposal: Proposal) => Violation[]

/**
 * Order matters only for readability of the output — every rule runs regardless.
 * Returning all violations at once is the point: a revision round that fixes one
 * problem and discovers the next one on the following round wastes a round.
 */
export const RULES: { name: string; run: Rule }[] = [
  { name: 'emptyState', run: emptyState },
  { name: 'orphanNode', run: orphanNode },
  { name: 'missingOutcomeDefinition', run: missingOutcomeDefinition },
  { name: 'dependencyCycle', run: dependencyCycle },
  { name: 'fixedConflict', run: fixedConflict },
  { name: 'overCapacity', run: overCapacity },
  { name: 'windowBreach', run: windowBreach },
  { name: 'unreachableVelocity', run: unreachableVelocity },
]

export interface ValidationResult {
  violations: Violation[]
  /** Hard violations block activation. Soft ones are narrated and kept. */
  feasible: boolean
  hardCount: number
  softCount: number
}

export function validate(world: World, proposal: Proposal): ValidationResult {
  const violations: Violation[] = []

  for (const rule of RULES) {
    try {
      violations.push(...rule.run(world, proposal))
    } catch (error) {
      // A rule that throws must not take the whole pass down — a partial verdict with
      // an explicit gap is far more useful than no verdict, and silently dropping the
      // rule would produce a plan that looks validated and isn't.
      violations.push({
        code: 'EMPTY_STATE',
        severity: 'hard',
        message:
          `Validator rule "${rule.name}" failed to run: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'This plan is NOT validated against that rule.',
        subjectType: 'world',
        subjectId: null,
        details: { rule: rule.name },
      })
    }
  }

  const hardCount = violations.filter((v) => v.severity === 'hard').length
  const softCount = violations.length - hardCount

  return { violations, feasible: hardCount === 0, hardCount, softCount }
}

export { VIOLATION_CODES } from './codes.js'
export type { Violation, ViolationCode, Severity } from './codes.js'
