# Life Dash — Build Spec

Keep this file at the repo root. It is the source of truth for design intent. Update it when decisions change; do not let decisions live only in chat history.

---

You are helping me build **Life Dash**, a single-user life-planning and scheduling system. I am the only user. Optimize for something I will still trust in three years, not for shipping features fast.

## What this is

A planner that reasons across a **full-life horizon** — from expected lifespan down to today — and decomposes long-range intent into progressively finer stages until it produces a coherent yearly, weekly, and daily plan.

**This system is my planner.** It is the system of record for how my time is allocated. It does not sync to or defer to an external calendar as the authority.

## What it optimizes for

Two terminal objectives that feed each other, and neither is subordinate:

1. **Contribution / achievement** — progress against goals with observable milestones.
2. **Life feel** — the emotional, spiritual, and relational quality of the years.

**Explicit non-objective: task completion rate.** Do not optimize it, rank by it, or display it as a headline metric. It is trivially gamed by scheduling easy work and it is not what I care about. Completion data is retained for exactly one purpose: estimating my *realistic throughput* so plans are built on demonstrated capacity rather than optimism.

The reward-hacking risk here is short-horizon: optimizing this week's mood says "do less," while optimizing decades says "do meaningful, appropriately hard work that visibly advances, and protect sleep and relationships." **The long horizon is the defense against the hack.** Never let a planning pass optimize a window shorter than a quarter without checking it against the annual and multi-year levels.

## Fixed technical decisions — do not relitigate

- TypeScript, Next.js App Router, Vercel (Pro). Postgres (Neon or Vercel Postgres). Drizzle ORM. Single user, one long-lived secret, no auth provider.
- **Vercel Cron on Pro:** per-minute cadence available, but UTC-only and cadence changes require redeploy. **All timezone logic lives in application code.** My timezone will change during this project's life. Nothing hardcodes it.
- **Capture channel:** Telegram Bot API via webhook. Put it behind a `Channel` interface (`send`, `receive → NormalizedInbound`) so SMS and email adapters drop in later without touching business logic.
- **Calendar surface:** the app publishes a read-only **ICS feed** that my phone subscribes to. This gives me the plan on any device without granting write access to anything or making an external calendar authoritative. External fixed commitments (Army obligations, drill, appointments) are *imported or entered* as immovable blocks; they constrain the plan, they don't own it.
- Cron and webhook routes require a bearer secret and return 401 otherwise.

## The planning architecture

**The LLM plans. The deterministic layer does arithmetic and feasibility. Never the reverse.**

- **LLM (judgment):** proposes allocations across the horizon using messy context — what's teed up, how the last period actually went, mood trend, what's coming. Decomposes goals into candidate stages. Narrates the plan and the tradeoffs. Proposes changes to planning parameters at retro time.
- **Deterministic validator (pure functions, no network):** checks every proposal. Does it fit real available hours? Does every dated commitment still receive its required velocity? Any hard conflict, dependency violation, or window breach? Returns **named violations**, not a boolean.
- **Loop:** propose → validate → return violations → revise. Two or three rounds, then converge or escalate to me.
- Models silently double-book and lose totals across many items. **The model never computes hours, velocity, or feasibility.** It reads the numbers the validator produces.
- **Daily re-slotting is fully deterministic.** "Army ran three hours long" reshuffles the queue with no model call.

## Horizon ladder — resolution decays with distance

Each level constrains the level below and stores a different object type. Do not store daily granularity at ten years out; that is fiction with a schema.

| Level | Stores | Replan cadence |
|---|---|---|
| Life (to expected lifespan) | Terminal objectives, windows | Annually |
| Decade / era | Commitments, phase intent | Annually |
| Multi-year campaign | Milestones + dependency graph | Quarterly |
| Year | Required velocity per goal | Quarterly |
| Quarter | Milestone targets | Monthly |
| Week | Activities and blocks | Weekly |
| Day | Ordered queue + pinned blocks | Daily |

**Store dependency structure, not dates, beyond ~2 years.** Long-range dates are wrong by definition; the graph of what-must-precede-what is stable and makes replanning cheap.

**Propagation threshold:** a slip escalates one level only when sustained — velocity below required for three consecutive periods of that level. Without this, noise at the daily level rewrites the life plan and the system becomes untrustworthy.

## Windows, not just deadlines

The defining constraint at life scale is not "due by X" — it is opportunities that open and close. Examples: prerequisite sequences that gate later roles, benefit eligibility periods, the years my body can do physically demanding work, aging parents' healthy years, compounding where early contributions do most of the lifting.

