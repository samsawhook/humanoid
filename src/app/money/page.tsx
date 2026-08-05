/**
 * The cash-flow ladder: what lands on each 1st and 15th, and where it goes.
 *
 * Computed entirely in-process from `/src/core/money`. No database — which means this
 * page works before the schema is applied, and it stays honest about being a
 * projection rather than a record of what happened.
 */

import { projectPaychecks } from '@/core/money/paychecks'
import { allocateAll, summarize } from '@/core/money/allocation'
import { OBLIGATIONS } from '@/core/money/obligations'
import { ENTITLEMENTS, TAX, TIMELINE } from '@/core/money/rates'

export const dynamic = 'force-dynamic'

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const usdCents = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const HORIZON_START = '2026-08-15'
const HORIZON_END = '2027-08-01'

export default function MoneyPage() {
  const paychecks = projectPaychecks(HORIZON_START, HORIZON_END)
  const allocations = allocateAll(paychecks, OBLIGATIONS)
  const summary = summarize(allocations)

  const lowConfidence = ENTITLEMENTS.filter((e) => e.confidence === 'low')

  return (
    <>
      <h1>Money</h1>
      <p className="sub">
        Projection from {HORIZON_START} to {HORIZON_END}. Deployment {TIMELINE.deploymentStart},
        CZTE from {TIMELINE.czteStart}, expected return {TIMELINE.expectedReturn}.
      </p>

      {lowConfidence.length > 0 && (
        <div className="note">
          <strong>Estimated rates.</strong> {lowConfidence.length} figures are low-confidence
          and drive everything below:{' '}
          {lowConfidence.map((e) => `${e.label} (${usd(e.monthlyAmount)}/mo)`).join(', ')}. Correct
          them in <code>src/core/money/rates.ts</code> and every number on this page updates.
          Federal tax is modelled as a flat {(TAX.effectiveFederalRate * 100).toFixed(0)}% effective
          rate outside CZTE.
        </div>
      )}

      <div className="cards">
        <Card k="Paychecks" v={String(summary.paychecks)} />
        <Card k="Net income" v={usd(summary.totalNet)} />
        <Card k="Obligations" v={usd(summary.totalObligations)} />
        <Card
          k="Total shortfall"
          v={usd(summary.totalShortfall)}
          tone={summary.totalShortfall > 0 ? 'bad' : 'good'}
        />
        <Card k="Left over" v={usd(summary.totalRemainder)} tone="good" />
        <Card
          k="First short payday"
          v={summary.firstShortPayday ?? 'none'}
          tone={summary.firstShortPayday ? 'warn' : 'good'}
        />
      </div>

      <h2>Every payday</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Lands</th>
              <th>Covers</th>
              <th>CZTE</th>
              <th>Gross</th>
              <th>Fed tax</th>
              <th>FICA</th>
              <th>Net</th>
              <th>Owed</th>
              <th>Short</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.paycheck.scheduledDate}>
                <td>
                  {a.paycheck.payDate}
                  {a.paycheck.payDate !== a.paycheck.scheduledDate && (
                    <span className="muted"> (from {a.paycheck.scheduledDate.slice(8)})</span>
                  )}
                </td>
                <td className="muted">
                  {a.paycheck.periodStart.slice(5)} – {a.paycheck.periodEnd.slice(5)}
                </td>
                <td>
                  <span className={a.paycheck.czte ? 'tag on' : 'tag'}>
                    {a.paycheck.czte ? 'yes' : 'no'}
                  </span>
                </td>
                <td>{usdCents(a.paycheck.gross)}</td>
                <td className={a.paycheck.federalTax === 0 ? 'good' : ''}>
                  {usdCents(a.paycheck.federalTax)}
                </td>
                <td>{usdCents(a.paycheck.fica)}</td>
                <td>
                  <strong>{usdCents(a.paycheck.net)}</strong>
                </td>
                <td>{usdCents(a.totalRequested)}</td>
                <td className={a.totalShortfall > 0 ? 'bad' : 'muted'}>
                  {a.totalShortfall > 0 ? usdCents(a.totalShortfall) : '—'}
                </td>
                <td className={a.remainder > 0 ? 'good' : 'muted'}>{usdCents(a.remainder)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Where it goes — next six paydays</h2>
      <p className="sub">
        Strict priority, not proportional. A partial mortgage payment and a partial car payment is
        worse than one whole payment, so the house is cured first and savings absorb the squeeze.
      </p>
      {allocations.slice(0, 6).map((a) => (
        <div className="panel" key={a.paycheck.scheduledDate}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>{a.paycheck.payDate}</strong>
            <span className="muted">
              net {usdCents(a.paycheck.net)} · left {usdCents(a.remainder)}
              {a.totalShortfall > 0 && (
                <span className="bad"> · short {usdCents(a.totalShortfall)}</span>
              )}
            </span>
          </div>
          <table style={{ marginTop: 8 }}>
            <tbody>
              {a.lines.map((l) => (
                <tr key={l.key}>
                  <td>{l.label}</td>
                  <td className="muted">{l.kind.replace(/_/g, ' ')}</td>
                  <td>{usdCents(l.requested)}</td>
                  <td className={l.shortfall > 0 ? 'bad' : 'good'}>
                    {l.shortfall > 0 ? `${usdCents(l.allocated)} paid` : 'paid'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Entitlement timeline</h2>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Entitlement</th>
              <th>Monthly</th>
              <th>Taxable</th>
              <th>From</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {ENTITLEMENTS.map((e) => (
              <tr key={e.key}>
                <td>
                  {e.label}
                  {e.note && <div className="muted" style={{ fontSize: 12, whiteSpace: 'normal' }}>{e.note}</div>}
                </td>
                <td>{usd(e.monthlyAmount)}</td>
                <td className="muted">{e.taxable ? 'yes' : 'no'}</td>
                <td className="muted">{e.activeFrom ?? 'now'}</td>
                <td className={e.confidence === 'low' ? 'bad' : e.confidence === 'medium' ? 'warn' : 'good'}>
                  {e.confidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Card({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="panel card">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
    </div>
  )
}
