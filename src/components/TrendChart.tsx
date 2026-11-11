'use client'

/**
 * Multi-series line chart on ONE dollar axis, with a crosshair and tooltip.
 *
 * Client-side only for the hover layer; everything it draws is computed on the server
 * and passed in as plain data. Two or more series always get a legend AND direct
 * labels at the line ends, so identity never rests on colour alone. Annotations are
 * vertical markers for dated events (an emergency, a milestone).
 */

import { useRef, useState } from 'react'

export interface TrendSeries {
  key: string
  label: string
  color: string
  points: { date: string; value: number }[]
}

export interface TrendMarker {
  date: string
  label: string
  /** 'event' is drawn dashed in the critical status colour; 'milestone' as a dot on the axis. */
  kind: 'event' | 'milestone'
}

const usd0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const shortDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function TrendChart({
  series,
  markers = [],
  height = 300,
  ariaLabel,
  stepped = false,
  tipTitle = 'Payday',
}: {
  series: TrendSeries[]
  markers?: TrendMarker[]
  height?: number
  ariaLabel: string
  /** Draw as a step line — right for a balance, which holds until the next posting. */
  stepped?: boolean
  tipTitle?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const width = 760
  const padL = 56
  const padR = 92
  const padT = 18
  const padB = 30
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const dates = series[0]?.points.map((p) => p.date) ?? []
  if (dates.length === 0) return null
  const t = (d: string) => Date.parse(d + 'T00:00:00Z')
  const t0 = t(dates[0]!)
  const t1 = t(dates[dates.length - 1]!)
  const x = (d: string) => padL + ((t(d) - t0) / Math.max(1, t1 - t0)) * plotW

  const values = series.flatMap((s) => s.points.map((p) => p.value))
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const step = niceStep((max - min) / 4)
  const top = Math.ceil(max / step) * step
  const bottom = Math.floor(min / step) * step
  const y = (v: number) => padT + plotH - ((v - bottom) / (top - bottom)) * plotH
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step)
  const below = bottom < 0

  const months: string[] = []
  {
    const s = new Date(t0)
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + i, 1))
      if (d.getTime() > t1) break
      if (d.getTime() >= t0) months.push(d.toISOString().slice(0, 10))
    }
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    let best = 0
    let bestD = Infinity
    dates.forEach((d, i) => {
      const dist = Math.abs(x(d) - px)
      if (dist < bestD) {
        bestD = dist
        best = i
      }
    })
    setHover(best)
  }

  // Direct end labels, nudged apart if they would collide.
  const ends = series
    .map((s) => ({ s, v: s.points[s.points.length - 1]!.value }))
    .sort((a, b) => b.v - a.v)
  const endY: Record<string, number> = {}
  let last = -Infinity
  for (const e of ends) {
    const yy = Math.max(y(e.v), last + 28)
    endY[e.s.key] = yy
    last = yy
  }

  const hx = hover !== null ? x(dates[hover]!) : 0

  return (
    <div className="trend">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} stroke={v === 0 && below ? 'var(--muted)' : 'var(--grid)'} strokeWidth={v === 0 ? 1.2 : 0.6} />
            <text x={padL - 8} y={y(v) + 3.5} textAnchor="end">
              {v < 0 ? '−' : ''}
              {Math.abs(v) >= 1000 ? `$${Math.abs(v) / 1000}k` : `$${Math.abs(v)}`}
            </text>
          </g>
        ))}
        {below && (
          <g>
            <rect x={padL} y={y(0)} width={plotW} height={y(bottom) - y(0)} fill="var(--status-crit)" opacity={0.07} />
            <text x={padL + 6} y={y(bottom) - 6} style={{ fill: 'var(--status-crit)', fontWeight: 600 }}>
              ⚠ below zero — no overdraft protection
            </text>
          </g>
        )}
        {months.map((m) => (
          <text key={m} x={x(m)} y={height - 10} textAnchor="middle">
            {new Date(m + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
          </text>
        ))}

        {markers
          .filter((m) => t(m.date) >= t0 && t(m.date) <= t1)
          .map((m) =>
            m.kind === 'event' ? (
              <g key={m.date + m.label}>
                <line x1={x(m.date)} x2={x(m.date)} y1={padT} y2={padT + plotH} stroke="var(--status-crit)" strokeDasharray="4 3" strokeWidth={1.5} />
                <text x={x(m.date) + 4} y={padT + 10} style={{ fill: 'var(--status-crit)', fontWeight: 600 }}>
                  ⚠ {m.label}
                </text>
              </g>
            ) : (
              <g key={m.date + m.label}>
                <line x1={x(m.date)} x2={x(m.date)} y1={padT + 16} y2={padT + plotH} stroke="var(--muted)" strokeDasharray="2 3" strokeWidth={1} />
                <circle cx={x(m.date)} cy={padT + plotH} r={4.5} fill="var(--text)" stroke="var(--surface-1)" strokeWidth={2} />
                <text x={x(m.date) + 4} y={padT + 26} className="lbl" style={{ fontSize: 10.5 }}>
                  ✓ {m.label}
                </text>
              </g>
            ),
          )}

        {series.map((s) => {
          const d = s.points
            .map((p, i) =>
              i === 0
                ? `M${x(p.date)},${y(p.value)}`
                : stepped
                  ? `H${x(p.date)} V${y(p.value)}`
                  : `L${x(p.date)},${y(p.value)}`,
            )
            .join(' ')
          const lastP = s.points[s.points.length - 1]!
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(lastP.date)} cy={y(lastP.value)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
              <text x={x(lastP.date) + 8} y={endY[s.key]! + 4} className="lbl" style={{ fontWeight: 650 }}>
                {usd0(lastP.value)}
              </text>
              <text x={x(lastP.date) + 8} y={endY[s.key]! + 17}>
                {s.label}
              </text>
            </g>
          )
        })}

        {hover !== null && (
          <g>
            <line x1={hx} x2={hx} y1={padT} y2={padT + plotH} stroke="var(--muted)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.key} cx={hx} cy={y(s.points[hover]!.value)} r={5} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
            ))}
          </g>
        )}
        {/* Hit area larger than the marks. */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" />
      </svg>

      {hover !== null && (
        <div className="tip" style={{ left: `${(hx / width) * 100}%`, top: 4 }}>
          <div style={{ fontWeight: 650, marginBottom: 4 }}>{tipTitle} {shortDate(dates[hover]!)}</div>
          {series.map((s) => (
            <div className="row" key={s.key}>
              <span>
                <span className="swatch" style={{ background: s.color }} />
                {s.label}
              </span>
              <b>{usd0(s.points[hover]!.value)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}
