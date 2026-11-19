/**
 * Every return scenario you have named, as variants of the three paths in paths.ts.
 *
 *  - Law, full-time from Aug 2027: Texas Tech (Lubbock), UH (Houston), UNT Dallas, Texas A&M
 *    (Fort Worth — a reach). Each then moves to Austin for tax or transactional work.
 *  - Law at night with a day job: UH part-time evening (Houston), UNT Dallas evening.
 *  - MAcc → CPA from Corpus: a federal or contractor job, a mid-size public firm, a small
 *    local firm, your own practice — and the countryside fork (remote, federal).
 *
 * Pay ladders and city costs are MY ESTIMATES, in 2027 dollars, and every scenario lists
 * what it depends on. The deployment months are the payday plan itself, identical in all.
 */

import type { LocalDate } from '../types'
import { LAW_SCHOOLS } from './lawschool'
import { PATH_ASSUMPTIONS, type PathKey } from './paths'

type Assumptions = typeof PATH_ASSUMPTIONS
type Anchor = [string, number]

export type ScenarioGroup = 'law' | 'evening' | 'cpa'

export interface Scenario {
  id: string
  group: ScenarioGroup
  /** Short name for buttons. */
  short: string
  label: string
  path: PathKey
  a: Assumptions
  /** What it depends on: the assumptions that would change the answer most. */
  dependsOn: string[]
}

export const GROUP_LABEL: Record<ScenarioGroup, string> = {
  law: 'Law school, full-time',
  evening: 'Law at night, with a day job',
  cpa: 'MAcc → CPA',
}

const school = (k: string) => LAW_SCHOOLS.find((s) => s.key === k)!
const base = PATH_ASSUMPTIONS
const COMMON = ['VA rating 50% (your range 30–80%)', 'Off orders 31 Jul 2027']

function law(k: string, short: string, city: string, extra: string[] = []): Scenario {
  return {
    id: `law_${k}`,
    group: 'law',
    short,
    label: `Law school — ${school(k).name.replace('University of Houston Law Center', 'UH Law Center')} (${city}), then Austin`,
    path: 'law',
    a: { ...base, label: undefined, law: { ...base.law, school: school(k) } },
    dependsOn: [
      ...extra,
      'Admission for fall 2027',
      `GI Bill housing at ${city} rates (80% tier)`,
      'Re-enlist bonus $10k (Sep 2027)',
      'Corpus house let at ~$1,705',
      'Summer jobs $10k, then $45k',
      ...COMMON,
    ],
  }
}

function evening(k: string, short: string, rent: number, dayJobScale: number): Scenario {
  const s = school(k)
  return {
    id: `night_${k}`,
    group: 'evening',
    short,
    label: `Night law — ${s.name.replace('University of Houston Law Center', 'UH Law Center')} evening, working in ${s.city}`,
    path: 'night',
    a: { ...base, label: undefined, night: { ...base.night, school: s, rent, dayJobScale } },
    dependsOn: [
      `A finance or audit day job in ${s.city} by Nov 2027`,
      'Admission to the evening JD',
      'Four years of night school with a young family',
      'Corpus house let at ~$1,705',
      ...COMMON,
    ],
  }
}

function cpa(id: string, short: string, label: string, salary: Anchor[], opts: Partial<Assumptions['macc']> = {}, dependsOn: string[] = []): Scenario {
  return {
    id,
    group: 'cpa',
    short,
    label,
    path: 'macc',
    a: { ...base, label, macc: { ...base.macc, salary, ...opts } },
    dependsOn: [...dependsOn, 'MAcc done Dec 2027 (Hazlewood back after the A)', 'CPA passed by mid-2028', ...COMMON],
  }
}

export const SCENARIOS: Scenario[] = [
  law('ttu', 'Texas Tech', 'Lubbock'),
  law('uh', 'UH (full-time)', 'Houston'),
  law('unt', 'UNT Dallas (full-time)', 'Dallas'),
  law('tamu', 'Texas A&M (reach)', 'Fort Worth', ['A reach admit — the numbers may not get you in']),
  evening('uh', 'UH evening', 2300, 1.06),
  evening('unt', 'UNT Dallas evening', 2400, 1.08),
  cpa('cpa_fed', 'Federal / contractor', 'MAcc → CPA — federal or contractor job, Corpus', base.macc.salary, {}, [
    'A GS-11/12 federal FM or audit job, or a defense contractor, by Nov 2027',
  ]),
  cpa(
    'cpa_mid',
    'Mid-size public firm',
    'MAcc → CPA — mid-size public accounting firm',
    [
      ['2027-11', 78000],
      ['2029-09', 90000],
      ['2031-09', 115000],
      ['2034-09', 145000],
      ['2037-09', 185000],
      ['2041-09', 240000],
      ['2046-12', 280000],
    ],
    {},
    ['A senior-associate offer by Nov 2027 (audit experience counts)', 'Busy-season hours'],
  ),
  cpa(
    'cpa_small',
    'Small firm',
    'MAcc → CPA — small local firm',
    [
      ['2027-11', 65000],
      ['2029-09', 75000],
      ['2031-09', 90000],
      ['2034-09', 105000],
      ['2037-09', 120000],
      ['2041-09', 150000],
      ['2046-12', 175000],
    ],
    {},
    ['A local firm hire by Nov 2027', 'A partner buy-in later, if offered'],
  ),
  cpa(
    'cpa_sole',
    'Sole proprietor',
    'MAcc → CPA — your own practice',
    [
      ['2027-11', 25000],
      ['2028-09', 40000],
      ['2029-09', 65000],
      ['2031-09', 100000],
      ['2034-09', 140000],
      ['2037-09', 170000],
      ['2041-09', 200000],
      ['2046-12', 240000],
    ],
    { selfEmployed: true, practiceCosts: 400 },
    ['Clients: the practice ramps from ~$25k of bookkeeping', 'Self-employment tax; no employer match; $400/mo practice costs'],
  ),
  {
    id: 'cpa_country',
    group: 'cpa',
    short: 'Countryside (remote)',
    label: 'MAcc → CPA — remote federal job, countryside',
    path: 'macc',
    a: { ...base, label: undefined, macc: { ...base.macc, countryside: { ...base.macc.countryside, enabled: true } } },
    dependsOn: ['A remote role (national applicant pool)', 'VA loan on acreage; seller pays 2 points', 'MAcc done Dec 2027', 'CPA passed by mid-2028', ...COMMON],
  },
]

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id)!

/** The date this was last aligned with the plan. */
export const SCENARIOS_AS_OF: LocalDate = '2026-11-19'
