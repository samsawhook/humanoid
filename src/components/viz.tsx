/**
 * Chart primitives. Server-rendered inline SVG — no chart library, no client JS.
 *
 * Colours come from the validated palette in globals.css by role (`--series-N`),
 * never as raw hex here, so light and dark swap in one place. Three light-mode
 * slots sit below 3:1 contrast, which under the relief rule obligates visible
 * labels and a table view — so every chart below ships a legend, direct labels on
 * the segments big enough to hold one, and a `<TableView>` fallback. That is a
 * requirement, not decoration.
 */

import type { ReactNode } from 'react'

export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
] as const

/** Assign by entity, in fixed order — never by rank, never cycled. */
export function seriesColor(index: number): string {
  return SERIES[index] ?? 'var(--series-rest)'
}

export function Figure({
  title,
  caption,
  children,
}: {
  title: string
  caption?: ReactNode
  children: ReactNode
}) {
  return (
    <figure className="panel viz">
      <div style={{ fontWeight: 650, marginBottom: 10 }}>{title}</div>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className="swatch" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function TableView({ children }: { children: ReactNode }) {
  return (
    <details className="tbl">
      <summary>Table view</summary>
      <div className="scroll">{children}</div>
    </details>
  )
}

export interface StackSegment {
  key: string
  label: string
  value: number
  color: string
  /**
   * The part of this line that was asked for and NOT covered.
   *
   * Drawn hatched, directly above its own paid portion, in its own colour. A single
   * red cap on top of the stack tells you that something was cut but not what — which
   * is a chart that raises an alarm and then withholds the answer.
   */
  unmet?: number
  /**
   * Drawn faded and dashed rather than solid: present in the total but not part of
   * what you keep. Used for tax withheld, so the solid stack height IS net pay.
   */
  hatched?: boolean
}

export interface StackColumn {
  label: string
  sublabel?: string
  segments: StackSegment[]
  /** Reference line, e.g. net pay for that column. */
  rule?: number
}

/**
 * Stacked columns with a 2px surface gap between segments, 4px rounded ends on the
 * topmost segment only, and an optional hatched shortfall cap.
 */
export function StackedBars({
  columns,
  height = 240,
  format = (n: number) => String(Math.round(n)),
  minLabel = 34,
}: {
  columns: StackColumn[]
  height?: number
  format?: (n: number) => string
  minLabel?: number
}) {
  const padL = 8
  const padB = 42
  const colW = 46
  const gap = 10
  const plotH = height - padB
  const width = padL * 2 + columns.length * colW + (columns.length - 1) * gap

  const max = Math.max(
    ...columns.map((c) => c.segments.reduce((s, x) => s + x.value + (x.unmet ?? 0), 0)),
    1,
  )
  const y = (v: number) => plotH - (v / max) * plotH

  return (
    <div className="scroll">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stacked obligations per payday"
      >
        <line className="axis" x1={0} y1={plotH} x2={width} y2={plotH} />
        {columns.map((col, ci) => {
          const x = padL + ci * (colW + gap)
          let cursor = 0
          return (
            <g key={col.label}>
              {col.segments.map((seg, si) => {
                const unmet = seg.unmet ?? 0
                if (seg.value <= 0 && unmet <= 0) return null
                const isTop = si === col.segments.length - 1
                const parts = []

                if (seg.value > 0) {
                  const yTop = y(cursor + seg.value)
                  const h = Math.max(0, y(cursor) - yTop - 2)
                  parts.push(
                    <g className="mark" key={seg.key}>
                      <title>{`${col.label} — ${seg.label}: ${format(seg.value)}`}</title>
                      <rect
                        x={x}
                        y={yTop}
                        width={colW}
                        height={h}
                        fill={seg.color}
                        fillOpacity={seg.hatched ? 0.18 : 1}
                        stroke={seg.hatched ? seg.color : 'none'}
                        strokeWidth={seg.hatched ? 1.5 : 0}
                        strokeDasharray={seg.hatched ? '3 2' : undefined}
                        rx={isTop && unmet <= 0 ? 4 : 0}
                      />
                      {h >= minLabel && !seg.hatched && (
                        <text
                          x={x + colW / 2}
                          y={yTop + h / 2 + 4}
                          textAnchor="middle"
                          style={{ fill: 'var(--surface-1)', fontWeight: 600 }}
                        >
                          {format(seg.value)}
                        </text>
                      )}
                    </g>,
                  )
                  cursor += seg.value
                }

                if (unmet > 0) {
                  const yTop = y(cursor + unmet)
                  const h = Math.max(0, y(cursor) - yTop - 2)
                  parts.push(
                    <g className="mark" key={`${seg.key}-unmet`}>
                      <title>{`${col.label} — ${seg.label}: ${format(unmet)} NOT covered`}</title>
                      <rect
                        x={x}
                        y={yTop}
                        width={colW}
                        height={h}
                        fill={seg.color}
                        fillOpacity={0.18}
                        stroke={seg.color}
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                        rx={isTop ? 4 : 0}
                      />
                    </g>,
                  )
                  cursor += unmet
                }

                return <g key={`${seg.key}-group`}>{parts}</g>
              })}

              <text x={x + colW / 2} y={plotH + 15} textAnchor="middle" className="lbl">
                {col.label}
              </text>
              {col.sublabel && (
                <text x={x + colW / 2} y={plotH + 29} textAnchor="middle">
                  {col.sublabel}
                </text>
              )}
            </g>
          )
        })}

        <defs>
          <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="var(--surface-1)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--status-critical)" strokeWidth="3" />
          </pattern>
        </defs>
      </svg>
    </div>
  )
}

export interface TimelineBar {
  key: string
  label: string
  start: string
  end: string
  color: string
  /** Rendered hatched — a window whose dates are estimates, not confirmed. */
  estimated?: boolean
  note?: string
}

/**
 * A horizontal timeline of windows. Windows are the point of this whole system:
 * a deadline can be missed and rescheduled, a window can only be missed, so the
 * thing worth seeing is how they overlap and when they shut.
 */
export function Timeline({
  bars,
  from,
  to,
  today,
  rowH = 30,
  labelW = 168,
}: {
  bars: TimelineBar[]
  from: string
  to: string
  today: string
  rowH?: number
  labelW?: number
}) {
  const t0 = Date.parse(from + 'T00:00:00Z')
  const t1 = Date.parse(to + 'T00:00:00Z')
  const plotW = 620
  const width = labelW + plotW + 12
  const height = bars.length * rowH + 34

  const x = (d: string) =>
    labelW + ((Date.parse(d + 'T00:00:00Z') - t0) / (t1 - t0)) * plotW

  // Tick density has to follow the span, or a life-scale chart prints a hundred
  // overlapping labels. Aim for roughly 8 ticks whatever the horizon.
  const totalMonths = Math.max(1, Math.round((t1 - t0) / (30.44 * 86_400_000)))
  const stepMonths = [1, 3, 6, 12, 24, 60, 120].find((s) => totalMonths / s <= 9) ?? 240
  const yearOnly = stepMonths >= 12

  const months: { label: string; at: string }[] = []
  const start = new Date(t0)
  for (let i = 0; i < 600; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    if (d.getTime() > t1) break
    if (d.getTime() < t0) continue
    const monthsFromStart = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (d.getUTCMonth() - start.getUTCMonth())
    if (monthsFromStart % stepMonths !== 0) continue
    const iso = d.toISOString().slice(0, 10)
    months.push({ label: yearOnly ? iso.slice(0, 4) : iso.slice(0, 7), at: iso })
  }

  return (
    <div className="scroll">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Window timeline">
        {months.map((m) => (
          <g key={m.at}>
            <line className="axis" x1={x(m.at)} y1={16} x2={x(m.at)} y2={height - 16} />
            <text x={x(m.at)} y={11} textAnchor="middle">
              {m.label}
            </text>
          </g>
        ))}

        <line
          x1={x(today)}
          y1={14}
          x2={x(today)}
          y2={height - 16}
          stroke="var(--status-critical)"
          strokeWidth={2}
        />
        <text x={x(today)} y={height - 4} textAnchor="middle" style={{ fill: 'var(--status-critical)' }}>
          today
        </text>

        {bars.map((b, i) => {
          const y = 22 + i * rowH
          const x0 = x(b.start)
          const w = Math.max(3, x(b.end) - x0)
          return (
            <g className="mark" key={b.key}>
              <title>{`${b.label}: ${b.start} → ${b.end}${b.note ? ` — ${b.note}` : ''}`}</title>
              <text x={labelW - 10} y={y + 15} textAnchor="end" className="lbl">
                {b.label}
              </text>
              <rect
                x={x0}
                y={y + 4}
                width={w}
                height={rowH - 12}
                rx={4}
                fill={b.estimated ? 'url(#estimated)' : b.color}
                stroke={b.estimated ? b.color : 'none'}
                strokeWidth={b.estimated ? 1.5 : 0}
              />
            </g>
          )
        })}

        <defs>
          <pattern id="estimated" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--surface-1)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--series-rest)" strokeWidth="3" />
          </pattern>
        </defs>
      </svg>
    </div>
  )
}