A deadline can be missed and rescheduled. **A window can only be missed.** Model `window_open` / `window_close` as first-class, and rank by **closure risk**, not by due date. This ranking will look nothing like a normal to-do list; that is the point.

## Two-pass planning, and the output is a verdict

- **Backward pass:** from each terminal date, compute required velocity per goal.
- **Forward pass:** from demonstrated capacity, compute available hours.
- These will not meet. Nobody's plan fits.

The most valuable artifact is not the schedule — it is **the explicit, ranked statement of what I am giving up to hold this plan**, refreshed as capacity data accumulates. Surface it prominently. Never silently drop a goal to make a plan feasible.

## Data model — starting point, propose refinements

**`nodes`** — the goal tree, self-referencing, spanning all horizon levels.
- `id`, `parent_id`, `title`, `level` (life | decade | campaign | year | quarter)
- `kind` — **achievement** (has milestones and completion evidence) or **state** (an ongoing quality of life to sustain; never "completes")
- `target_date`, `window_open`, `window_close`, `date_confidence`
- `required_velocity` (computed), `dependency_ids`
- `reversible` — boolean; irreversible decisions deserve disproportionate planning effort

**State nodes carry evidence two ways, and need both:**
- **Periodic self-ratings** on dimensions I define (not a generic 1–10 mood score).
- **Observable behavioral proxies** — measurable things that indicate the state is real: hours with specific people, time outdoors, creative output shipped, sleep. These are what keep feel-goals from being silently deprioritized against goals that have hard numbers.

**`items`** — executable work. `node_id`, `title`, `effort_minutes`, `due_at`, `date_flexibility` (fixed | elastic), `status`, `recurrence_rule`, `autopilot_critical`.

**`commitments`** — externally imposed immovable time (Army obligations, appointments). Consumes capacity before anything else is allocated.

**`capacity_budgets`** — hours per week actually available by domain. Hard ceilings. This table is why the system can say no.

**`captures`** — every inbound message stored **raw and verbatim**, with parsed interpretation in a separate nullable column. Never discard the original; I want to re-parse history when the schema changes.

