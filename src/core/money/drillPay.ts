/**
 * Drill and duty back pay — the one-off amounts that arrive outside the semi-monthly
 * cycle and therefore outside every other model in this directory.
 *
 * Worth its own file because the arithmetic is unlike active-duty pay in one specific
 * way that catches people out: **a drill period pays 1/30th of MONTHLY basic pay, and
 * carries no allowances at all.** No BAH, no BAS. So four drills in a weekend is not
 * "a day's pay" — it is 4/30ths of a month, which is more than a day, and none of it
 * is the tax-free part.
 *
 * Nothing here is CZTE-eligible unless the duty was performed in the zone. Drills
 * performed at home station before you shipped are ordinary taxable wages.
 */

import { round2 } from './paychecks'
import { ENTITLEMENTS, TAX } from './rates'

/** One drill period. The Army pays these in units of one, not in days. */
export const MUTAS_PER_DRILL_DAY = 2

function monthlyBasicPay(): number {
  return ENTITLEMENTS.find((e) => e.key === 'base_pay')!.monthlyAmount
}

function monthlyBas(): number {
  return ENTITLEMENTS.find((e) => e.key === 'bas')!.monthlyAmount
}

/** What a single MUTA is worth: 1/30th of monthly basic pay, no allowances. */
export function mutaRate(): number {
  return round2(monthlyBasicPay() / 30)
}

/**
 * How the three days documented on the 1380 should be read.
 *
 * A DD Form 1380 records reserve duty performed outside a scheduled assembly, and the
 * same form covers two things that pay very differently. This is the single largest
 * uncertainty in the figure, so it is a parameter rather than a silent assumption.
 */
export type DutyDayBasis =
  /** Inactive duty training in day status: each day is two drill periods. */
  | 'idt_two_mutas'
  /** Active duty for training: 1/30th of basic pay per day, plus BAS. */
  | 'adt_day'

export interface BackPayLine {
  key: string
  label: string
  amount: number
  taxable: boolean
  /** Subject to FICA. Basic pay is; allowances are not. */
  fica: boolean
  note: string
}

export interface BackPay {
  lines: BackPayLine[]
  gross: number
  federalTax: number
  fica: number
  net: number
  basis: DutyDayBasis
  warnings: string[]
}

export interface BackPayInputs {
  mutas: number
  dutyDays: number
  basis?: DutyDayBasis
  /** True only if the duty itself was performed inside the combat zone. */
  czte?: boolean
}

/**
 * Value a batch of drills and duty days.
 *
 * Deliberately returns both halves of the tax bite separately: withholding on a
 * lump-sum back payment is often heavier than the eventual liability, and seeing the
 * federal and FICA components apart makes it obvious which part comes back at filing
 * (the federal) and which never does (FICA).
 */
export function backPay(inputs: BackPayInputs): BackPay {
  const { mutas, dutyDays } = inputs
  const basis = inputs.basis ?? 'adt_day'
  const czte = inputs.czte ?? false

  const rate = mutaRate()
  const lines: BackPayLine[] = []

  if (mutas > 0) {
    lines.push({
      key: 'mutas',
      label: `${mutas} drill periods (MUTAs)`,
      amount: round2(rate * mutas),
      taxable: true,
      fica: true,
      note: `${mutas} × ${rate.toFixed(2)}, being 1/30th of monthly basic pay each. No allowances.`,
    })
  }

  if (dutyDays > 0) {
    if (basis === 'idt_two_mutas') {
      lines.push({
        key: 'duty_days',
        label: `${dutyDays} duty days as IDT (${MUTAS_PER_DRILL_DAY} MUTAs each)`,
        amount: round2(rate * MUTAS_PER_DRILL_DAY * dutyDays),
        taxable: true,
        fica: true,
        note: `${dutyDays} × ${MUTAS_PER_DRILL_DAY} × ${rate.toFixed(2)}. Still basic pay only.`,
      })
    } else {
      lines.push({
        key: 'duty_days',
        label: `${dutyDays} duty days as ADT — basic pay`,
        amount: round2(rate * dutyDays),
        taxable: true,
        fica: true,
        note: `${dutyDays} × ${rate.toFixed(2)}, at 1/30th of monthly basic pay per day.`,
      })
      lines.push({
        key: 'duty_days_bas',
        label: `${dutyDays} duty days — BAS`,
        amount: round2((monthlyBas() / 30) * dutyDays),
        taxable: false,
        fica: false,
        note: 'Allowance, so it is not taxed. Paid on active-duty days, never on drills.',
      })
    }
  }

  const gross = round2(lines.reduce((s, l) => s + l.amount, 0))
  const taxableGross = round2(
    lines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0),
  )
  const ficaBase = round2(lines.filter((l) => l.fica).reduce((s, l) => s + l.amount, 0))

  const federalTax = czte ? 0 : round2(taxableGross * TAX.effectiveFederalRate)
  const fica = round2(ficaBase * TAX.ficaRate)

  const warnings = [
    'A drill period pays 1/30th of MONTHLY basic pay and carries NO allowances — no ' +
      'BAH, no BAS. Drill pay is not a fraction of a normal paycheck.',
    basis === 'adt_day'
      ? 'The three 1380 days are modelled as ACTIVE DUTY days: 1/30th of basic pay each, ' +
        'plus BAS. If they were instead inactive duty in day status they pay two drill ' +
        'periods each, which is worth substantially more. Check which the orders say.'
      : 'The duty days are modelled as INACTIVE duty at two drill periods each. If they ' +
        'were active duty for training they pay 1/30th of basic pay per day plus BAS, ' +
        'which is less. Check which the orders say.',
    czte
      ? 'CZTE applied: the duty was performed in the zone, so federal income tax is zero. ' +
        'FICA still comes out.'
      : 'No CZTE: drills performed at home station before you shipped are ordinary ' +
        'taxable wages, however close to the deployment they fall.',
    'Withholding on a lump-sum back payment is often heavier than the eventual ' +
      'liability. The federal share comes back at filing; FICA never does.',
  ]

  return {
    lines,
    gross,
    federalTax,
    fica,
    net: round2(gross - federalTax - fica),
    basis,
    warnings,
  }
}

/**
 * The batch you are owed: 7 MUTAs plus 3 days recorded on a 1380, expected this month.
 * Edit here when the amount is confirmed against the LES.
 */
export const EXPECTED_BACK_PAY: BackPayInputs = {
  mutas: 7,
  dutyDays: 3,
  /** Conservative reading — see the warning it produces. */
  basis: 'adt_day',
  czte: false,
}
