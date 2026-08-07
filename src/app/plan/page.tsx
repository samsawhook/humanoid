import {
  LSAT_DATES,
  LSAT_HOURS_FLOOR,
  STUDY_CAPACITY,
  assessSitting,
  hoursBetween,
  MACC_TERMS,
  FALL_2026_CENSUS,
  applicationCycleBands,
  administrationsUsableBy,
  buildStudyPlan,
} from '@/core/goals/education'
import { TIMELINE } from '@/core/money/rates'
import { localDaysBetween } from '@/core/time/localDay'
import { Figure, TableView, Timeline, seriesColor } from '@/components/viz'
import {
  M4_RANGE_DAY,
  RFI_ECS_DAY,
  dayCapacity,
  dutyWindow,
  representativeWeek,
} from '@/core/schedule/dutyDay'
import { logFor, usableCapacity, watchedFlags } from '@/core/schedule/dayLog'

export const dynamic = 'force-dynamic'

const ZONE = 'America/Chicago'
const fmtMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const TODAY = '2026-08-05'
/** Hours a week you can realistically hold down while deployed. A guess — correct it. */
const STUDY_HOURS = 10

export default function PlanPage() {
  const dutyWin = dutyWindow(M4_RANGE_DAY)
  const rfiWin = dutyWindow(RFI_ECS_DAY)
  const week = representativeWeek(ZONE, '2026-08-03')
  const loggedDate = RFI_ECS_DAY.date
  const logged = logFor(loggedDate)
  const loggedCap = dayCapacity(ZONE, loggedDate)
  const usable = usableCapacity(loggedDate, loggedCap.survivingMinutes)
  const flags = watchedFlags()
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

      <h2>The blitz — what pre-mob capacity actually buys</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>
          Pre-mob is the last high-capacity block before a long stretch of low and
          unpredictable ones, which makes it a closing capacity window in its own right.
          Blitzing now is the right instinct. What it buys, at the assumed rates:
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Sitting</th>
                <th>Hours by then</th>
                <th>of which pre-mob</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {LSAT_DATES.map((a) => {
                const r = assessSitting(a, TODAY)
                return (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td>{r.hoursAvailable}h</td>
                    <td className="muted">{r.premobHours}h</td>
                    <td
                      className={
                        r.verdict === 'real attempt'
                          ? 'good'
                          : r.verdict === 'not viable'
                            ? 'bad'
                            : 'warn'
                      }
                    >
                      {r.verdict}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ marginBottom: 0 }}>
          Typical prep is {LSAT_HOURS_FLOOR}–250 hours. The blitz yields{' '}
          <strong>{hoursBetween(TODAY, '2026-09-03')}h</strong> before you ship — real, but
          it lands October at {assessSitting(LSAT_DATES[0]!, TODAY).hoursAvailable}h, under the
          floor. <strong>November is the first sitting that clears it.</strong>
        </p>
      </div>

      <h2>What actually happened — {loggedDate}</h2>
      {logged && usable && (
        <div className="note">
          <strong>
            {RFI_ECS_DAY.label}. Up at {logged.wake}, released about{' '}
            {RFI_ECS_DAY.endsAt} — {rfiWin.hours} hours.
          </strong>{' '}
          A fielding day <em>finishes</em>, which a range day does not. That is the first
          evidence that &ldquo;a pre-mob weekday&rdquo; is not one thing, and it means the
          earlier figure generalised from the hardest day rather than an average one.

          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>Study time the schedule left free</td>
                <td style={{ textAlign: 'right' }}>{usable.availableMinutes} min</td>
              </tr>
              <tr>
                <td>What those minutes were reserved for</td>
                <td style={{ textAlign: 'right' }}>high-demand LSAT</td>
              </tr>
              <tr>
                <td>What the day could actually support</td>
                <td style={{ textAlign: 'right' }} className="bad">
                  {usable.ceiling}-demand
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Usable study time</strong>
                </td>
                <td style={{ textAlign: 'right' }} className="bad">
                  <strong>{usable.supportsHighDemand ? usable.availableMinutes : 0} min</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 10 }}>
            <strong>Time available and time usable are different quantities.</strong> The
            schedule left 75 minutes. You reported cognition as{' '}
            <em>{logged.cognitive}</em>, low motivation for LSAT or admin — after an{' '}
            {logged.wake} start. No amount of better arithmetic on those 75 minutes finds
            that; it is the reason a plan built on clock hours keeps over-promising.
            Blocks are now graded by how much thinking they cost, so a tired day gets
            offered admin or review instead of an LSAT section it was never going to do.
          </p>

          <p style={{ marginTop: 10 }}>
            <strong>And the time was not wasted.</strong> It went to{' '}
            {logged.displacedBy.map((d) => d.label.replace(/ \(.*/, '')).join(', ')} — sleep
            after an 0400 start, training, a run.{' '}
            {usable.displacementWasChosen
              ? 'Every one of those was worth doing, so this is not a discipline problem and nothing here treats it as one.'
              : 'Some of that was not chosen.'}{' '}
            BJJ at 20:00 sits exactly on the 19:30–20:45 study block, and BJJ is not the
            thing to move: it is one of very few life-feel items surviving a 13-hour duty
            day. The block should move instead.
          </p>

          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            One day is not a rate. This is recorded to estimate what throughput is
            realistic and for nothing else — there is deliberately no completion
            percentage anywhere in this system, and there will not be one.
          </p>
        </div>
      )}

      {flags.length > 0 && (
        <div className="note">
          <strong>Flagged from the log</strong>
          <ul className="tight" style={{ marginTop: 8 }}>
            {flags.map((f) => (
              <li key={f.flag.key} className={f.flag.urgent ? 'bad' : 'muted'}>
                <strong>{f.flag.label}</strong>
                {f.flag.urgent && ' — ACT THIS WEEK'}
                <div style={{ fontSize: 12.5 }}>{f.flag.action}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>The typical day, from a real schedule</h2>
      <div className="note">
        <strong>
          {M4_RANGE_DAY.label}, {M4_RANGE_DAY.date} — {dutyWin.hours} hours, {' '}
          {fmtMin(dutyWin.startMinute)} to {M4_RANGE_DAY.endsAt}
          {M4_RANGE_DAY.endConfidence === 'unknown' ? '*' : ''}
        </strong>
        <table style={{ marginTop: 8 }}>
          <tbody>
            {M4_RANGE_DAY.events.map((e) => (
              <tr key={e.at + e.label}>
                <td style={{ width: 70 }}>{e.at}</td>
                <td style={{ whiteSpace: 'normal' }} className={e.yours ? 'good' : ''}>
                  {e.label}
                  {e.note && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {e.note}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="muted">{fmtMin(dutyWin.startMinute)}</td>
              <td className="muted" style={{ whiteSpace: 'normal' }}>
                Working backwards: {M4_RANGE_DAY.prepMinutes} minutes of PPE, kit and
                movement before a {M4_RANGE_DAY.events[0]!.at} formation. Not on any
                schedule, but it is the difference between up at 0440 and up at 0345.
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8 }} className="muted">
          * The schedule stops at &ldquo;SP to range&rdquo; and never says when the day
          ends. {M4_RANGE_DAY.endsAt} is a placeholder. You also draw a truck at 0645,
          which means turning one in after the last shooter is released — so your day is
          longer than the published one at both ends.
        </p>
      </div>

      <div className="note">
        <strong>
          This deletes the morning study block. It does not shorten it — it deletes it.
        </strong>{' '}
        The template opens with 05:30–07:00 of LSAT work, justified as the hardest
        thinking done before the day can take it. On a duty day the day has already taken
        it, and that block was half the weekday plan.
        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td>Planned in the template</td>
              <td style={{ textAlign: 'right' }}>{week.plannedHours} h/wk</td>
            </tr>
            <tr>
              <td>
                <strong>Actually survives</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{week.actualHours} h/wk</strong>
              </td>
            </tr>
            <tr>
              <td className="bad" style={{ whiteSpace: 'normal' }}>
                Lost on every duty day: {week.alwaysLost.join(', ')}
              </td>
              <td className="bad" style={{ textAlign: 'right' }}>
                −{Math.round((week.plannedHours - week.actualHours) * 10) / 10} h/wk
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8 }}>
          Pre-mob capacity was <strong>25 h/wk</strong> — a guess, and one this file
          flagged as the most load-bearing assumption in the whole plan. The first real
          schedule cuts it to <strong>{week.actualHours} h/wk</strong>. That is derived
          rather than guessed, but it generalises one range day to every weekday, which
          is a stretch — toward the <em>floor</em>, since a range day is a hard day.
          Raise it with evidence, not with optimism.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>
            The weekends now carry more than a third of your study time across two days
            out of seven.
          </strong>{' '}
          That is the fragile part: one lost weekend costs more than a lost week of
          evenings.
        </p>
      </div>

      <h2>Assumed study capacity</h2>
      <div className="panel">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Phase</th>
                <th>From</th>
                <th>To</th>
                <th>h/wk</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {STUDY_CAPACITY.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  <td>{c.start}</td>
                  <td>{c.end}</td>
                  <td className="warn">{c.hoursPerWeek}</td>
                  <td className="muted" style={{ whiteSpace: 'normal' }}>
                    {c.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
          Every one of these is a guess and they drive the verdicts above. The 25h/wk pre-mob
          figure is the most load-bearing — if pre-mob is really 10h/wk, November drops under
          the floor too and February becomes the first real sitting.
        </p>
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
          <strong>It produces no cash.</strong> One more class out of pocket, then it is free.
          Post-9/11 pays no housing allowance while you are on active duty, so there is
          nothing to collect. That makes the MAcc a pure cost in money and capacity for the
          whole deployment — worth doing, but never a source of funds, and the money view
          must not be built expecting one.
        </p>
        <p>
          <strong>Deferring until cash exists points at March 2027.</strong> On the current
          allocation there is no free money on any payday until{' '}
          <strong>15 February 2027</strong>, when the mortgage arrears finish and the 15th-of-
          month paydays start leaving about <strong>$956</strong> clear. The first MAcc start
          after that is the Spring 2027 second 7-week block — whose date I could not confirm.
          Skipping both Fall 2026 blocks is the cost of that choice, and it is a real one:
          it pushes the degree back roughly a semester.
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