**`outcomes`** — per scheduled block: completed / partial / skipped, plus **skip reason** (external time overrun | no time | didn't want to | did something else). Skip reasons are the highest-value signal in the system — "Army ran long" and "didn't feel like it" imply opposite corrections.

**`plans`** — every generated plan, with the model's stated rationale and the validator's output, retained for later review.

**`decisions`** — decision log: the call, the reasoning, the expected outcome, the review date. I write these; never auto-populated.

## Phase 1 — thin slice of both halves

Build a narrow vertical slice end to end, not a complete version of either half.

1. Schema and migrations for the full model above.
2. **Goal tree:** create nodes at any level, both kinds, with dependencies and windows. Backward pass computing required velocity. Forward pass against capacity. Output the feasibility verdict and the ranked tradeoff list.
3. **Capture:** Telegram webhook, raw storage, LLM parse handling both terse replies ("1 2 4 done, slept bad") and freeform. Skip-reason prompts on incomplete items.
4. **Digest:** morning message with pinned blocks plus a priority-ordered queue — not a rigid timetable. My free time is exogenous and its size is unknown until the day happens.
5. Evening check-in with tap-to-complete inline buttons and self-rating prompts (max three questions, rotating).
6. Cron routes driving 4 and 5, secret-authenticated.
7. ICS feed endpoint.
8. Minimal web view: the tree, this week, the backlog. Function over polish.

## Out of scope for Phase 1 — do not build, stub, or scaffold

- Any financial integration. Monarch has no official API and the data source is undecided.
- Health device or lab integrations.
- Voice note transcription — Phase 2. Keep inbound normalization ready for a non-text payload.
- Any multi-user concept, roles, or permissions.

## Non-negotiables

- Validator has unit tests covering: over-capacity periods, conflicting fixed commitments, a closing window, a node with no parent, an unreachable required velocity, and empty state.
- No secrets in the repo. Environment variables only, documented in `.env.example`.
- All deletes are soft.
- Prefer boring, legible code over clever abstraction. I will read this a year from now, tired, on a bad connection.

## Before you write any code

1. Ask me the 5–8 questions whose answers would most change your implementation. Do not ask what this document already answers.
2. Propose the schema and file tree. Stop.
3. Wait for approval before generating implementation code.

Do not generate the whole application in one pass.

---
---

# Decision log

Decisions resolved in conversation, recorded here so they do not live only in chat.
Append new rounds; do not rewrite history.

## Round 1 — 2026-08-05

### D1. Capacity numbers start as estimates and are replaced by measurement

Declared capacity is a starting guess. As `outcomes` accumulate, demonstrated
throughput supersedes it. The validator always reports **which source it used**
so a verdict is never silently built on a guess.

- Fewer than `MIN_PERIODS_FOR_THROUGHPUT` (start: 4) periods of outcome data for
  a domain → validator uses the declared budget and stamps the verdict
  `capacity_source: 'declared'`.
- At or above that → uses demonstrated throughput, stamps `'demonstrated'`.
- The same rule applies to per-item effort estimates: `items.effort_minutes` is
  a guess, `outcomes.actual_minutes` is truth, and a per-node calibration factor
  (median actual ÷ estimated) is computed from history and applied to future
  estimates. Computed in code, not stored in a table.

### D2. Goals are defined by output, never by time spent — **load-bearing**

> "We're not optimizing for capturing and using time, but for the intended goals /
> outputs. Goals should almost never be something like spend X amount of time doing Y."

This governs the whole model. Hours are a **cost**, not a **goal**. They appear
in exactly one place: the feasibility check. They never define what a node is,
and no node's success is ever measured in hours.

Concretely:

- A node's target is an **output**: an LSAT score, an application submitted, a
  course completed, a dollar figure, a rating floor sustained.
- `required_velocity` is therefore a rate of *output*, not of hours:
  `required_velocity_amount` + `required_velocity_unit` + `required_velocity_period`,
  with a free-text `required_velocity_label` for legibility
  (e.g. `3 / month — application components submitted`).
- The **backward pass** produces required output rate per node.
- Converting output rate → hours is a **separate, clearly-labelled estimation
  step** performed by the validator using item effort estimates. That converted
  number is the only hours figure in the system, it is explicitly an estimate,
  and it is used solely to answer "does this fit."
- The **forward pass** produces available hours. Backward and forward meet only
  at the feasibility check, never at goal definition.

Anti-pattern this rules out, permanently: `"Study 10 hrs/wk for LSAT"` as a goal.
The goal is `"LSAT ≥ 172 by the September administration"`. Ten hours a week is a
prediction about cost, and predictions get corrected by D1.

### D3. Full decomposition chain, and the schedule is a real output

> "You should be backwards planning and turning goals into stages into actions
> into queues into schedules."

The chain is explicit and each link is a table:

| Chain link | Table | Notes |
|---|---|---|
| goals | `nodes` | life → decade → campaign → year → quarter |
| stages | `milestones` | dated or window-bound output checkpoints on a node |
| actions | `items` | executable work, effort-estimated |
| queue | `day_plans` | ordered item list for a local date |
| schedule | `scheduled_blocks` | items given start/end times |

This supersedes the earlier reading that the day is *only* an unordered priority
queue. The system **does** produce a schedule. It is reconciled with "free time is
exogenous" by firmness, not by refusing to schedule:

- `firm` — commitments and pinned blocks. Real times. Do not move.
- `soft` — scheduled elastic work. Real times, but every deterministic re-slot
  may rewrite them, and the morning digest presents them as an *order* with
  suggested times, not as a timetable to obey.

**ICS feed:** firm blocks export as normal events. Soft blocks export as events
prefixed `~` so the phone shows the intended shape of the day without implying
commitment. One all-day event per day carries the ordered queue as text, so the
plan is readable even when the soft times are already stale.

### D4. What a "domain" is (clarifying an unclear question)

A domain is just a **big area of life** — Army, Law School, MAcc, Money, Family,
Health. In this schema a domain is not a separate concept at all: it is a
top-level (`level='life'`) node, and every item inherits its domain by walking up
the tree. One taxonomy, nothing to keep in sync.

A `capacity_budget` attached to that node is a **ceiling, never a target**. Per D2
the system will never tell you to hit an hours number. The budget exists for one
job: letting the validator say *this plan is impossible* instead of silently
producing a week with 90 hours of work in it. If a plan comes in under budget,
that is not a failure and is never reported as one.

Budgets are effective-dated (`effective_from` / `effective_to`), because a
deployment changes every one of them at once.

### D5. Timezone history, not a current-timezone setting (clarifying an unclear question)

The concrete case: a CENTCOM deployment moves you 7–9 hours. If the system stored
only "current timezone," then on the day that setting changes, **every past day in
the database silently re-renders in the new zone**. Blocks recorded at 9pm in
Texas become the next morning. Throughput history — the thing D1 depends on —
would shift under you at the exact moment you most need it to be stable.

So: a `timezone_periods` table (`iana_tz`, `effective_from`). Every timestamp is
stored `timestamptz` (absolute truth); the local day it belongs to is resolved
using the zone that was in effect *at that instant*. A Tuesday in Texas stays a
Tuesday in Texas after you land in Kuwait. Roughly sixty extra lines, and
effectively impossible to retrofit once there is history.

### D6. Commitment intake for Phase 1

Manual web entry plus Telegram parse. `external_uid` and `source_key` columns
exist from day one so an inbound ICS importer (unit calendar) drops in later
without a migration. No importer built in Phase 1.

### D7. Models, runtime, and a chat surface

- Planning passes: `claude-opus-5`. Capture parsing: `claude-sonnet-5` (cheap, high volume).
- Planning route is Node runtime with `maxDuration = 300`. The propose → validate →
  revise loop is bounded at 3 rounds and **persists partial state to `plans` after
  each round**, so a timeout costs one round, not the whole pass.
- **Added to Phase 1 scope:** a chat surface for talking about the plan. Requested
  directly. Implemented as `/chat` plus `conversations` / `chat_messages`. The model
  gets read access to plan state through tools; anything it wants to *change* is
  emitted as a proposal and run through the same validator loop before it is
  written. Chat cannot bypass the validator — that would break the core
  architectural rule.

### D8. Life expectancy from actuarial baseline, refined later

- A static SSA period life table is checked in as `data/ssa-life-table.json`. This
  is data, not an integration — it does not call anything.
- `settings` holds `birth_date` and `sex`; remaining life expectancy is computed
  from the table, with a manual override field.
- Longevity dimensions (modifiers on the baseline) are a **later** addition, most
  likely hanging off the Health life-node. Not Phase 1. Noted so the settings
  shape leaves room: `life_expectancy_override_years`, `life_expectancy_source`.

### D9. Seeding by interview

Seed data is acknowledged as thin. Rather than a one-time import script, seeding
reuses the existing rotating-question machinery: the evening check-in already asks
up to three rotating questions, and a second pool of one-off **seeding questions**
feeds the same slot when the pool is non-empty. Answers land in `captures` raw and
are parsed into nodes/milestones/windows like anything else. Also available on
demand in chat ("quiz me").

### D10. ICS feed authentication

Phones cannot send an `Authorization` header on a calendar subscription. The feed
lives at `/api/ics/<token>.ics` where the token is a long random secret, held in a
separate env var from the cron/webhook secret so it can be rotated independently.
Documented in `.env.example` as: **anyone with this URL can read your plan.**

## Round 2 — 2026-11-11

### D11. Humanoid is the source of truth for the budget; Monarch is evidence

> "update Monarch budget to match humanoid and the source of truth is humanoid"

Monarch is now readable through its MCP connector. That does **not** change the
Phase 1 scope rule — nothing in the app integrates with it. It changes how the
money files get corrected: Monarch is read for *observed* figures (a payment that
actually drafted, a balance) and those are written into `src/core/money/` by hand,
with their source stated. The plan lives here. Monarch's budget is made to match it,
never the reverse.

Limits found on the first read, recorded so they are not rediscovered:

- The connector **cannot write budget amounts** or delete recurring streams. Those
  are manual edits in the Monarch app.
- Schwab and Wells Fargo accounts (7) are hidden from it — they connect through a
  provider whose data Monarch will not share. Their transactions, the Wells Fargo
  Platinum card and the brokerage side are invisible until reconnected.

### D12. The money plan is re-based, not extended

The August plan started at the 15 August cheque. By November it was re-paying bills
already paid and still waiting on a back pay from August. `PLAN_AS_OF` /
`PLAN_START` in `obligations.ts` now date the plan, one-offs dated before it are
dropped, and the August scenario lives in git history rather than in live code.
Re-base again whenever a balance moves materially; do not stack corrections on a
plan that starts in the past.

Facts taken at this re-base (2026-11-11):

| Fact | Was (Aug) | Now | Source |
|---|---|---|---|
| Net pay | modelled ~$7,190/mo | ~$7,500/mo, 1st & 15th | you; model unchanged — see open question |
| Mortgage payment | ~$1,300 | $1,387.79 | Monarch, October draft |
| Mortgage arrears | 4 payments | 2 left; 2× full payments/month; current in December | you |
| Car loan | $1,800 at $330/mo | ~$850 at $355/mo; November already paid | you; Monarch |
| Avant past due | $250.02 | cured (assumed) | Monarch shows a normal October payment |
| TSP | absent | ~$9,500, L 2050 | you |
| Emergency fund | $0 | $0 | you |
| CZTE | from 2026-09-04 | confirmed, E-6 / 10 yrs | you |

**Open finding, stated rather than smoothed:** on the household figures in this
file the second mortgage payment does not fit — the plan shows ~$4,090 of unpaid
bills across 8 paydays and cures the arrears in March, not December. You are making
the payments, so something is overstated: most likely the deployed household line,
support sent home, or the nannies, all August estimates. Correct those and the gap
should close; until then the page says so.

## Round 3 — 2026-11-11, reconciled with actuals

The Round 2 open finding is resolved — by correcting the inputs, not the arithmetic.
Every bill now fits, the catch-up included.

### D13. Projected spending is replaced by observed spending where it exists

The deployed profile was the at-home household scaled by guessed multipliers.
It is superseded for the live budget by `DEPLOYED_ACTUALS` (household.ts): what
actually left your accounts Sep–Nov 2026, per category, each row stating what it is
built from and naming the one-offs it excludes. About $1,000/mo against the $1,733
estimate. Two months of data — below D1's four-period bar — so re-read it after a
third. The multipliers stay for the post-deployment (law school) projection.

### D14. Facts that changed the plan

| Fact | Round 2 | Now | Source |
|---|---|---|---|
| Take-home | modelled $7,190 | $7,500 actual, after all deductions | you; Monarch Sep $7,603 |
| TSP | absent | 5% of base, full match, deducted in the model | you |
| Meal collection | taken | on file, **not applied** — take-home only reconciles without it | inference; confirm on an LES |
| Sent home | $750 nannies + $1,056 support | $1,000 every payday, covers nannies; extras ~$400/mo observed | you; Monarch |
| Nth Investments | $461 on the 15th | $500 on the 1st, = the Bank of America transfer | you; Monarch |
| Mortgage catch-up | 2 left, current December | 2 whole payments, 15 Dec and 15 Jan; **ends January** | you |

The model now nets ~$7,424/mo against the $7,500 observed, and a test fails if the
two drift more than 2% apart — declared vs demonstrated, as in D1.

The arrears sweep is gated off until after the scheduled catch-up: you pay in whole
payments, and letting it send partials turned January's payment into $50.

---

# Seed context — as of 2026-08-05

Facts to build the initial tree from. Not schema; input.

- 31, male. Army Reserves, 88M (Motor Transport Operator), Transportation Company.
- **Entering pre-mob for a second CENTCOM deployment.** This is the dominant
  near-term structural fact — it is an era boundary, not merely a commitment. It
  changes every capacity budget simultaneously, for a known-ish duration, and it
  opens and closes several windows at once.
- **Law school:** application and prep, LSAT prep specifically. Immediate priority
  for review and planning.
- **MAcc, TAMU-Corpus Christi, online:** in progress, 2 courses complete.
- **Finances:** effectively starting from zero. Historical data to be exported from
  Monarch manually. Earnings step up gradually as Army pay adds separation pay,
  hostile fire pay, CZTE, etc.

### Windows this seed implies (illustrative, to be confirmed)

These are the reason the system exists, and none of them are deadlines:

- **LSAT administration dates** — discrete, fixed, and a deployment can eliminate
  several consecutive ones.
- **Law school application cycle** — rolling admissions means an application
  submitted in September and the identical application submitted in February are
  not the same application. This is a closure-risk ramp, not a due date.
- **CZTE / hostile fire pay** — money that can *only* be earned inside the
  deployment window, at a tax treatment available at no other time. Textbook
  window: unmissable-once-missed, and the correct response is to front-load
  savings decisions before it opens, not after.
- **MAcc term registration** — discrete enrollment points; missing one costs a
  term, not a day.
- **Pre-mob → mobilization → deployment** — nested windows where each stage
  forecloses options available in the prior one.

### Scope note

Per the spec, no financial integration is built in Phase 1 — no Monarch import, no
scaffolding for one. This does not block financial *goals*: a savings target is an
achievement node with milestones and manually-entered observations, identical in
every respect to any other node.
