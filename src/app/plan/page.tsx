import {
  LSAT_DATES,
  MACC_TERMS,
  FALL_2026_CENSUS,
  applicationCycleBands,
  administrationsUsableBy,
  buildStudyPlan,
} from '@/core/goals/education'
import { TIMELINE } from '@/core/money/rates'
import { localDaysBetween } from '@/core/time/localDay'
import { Figure, TableView, Timeline, seriesColor } from '@/components/viz'

export const dynamic = 'force-dynamic'

const TODAY = '2026-08-05'
/** Hours a week you can realistically hold down while deployed. A guess — correct it. */
const STUDY_HOURS = 10

export default function PlanPage() {
  const janTarget = '2027-01-15'
  const usableForJan = administrationsUsableBy(janTarget)
  const oct = LSAT_DATES.find((a) => a.key === 'oct_2026')!
  const nov = LSAT_DATES.find((a) => a.key === 'nov_2026')!

  const octPlan = buildStudyPlan(oct, TODAY, STUDY_HOURS)
  const novPlan = buildStudyPlan(nov, TODAY, STUDY_HOURS)

  const bands27 = applicationCycleBands(2027)

  return (
    <>
      <h1>Law school &amp; MAcc</h1>
      <p className="sub">
        Researched {TODAY}. Every date below carries a source flag — confirmed, derived, or
        unknown. Nothing plausible-looking has been invented to fill a gap.
      </p>

      <div className="note">
        <strong>Two findings that change the plan.</strong>
        <ul className="tight" style={{ marginTop: 6 }}>
          <li>
            From August 2026 the LSAT is <strong>in person at Prometric centres</strong> — but
            there is an explicit exception for test takers stationed abroad on active duty.
            That exception is the only reason a deployed sitting is possible. It is an
            approval process, not a checkbox; start it before you ship.
          </li>
          <li>
            <strong>Post-9/11 pays no housing allowance while you are on active duty</strong>,
            because you are already drawing BAH. Months of Chapter 33 entitlement spent
            during the deployment are burned at tuition-only value — and you have 36 months
            of it against a 36-month law degree.
          </li>
        </ul>
      </div>

      <h2>The decision that has a deadline in 22 days</h2>
      <div className="panel">
        <div style={{ fontSize: 20, fontWeight: 650 }}>
          October LSAT registration closes {oct.registrationDeadline}
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          {localDaysBetween(TODAY, oct.registrationDeadline!)} days from today, and{' '}
          {localDaysBetween(oct.registrationDeadline!, TIMELINE.deploymentStart)} days before you
          ship out. Test 7–10 Oct, score {oct.scoreRelease}.
        </div>
        <p style={{ marginBottom: 0 }}>
          This is the only administration whose score lands early enough to make a{' '}
          <em>strong</em> January application, and its deadline falls while you are still
          stateside. Registering is reversible; missing the deadline is not.
        </p>
      </div>

      <h2>LSAT administrations</h2>
      <Figure
        title="What is still reachable"
        caption="Ordered by test date. Score release is roughly three weeks out; where LSAC has not published one I assume test date + 21 days rather than assuming it is fine."
      >
        <Timeline
          from="2026-08-01"
          to="2027-07-01"
          today={TODAY}
          bars={LSAT_DATES.map((a, i) => ({
            key: a.key,
            label: a.label,
            start: a.registrationDeadline ?? a.testDate,
            end: a.scoreRelease ?? a.testDate,
            color: seriesColor(i),
            estimated: a.source !== 'confirmed',
            note: a.note,
          }))}
        />
        <TableView>
          <table>
            <thead>
              <tr>
                <th>Administration</th>
                <th>Test</th>
                <th>Register by</th>
                <th>Score</th>
                <th>Source</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {LSAT_DATES.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  <td>{a.testDate}</td>
                  <td className={a.registrationDeadline ? '' : 'warn'}>
                    {a.registrationDeadline ?? 'unconfirmed'}
                  </td>
                  <td>{a.scoreRelease ?? 'unconfirmed'}</td>
                  <td className={a.source === 'confirmed' ? 'good' : 'warn'}>{a.source}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {a.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </Figure>

      <p className="muted">
        Usable for a {janTarget} submission: {usableForJan.map((a) => a.label).join(', ')}. The
        January sitting is <strong>not</strong> among them — its score releases{' '}
        {LSAT_DATES.find((a) => a.key === 'jan_2027')!.scoreRelease}, after the application
        would need to be in.
      </p>

      <h2>Study plan — October sitting</h2>
      <StudyPlanPanel plan={octPlan} />

      <h2>Study plan — November sitting</h2>
      <StudyPlanPanel plan={novPlan} />

      <h2>Application cycle — the cost ramp</h2>
      <Figure
        title="Rolling admissions for a Fall 2028 start"
        caption="A deadline can be met at the last minute at no cost. This cannot: schools award seats and scholarship money as applications arrive, so the same file is worth less in January than in October."
      >
        <Timeline
          from="2027-08-01"
          to="2028-04-01"
          today={TODAY}
          bars={bands27.map((b, i) => ({
            key: b.label,
            label: `${b.label} (${Math.round(b.strength * 100)}%)`,
            start: b.from,
            end: b.to,
            color: seriesColor(i),
            note: b.note,
          }))}
        />
      </Figure>

      <h2>MAcc</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>
          Seven-week blocks, several starts a year — which is what makes it survivable
          alongside a deployment. A bad month costs one block, not a semester.
        </p>
        <p>
          <strong>It produces no cash.</strong> One more class out of pocket, then Hazlewood
          covers tuition. Post-9/11 would pay no housing allowance while you are on active
          duty, so there is nothing to collect. That makes the MAcc a pure cost in money and
          capacity for the whole deployment — worth doing, but not a source of funds, and the
          money view should never be built expecting one.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Start</th>
                <th>End</th>
                <th>Source</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {MACC_TERMS.map((t) => (
                <tr key={t.key}>
                  <td>{t.label}</td>
                  <td>{t.start}</td>
                  <td>{t.end}</td>
                  <td className={t.source === 'derived' ? 'warn' : 'bad'}>{t.source}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {t.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Fall 2026 census date is <strong>{FALL_2026_CENSUS}</strong> (confirmed) — five days
          after you ship out. Dropping after it still bills you.
        </p>
      </div>

      <div className="note">
        <strong>What I could not confirm.</strong> LSAC and TAMU-CC both returned 403 to this
        environment, so the November and June LSAT dates, and every Spring 2027 MAcc date, are
        derived or unknown. They are flagged in the tables above and in{' '}
        <code>src/core/goals/education.ts</code> rather than quietly filled in. The
        Hazlewood-versus-Chapter-33 sequencing also needs confirming with the TAMU-CC VA
        certifying official — the general rule is that Chapter 33 must be exhausted first,
        which would defeat the plan of saving it for law school.
      </div>
    </>
  )
}

function StudyPlanPanel({ plan }: { plan: ReturnType<typeof buildStudyPlan> }) {
  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <strong>{plan.administration.label}</strong>
        <span className="muted">
          {plan.weeksAvailable} weeks · ~{plan.totalHours}h at {STUDY_HOURS}h/wk
        </span>
      </div>

      {plan.warnings.length > 0 && (
        <ul className="tight" style={{ marginTop: 8 }}>
          {plan.warnings.map((w) => (
            <li key={w} className="warn">
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Phase</th>
              <th>From</th>
              <th>To</th>
              <th>What it must produce</th>
            </tr>
          </thead>
          <tbody>
            {plan.phases.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td>{p.start}</td>
                <td>{p.end}</td>
                <td style={{ whiteSpace: 'normal' }}>{p.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Phases are defined by output, not by hours logged — the hours are the estimated cost
        of producing the output, and get corrected once there is real data.
      </p>
    </div>
  )
}
