import { NODES, MILESTONES, DEPENDENCIES } from '@/core/goals/seed'
import { closureRisk } from '@/core/goals/windows'
import { indexNodes } from '@/core/tree'
import { localDaysBetween } from '@/core/time/localDay'
import { Figure, TableView, Timeline, seriesColor } from '@/components/viz'
import type { GoalNode } from '@/core/types'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'

export default function TreePage() {
  const byId = indexNodes(NODES)
  const domains = NODES.filter((n) => n.level === 'life')
  const risks = closureRisk(NODES, TODAY)

  return (
    <>
      <h1>Goals</h1>
      <p className="sub">
        Ranked by closure risk, not by due date. A deadline slips; a window shuts.
      </p>

      <div className="note">
        <strong>Dates marked estimated are mine, not yours.</strong> LSAT administrations, the
        application cycle, and MAcc terms are my guesses — I had no authoritative source, so
        they are flagged low-confidence rather than dressed up as facts. Only dates marked{' '}
        <em>external fixed</em> bind the planner. Correct them in{' '}
        <code>src/core/goals/seed.ts</code>.
      </div>

      <h2>Closure risk</h2>
      <Figure
        title="What shuts, and when"
        caption="Hatched bars have estimated dates. The red rule is today. Ordering is by risk score — proximity of close, weighted up for irreversible nodes and for windows already mostly spent."
      >
        <Timeline
          from="2026-07-01"
          to="2028-03-01"
          today={TODAY}
          bars={risks.map((r, i) => ({
            key: r.node.id,
            label: r.node.title,
            start: r.node.windowOpen ?? TODAY,
            end: r.node.windowClose ?? TODAY,
            color: seriesColor(i),
            estimated: r.node.dateConfidence === 'low',
            note: r.reason,
          }))}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Opens</th>
                <th>Shuts</th>
                <th>Days left</th>
                <th>Reversible</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.node.id}>
                  <td>{r.node.title}</td>
                  <td className="muted">{r.node.windowOpen ?? '—'}</td>
                  <td>{r.node.windowClose}</td>
                  <td className={(r.daysUntilClose ?? 999) < 60 ? 'bad' : ''}>
                    {r.daysUntilClose}
                  </td>
                  <td className={r.node.reversible ? 'muted' : 'warn'}>
                    {r.node.reversible ? 'yes' : 'NO'}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {r.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <h2>The tree</h2>
      {domains.map((domain) => {
        const children = NODES.filter((n) => n.parentId === domain.id)
        return (
          <div className="panel" key={domain.id}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
            >
              <strong style={{ fontSize: 17 }}>{domain.title}</strong>
              <span className="tag">{domain.kind}</span>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              {domain.outcomeDefinition ??
                'A state to sustain — never completes. Needs self-ratings and behavioural proxies before it can be planned against.'}
            </div>

            {children.map((child) => (
              <NodeRow key={child.id} node={child} today={TODAY} />
            ))}
            {children.length === 0 && (
              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                Nothing decomposed under this yet.
              </div>
            )}
          </div>
        )
      })}

      <h2>Dependencies</h2>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Beyond about two years the dates are wrong by definition, but this graph stays
          stable — which is what makes replanning cheap.
        </p>
        <ul className="tight">
          {DEPENDENCIES.map((d) => (
            <li key={`${d.predecessorId}-${d.successorId}`}>
              <strong>{byId.get(d.predecessorId)?.title}</strong> →{' '}
              {byId.get(d.successorId)?.title}{' '}
              <span className="muted">({d.kind.replace(/_/g, ' ')})</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function NodeRow({ node, today }: { node: GoalNode; today: string }) {
  const milestones = MILESTONES.filter((m) => m.nodeId === node.id)
  const daysLeft = node.windowClose ? localDaysBetween(today, node.windowClose) : null

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong>{node.title}</strong>
        <span style={{ fontSize: 12.5 }} className="muted">
          {node.windowClose && (
            <span className={daysLeft !== null && daysLeft < 60 ? 'bad' : ''}>
              shuts {node.windowClose} · {daysLeft}d
            </span>
          )}
          {!node.reversible && <span className="warn"> · irreversible</span>}
        </span>
      </div>
      {node.outcomeDefinition && (
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {node.outcomeDefinition}
        </div>
      )}
      {node.targetDate && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          <span className="tag">
            target {node.targetDate} · {node.dateBasis?.replace(/_/g, ' ')} ·{' '}
            {node.dateConfidence}
          </span>
        </div>
      )}
      {milestones.length > 0 && (
        <ul className="tight" style={{ fontSize: 13, marginTop: 6 }}>
          {milestones.map((m) => (
            <li key={m.id}>
              <span className={m.achievedAt ? 'good' : ''}>{m.achievedAt ? '✓ ' : '○ '}</span>
              {m.title}
              {m.targetDate && <span className="muted"> — {m.targetDate}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
