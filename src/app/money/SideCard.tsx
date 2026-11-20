/**
 * A paycheck (or month) card for Sommer's side or the household's, in the same look as
 * yours: categories you can open, lines with a bar on one scale (share of money in).
 */

import type { SideSection, SideStatement } from '@/core/money/sides'

const COLORS: Record<string, string> = {
  income: '#a3aab6',
  deductions: '#6b7280',
  home: '#3987e5',
  car: '#d95926',
  food: '#7cb342',
  childcare: '#199e70',
  gifts: '#e06fb0',
  personal: '#c98500',
  tech: '#2fb5c9',
  debt: '#d55181',
  invest: '#9085e9',
  other: '#8a93a3',
  cash: '#a3aab6',
}

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function SideCard({
  side,
  who,
  tag,
  title,
  subtitle,
  wide = false,
}: {
  side: SideStatement
  who: 'sommer' | 'both'
  tag: string
  title: string
  subtitle: string
  wide?: boolean
}) {
  const scale = Math.max(1, side.income.total)
  const pct = (n: number) => `${((n / scale) * 100).toFixed(1)}%`
  const bar = (n: number, color: string) => (
    <div className="bbar" aria-hidden>
      <span className="bbar-left" style={{ width: `${Math.min(100, Math.max(1.5, (Math.abs(n) / scale) * 100))}%`, borderColor: color, background: `${color}33` }} />
    </div>
  )
  const sec = (s: SideSection, sign: '−' | '+' | '', open = false) => (
    <details className="sec" key={s.key} open={open}>
      <summary>
        <div className="sec-top">
          <span className="sec-name">
            <i className="swatch-dot" style={{ background: COLORS[s.key] ?? '#8a93a3' }} />
            {s.label}
          </span>
          <span className="sec-amt">
            {sign}
            {usd(Math.abs(s.total)).replace('−', '')}
            <span className="ln-pct">{pct(s.total)}</span>
          </span>
        </div>
        {bar(s.total, COLORS[s.key] ?? '#8a93a3')}
      </summary>
      <div className="sec-body">
        {s.lines.map((l) => (
          <div className="ln" key={`${l.owner}:${l.label}`} title={l.note}>
            <div className="ln-top">
              <div className="ln-name">
                {l.label}
                {who === 'both' && <span className={`who-tag ${l.owner}`}>{l.owner === 'sam' ? 'Sam' : 'Sommer'}</span>}
              </div>
              <div className="ln-amt">{usd(l.amount)}</div>
            </div>
            {bar(l.amount, COLORS[s.key] ?? '#8a93a3')}
          </div>
        ))}
      </div>
    </details>
  )
  const out = side.sections.reduce((t, s) => t + s.total, 0)
  const saved = side.sections.find((s) => s.key === 'invest')?.total ?? 0
  const half = Math.ceil(side.sections.length / 2)
  const left = [sec(side.income, '+', true), ...(side.deductions ? [sec(side.deductions, '−')] : [])]
  return (
    <article className={`pcard side-card${wide ? ' pcard-wide' : ''}`}>
      <header className="pcard-head">
        <div>
          <div className="pcard-tag">{tag}</div>
          <div className="pcard-title">{title}</div>
          <div className="pcard-sub">{subtitle}</div>
        </div>
        <div className="pcard-gross">
          <div className="pcard-big">{usd(side.income.total)}</div>
          <div className="pcard-sub">
            {who === 'sommer' ? 'in' : 'household in'} · {usd(saved)} saved & invested
          </div>
        </div>
      </header>
      <div className="pcard-body">
        <div className="pcol">
          {left}
          {wide ? null : side.sections.map((s) => sec(s, '−'))}
          {!wide && side.netCash && sec(side.netCash, side.netCash.total < 0 ? '−' : '+')}
        </div>
        {wide && (
          <div className="pcol">
            {side.sections.slice(0, half).map((s) => sec(s, '−'))}
            {side.sections.slice(half).map((s) => sec(s, '−'))}
            {side.netCash && sec(side.netCash, side.netCash.total < 0 ? '−' : '+')}
          </div>
        )}
      </div>
      <div className="side-foot ln-dim">
        Out {usd(out)}
        {side.deductions ? ` · deductions ${usd(side.deductions.total)}` : ''}
        {side.netCash ? ` · net cash ${usd(side.netCash.total)}` : ''} — ties to money in.
      </div>
    </article>
  )
}
