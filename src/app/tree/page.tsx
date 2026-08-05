import { loadPlan, sourceLabel } from '@/db/load'
import { closureRisk } from '@/core/goals/windows'
import { indexNodes, LEVEL_ORDER, domainOf } from '@/core/tree'
import { localDaysBetween } from '@/core/time/localDay'
import { Figure, TableView, Timeline, seriesColor } from '@/components/viz'
import type { GoalNode, Item, NodeLevel } from '@/core/types'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'

/** Horizon span each level is rendered against, so the ladder reads as a zoom. */
const LEVEL_SPAN: Record<NodeLevel, { from: string; to: string; label: string }> = {
  life: { from: '2026-01-01', to: '2062-01-01', label: 'Life — to expected lifespan' },
  decade: { from: '2026-01-01', to: '2042-01-01', label: 'Era — phase intent' },
  campaign: { from: '2026-07-01', to: '2033-01-01', label: 'Campaign — milestones' },
  year: { from: '2026-07-01', to: '2027-07-01', label: 'Year — required velocity' },
  quarter: { from: '2026-07-01', to: '2027-01-01', label: 'Quarter — milestone targets' },
}

export default async function TreePage() {
  const plan = await loadPlan()
  const badge = sourceLabel(plan)
  const byId = indexNodes(plan.nodes)
  const risks = closureRisk(plan.nodes, TODAY)

  const openItems = plan.items.filter((i) => i.status !== 'done' && i.status !== 'dropped')

  /** Items bucketed by the domain they roll up to. */
  const buckets = new Map<string, Item[]>()
  const unassigned: Item[] = []
  for (const item of openItems) {
    const domain = item.nodeId ? domainOf(byId, item.nodeId) : null
    if (!domain) {
      unassigned.push(item)
      continue
    }
    const list = buckets.get(domain.id) ?? []
    list.push(item)
    buckets.set(domain.id, list)
  }

  return (
    <>
      <h1>Goals</h1>
      <p className="sub">
        Life → era → campaign → year → quarter. Resolution decays with distance — there are
        no quarter nodes at ten years out, because that would be fiction with a schema.{' '}
        <span className={badge.tone}>{badge.text}</span>
      </p>

      <h2>The horizon ladder</h2>
      {LEVEL_ORDER.map((level) => {
        const atLevel = plan.nodes.filter((n) => n.level === level)
        if (atLevel.length === 0) return null
        const span = LEVEL_SPAN[level]
        return (
          <Figure
            key={level}
            title={span.label}
            caption={`${atLevel.length} node(s). Bars without a window are drawn from today to the level's horizon — they have intent but no closing date, which is correct at this resolution.`}
          >
            <Timeline
              from={span.from}
              to={span.to}
              today={TODAY}
              bars={atLevel.map((n, i) => ({
                key: n.id,
                label: n.title,
                start: n.windowOpen ?? n.targetDate ?? TODAY,
                end: n.windowClose ?? n.targetDate ?? span.to,
                color: seriesColor(i),
                estimated: n.dateConfidence === 'low' || (!n.windowClose && !n.targetDate),
                note: n.outcomeDefinition ?? 'State — never completes.',
              }))}
            />
          </Figure>
        )
      })}

      <h2>Closure risk</h2>
      <p className="sub">
        Ranked by how soon a window shuts, weighted up for irreversible nodes and for
        windows already mostly spent. This ordering looks nothing like a to-do list.
      </p>
      <div className="panel scroll">
        <table>
          <thead>
            <tr>
              <th>Node</th>
              <th>Level</th>
              <th>Shuts</th>
              <th>Days</th>
              <th>Reversible</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.node.id}>
                <td>{r.node.title}</td>
                <td className="muted">{r.node.level}</td>
                <td>{r.node.windowClose}</td>
                <td className={(r.daysUntilClose ?? 999) < 60 ? 'bad' : ''}>{r.daysUntilClose}</td>
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
      </div>

      <h2>Task buckets</h2>
      <p className="sub">
        Every open item, bucketed by the domain it rolls up to. A domain with no items is
        a goal nobody is working on — which is information, not an empty state.
      </p>
      <div className="cards">
        {plan.nodes
          .filter((n) => n.level === 'life')
          .map((domain) => {
            const items = buckets.get(domain.id) ?? []
            const minutes = items.reduce((s, i) => s + i.effortMinutes, 0)
            return (
              <div className="panel card" key={domain.id}>
                <div className="k">{domain.title}</div>
                <div className={`v ${items.length === 0 ? 'muted' : ''}`}>{items.length}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {items.length === 0
                    ? 'nothing queued'
                    : `${Math.round(minutes / 6) / 10}h of work`}
                </div>
              </div>
            )
          })}
      </div>

      {[...buckets.entries()].map(([domainId, items]) => (
        <div className="panel" key={domainId}>
          <strong>{byId.get(domainId)?.title ?? domainId}</strong>
          <div className="scroll">
            <table>
              <tbody>
                {items
                  .slice()
                  .sort((a, b) => (b.priorityHint ?? 0) - (a.priorityHint ?? 0))
                  .map((i) => (
                    <tr key={i.id}>
                      <td>{i.autopilotCritical ? '📌' : ''}</td>
                      <td style={{ whiteSpace: 'normal' }}>{i.title}</td>
                      <td className="muted">{i.effortMinutes}m</td>
                      <td className="muted">
                        {i.dueAt ? i.dueAt.toISOString().slice(0, 10) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="note">
          <strong>{unassigned.length} item(s) belong to no domain.</strong> They consume time
          that no capacity ceiling checks, which is the failure this system exists to catch.
          Attach them to a node.
        </div>
      )}

      <h2>The tree</h2>
      {plan.nodes
        .filter((n) => n.level === 'life')
        .map((domain) => (
          <Subtree key={domain.id} node={domain} nodes={plan.nodes} depth={0} />
        ))}

      <h2>Dependencies</h2>
      <div className="panel">
        <ul className="tight">
          {plan.dependencies.map((d) => (
            <li key={`${d.predecessorId}-${d.successorId}`}>
              <strong>{byId.get(d.predecessorId)?.title ?? d.predecessorId}</strong> →{' '}
              {byId.get(d.successorId)?.title ?? d.successorId}{' '}
              <span className="muted">({d.kind.replace(/_/g, ' ')})</span>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Beyond about two years the dates are wrong by definition, but this graph stays
          stable — which is what makes replanning cheap.
        </p>
      </div>
    </>
  )
}

function Subtree({ node, nodes, depth }: { node: GoalNode; nodes: GoalNode[]; depth: number }) {
  const children = nodes.filter((n) => n.parentId === node.id)
  const daysLeft = node.windowClose ? localDaysBetween(TODAY, node.windowClose) : null

  return (
    <div
      className={depth === 0 ? 'panel' : ''}
      style={depth === 0 ? undefined : { borderLeft: '2px solid var(--line)', paddingLeft: 12, marginLeft: 4 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: depth === 0 ? 650 : 500 }}>
          {node.title} <span className="tag">{node.level}</span>
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {daysLeft !== null && (
            <span className={daysLeft < 60 ? 'bad' : ''}>shuts {node.windowClose} · {daysLeft}d</span>
          )}
          {!node.reversible && <span className="warn"> · irreversible</span>}
        </span>
      </div>
      {node.outcomeDefinition && (
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {node.outcomeDefinition}
        </div>
      )}
      {children.map((c) => (
        <Subtree key={c.id} node={c} nodes={nodes} depth={depth + 1} />
      ))}
    </div>
  )
}