/** Single-series line with a filled area. One measure, one axis — never two. */
export function Sparkline({
  points,
  width = 640,
  height = 150,
  color = 'var(--series-1)',
  format = (n: number) => String(Math.round(n)),
  zeroLine = false,
}: {
  points: { label: string; value: number }[]
  width?: number
  height?: number
  color?: string
  format?: (n: number) => string
  zeroLine?: boolean
}) {
  if (points.length === 0) return null
  const padB = 22
  const padT = 14
  const plotH = height - padB - padT
  const values = points.map((p) => p.value)
  const min = Math.min(0, ...values)
  const max = Math.max(...values, 1)
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * (width - 16) + 8
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`

  const last = points[points.length - 1]!

  return (
    <div className="scroll">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend">
        {zeroLine && min < 0 && (
          <line className="axis" x1={0} y1={y(0)} x2={width} y2={y(0)} strokeDasharray="3 3" />
        )}
        <path d={area} fill={color} opacity={0.14} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g className="mark" key={p.label}>
            <title>{`${p.label}: ${format(p.value)}`}</title>
            <circle cx={x(i)} cy={y(p.value)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        ))}
        <text x={x(points.length - 1)} y={y(last.value) - 10} textAnchor="end" className="lbl">
          {format(last.value)}
        </text>
        <text x={8} y={height - 6}>
          {points[0]!.label}
        </text>
        <text x={width - 8} y={height - 6} textAnchor="end">
          {last.label}
        </text>
      </svg>
    </div>
  )
}
