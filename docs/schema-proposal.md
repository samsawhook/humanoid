# Proposed schema and file tree — awaiting approval

Status: **proposal.** No implementation code exists yet. Decisions behind this are
recorded in `/LIFE_DASH.md` under "Decision log."

---

## Conventions

- Every table: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz`, `deleted_at timestamptz`.
- **All deletes are soft** (`deleted_at`). No exceptions. `captures` is never deleted at all, not even softly.
- Every instant is `timestamptz`. A bare `date` column is used only where the thing genuinely *is* a local-calendar concept (`day_plans.local_date`), and it is always resolved through `timezone_periods` (D5).
- Enums are Postgres enums except where noted; adding a value is a migration, which is the point.
- Money is `numeric(14,2)`. Hours and amounts are `numeric`. Never floats.

---

## Tables

### Configuration

**`settings`** — singleton (`check (singleton_guard = true)`, unique).
`birth_date date`, `sex text`, `life_expectancy_override_years numeric`,
`life_expectancy_source text`, `singleton_guard boolean`.

**`planning_params`** — individually addressable so the model can propose changes at
retro time and each change is auditable.
`key text unique`, `value jsonb`, `notes text`, `updated_by enum(me|model)`,
`rationale text`.
Seeded keys: `min_periods_for_throughput` (4), `propagation_threshold_by_level`,
`max_planning_rounds` (3), `checkin_question_limit` (3).

**`timezone_periods`** — `iana_tz text`, `effective_from timestamptz`.
No `effective_to`; the next row ends the previous period. Resolution is
"the row with the greatest `effective_from` ≤ the instant in question." (D5)

### The goal tree

**`nodes`**
`parent_id → nodes.id`,
`title`, `description`,
`level enum(life|decade|campaign|year|quarter)`,
`kind enum(achievement|state)`,
`outcome_definition text` — *what output counts as achieved.* Required when
`kind='achievement'`. This is the D2 enforcement point: a node cannot exist without
a stated output, and "hours spent" is never a valid one.
`target_date date`, `date_basis enum(external_fixed|self_imposed|estimated)`,
`date_confidence enum(low|medium|high)`,
`window_open date`, `window_close date`, `window_basis text`,
`required_velocity_amount numeric`,
`required_velocity_unit enum(milestones|units|currency|rating_points)`,
`required_velocity_unit_label text`,
`required_velocity_period enum(week|month|quarter|year)`,
`required_velocity_computed_at timestamptz`,
`reversible boolean not null default true`,
`status enum(active|achieved|abandoned|deferred)`,
`sort_order int`.

**`node_dependencies`** — replaces the spec's `dependency_ids` array. An edge table is
queryable, FK-enforced, and lets an edge carry meaning.
`predecessor_id`, `successor_id`, `kind enum(finish_to_start|gates_window)`, `note`.
Unique on (predecessor, successor). Cycle check lives in the validator.

**`milestones`** — the "stages" link of the chain (D3).
`node_id`, `title`, `outcome_definition text`, `sequence int`,
`amount numeric`, `unit_label text`,
`target_date date`, `date_basis`, `window_open date`, `window_close date`,
`achieved_at timestamptz`, `evidence text`.

### State-node evidence (both required)

**`proxy_metrics`** — observable behavioral proxies.
`node_id`, `key text`, `label text`, `unit_label text`,
`direction enum(higher_better|lower_better|target_band)`,
`target_amount numeric`, `floor_amount numeric`, `target_period enum(week|month|quarter)`,
`source enum(self_reported|derived_from_outcomes)`.

**`proxy_observations`** — `metric_id`, `period_start date`, `period_end date`,
`amount numeric`, `observed_at timestamptz`, `capture_id`.

**`rating_dimensions`** — `key`, `label`, `prompt_text`, `scale_min int`, `scale_max int`,
`node_id`, `active boolean`, `last_asked_at timestamptz`.
Rotation is least-recently-asked-first, capped by `checkin_question_limit`.

**`ratings`** — `dimension_id`, `rated_at timestamptz`, `value numeric`, `note`, `capture_id`.

### Execution

**`items`** — actions.
`node_id` (nullable — inbox items are unassigned until triaged), `milestone_id`,
`title`, `notes`,
`effort_minutes int`, `effort_confidence enum(low|medium|high)`,
`due_at timestamptz`, `earliest_start_at timestamptz`,
`date_flexibility enum(fixed|elastic)`,
`status enum(todo|doing|done|dropped|blocked)`, `blocked_reason text`,
`recurrence_rule text` (RRULE),
`autopilot_critical boolean not null default false`,
`priority_hint int`.

**`commitments`** — externally imposed immovable time. Consumes capacity first.
`title`, `starts_at`, `ends_at`, `all_day boolean`, `location text`,
`node_id` (drill → the Army node),
`recurrence_rule text`,
`source enum(manual|telegram|imported)`, `source_key text`, `external_uid text`.
Partial unique on (`source_key`, `external_uid`) where both non-null — so a future ICS
importer upserts instead of duplicating (D6).

**`capacity_budgets`** — hours per week available in a domain. **Ceiling, never a
target** (D4).
`node_id` (a `level='life'` node), `hours_per_week numeric`,
`effective_from date`, `effective_to date`, `note text`.

### Queue and schedule (D3)

**`day_plans`** — the queue.
`local_date date`, `plan_id`, `generated_at timestamptz`,
`ordered_item_ids uuid[]` — deliberately an array. It is a snapshot of an ordering at a
moment, not a relation.
`rationale text`, `superseded_at timestamptz`.

**`scheduled_blocks`** — the schedule.
`local_date date`, `starts_at timestamptz`, `ends_at timestamptz`,
`item_id`, `commitment_id` — check constraint: exactly one is non-null,
`firmness enum(firm|soft)`,
`plan_id`, `superseded_at timestamptz`.
Deterministic re-slotting **supersedes** rows rather than mutating them, so the day's
actual history survives ("Army ran three hours long" is legible after the fact).

### Signal

**`captures`** — never deleted, never overwritten.
`channel enum(telegram|web|sms|email)`, `external_message_id text`,
`raw_payload jsonb not null` — the entire inbound body, verbatim,
`raw_text text`, `received_at timestamptz`,
`parsed jsonb`, `parsed_at timestamptz`, `parse_model text`, `parse_version int`.
Re-parsing writes a new `parse_version`; the raw payload is untouched forever.

**`outcomes`**
`scheduled_block_id`, `item_id`, `local_date date`,
`status enum(completed|partial|skipped)`,
`actual_minutes int`,
`skip_reason enum(external_overrun|no_time|didnt_want_to|did_something_else|blocked_external|other)`,
`skip_note text`, `capture_id`.

### Planning artifacts

**`plans`**
`scope enum(life|decade|campaign|year|quarter|week|day)`,
`scope_start date`, `scope_end date`,
`round int`, `status enum(draft|validated|rejected|active|superseded)`,
`model text`, `prompt_version text`,
`proposal jsonb`, `rationale text`,
`verdict jsonb` — `{ feasible, capacity_source: 'declared'|'demonstrated', totals }` (D1),
`activated_at`, `superseded_at`.
Written after **every** round, so a function timeout costs one round (D7).

**`plan_violations`** — named violations, one row each. Never a boolean.
`plan_id`, `code text`, `severity enum(hard|soft)`, `message text`,
`subject_type text`, `subject_id uuid`, `details jsonb`.

**`tradeoffs`** — the headline artifact.
`key text` — **stable across replans**, so the same sacrifice asserted in March and in
September is one row, not two.
`node_id`, `milestone_id`, `description text`, `rank int`,
`first_seen_at`, `last_seen_at`, `resolved_at`, `plan_id`.
This is what makes "I have been giving this up for seven months" visible. See
Refinement R3.

**`decisions`** — written by hand. Never auto-populated.
`title`, `the_call text`, `reasoning text`, `expected_outcome text`,
`review_date date`, `reviewed_at timestamptz`, `review_note text`, `node_id`.

### Interface plumbing

**`conversations`** — `title`, `started_at`.
**`chat_messages`** — `conversation_id`, `role enum(user|assistant|tool)`,
`content jsonb`, `plan_id` (when a turn produced a proposal), `created_at`.

**`seed_questions`** (D9) — `question text`, `topic text`, `active boolean`,
`asked_at timestamptz`, `answered_capture_id`.

**`outbound_messages`** — sent digests and check-ins.
`channel`, `kind enum(morning_digest|evening_checkin|alert)`, `local_date date`,
`sent_at`, `payload jsonb`, `external_message_id`.
**Unique on (`kind`, `local_date`)** — this is the idempotency guard. Vercel cron can
double-fire; without this you get two morning digests.

---

## Proposed refinements to the spec

The spec invites these. Each is a change I'd recommend, not a change I've made.

### R1. Window closure must bypass the propagation threshold

The spec says a slip escalates only after three consecutive sub-velocity periods. That
is correct for noise, and wrong for windows. Three consecutive quarters is nine months;
a deployment is roughly that long, and an LSAT administration or an application cycle
can close inside it. Noise suppression should never suppress an irreversible miss.

Proposed: keep the threshold as the default, and add one bypass — if a slip moves a
node's projected completion past a `window_close`, escalate **immediately**, flagged as
`WINDOW_CLOSURE_RISK` rather than as a velocity slip. Thresholds become per-level and
live in `planning_params`.

### R2. Not all target dates are constraints

The spec treats `target_date` uniformly. But an LSAT administration date and a date you
made up last Tuesday are not the same kind of object, and the model will treat both as
hard if the schema doesn't distinguish them. `date_basis` fixes this: only
`external_fixed` dates bind the validator. `self_imposed` and `estimated` dates are
movable, and the planner is allowed to move them and say so.

### R3. The tradeoff list needs identity and duration

The spec calls the ranked "what I'm giving up" list the most valuable artifact, but if
it regenerates from scratch each replan you can only ever see the current snapshot. The
signal that actually matters is *duration*: something you've sacrificed for seven
consecutive months is a different fact than something you sacrificed this week. Stable
`tradeoffs.key` plus `first_seen_at` / `last_seen_at` gives you that, and it is a far
better headline number than the completion rate the spec correctly bans.

### R4. Level adjacency should not be enforced

Requiring every path to run life → decade → campaign → year → quarter will produce
filler nodes that exist only to satisfy the schema. Proposed: a child's level may not be
coarser than its parent's, and that is the only rule. Skipping levels is allowed.

### R5. `autopilot_critical` needs a definition

Undefined in the spec. Proposed meaning: **things that must still happen when the system
is being ignored** — drill, medications, bills, anything with a non-recoverable
consequence. They bypass ordering entirely and pin unconditionally. If that is not what
was meant, it should be renamed.

### R6. One more skip reason

`blocked_external` — waiting on someone else. Distinct from every existing reason, and
the correction it implies (chase the other party) exists nowhere else in the list.

---

## File tree

```
/
  LIFE_DASH.md                  source of truth for design intent
  .env.example
  README.md                     setup, deploy, and how to run the cron routes by hand
  package.json  tsconfig.json  next.config.ts  drizzle.config.ts  vitest.config.ts
  /docs
    schema-proposal.md          this file; deleted once implemented
  /data
    ssa-life-table.json         static actuarial data (D8) — not an integration
  /drizzle                      generated migrations, committed
  /src
    /db
      schema.ts                 re-exports; one file per group below
      /tables
        nodes.ts  execution.ts  signal.ts  planning.ts  config.ts  chat.ts
      client.ts
    /core                       PURE. no db, no network, no clock reads.
      /time
        timezonePeriods.ts      resolve tz as of an instant
        localDay.ts             instant ↔ local day, period boundaries
      /capacity
        forwardPass.ts          available hours
        throughput.ts           demonstrated capacity from outcomes (D1)
        calibration.ts          estimated vs actual effort correction (D1)
      /planning
        backwardPass.ts         required OUTPUT rate per node (D2)
        toHours.ts              output rate → estimated hours; the only hours math
        closureRisk.ts          window ranking
        tradeoffs.ts            ranked sacrifice list, stable keys (R3)
      /validator
        index.ts                run(proposal, world) → Violation[]
        codes.ts                every violation code, one place
        /rules
          overCapacity.ts  fixedConflict.ts  windowBreach.ts
          orphanNode.ts  unreachableVelocity.ts  dependencyCycle.ts
          missingOutcomeDefinition.ts  emptyState.ts
      /schedule
        reslot.ts               deterministic day re-slot, no model call
        order.ts                queue ordering
      types.ts
    /services                   IMPURE. db + llm orchestration.
      planner.ts                propose → validate → revise, bounded, persists per round
      capture.ts  digest.ts  checkin.ts  seeding.ts  ics.ts
    /llm
      client.ts  schemas.ts     zod structured output
      /prompts                  versioned; prompt_version recorded on every plan
    /channels
      channel.ts                Channel interface: send, receive → NormalizedInbound
      telegram.ts
    /lib
      env.ts                    zod-validated, fails loudly at boot
      auth.ts                   bearer secret; 401 otherwise
    /app
      /api
        /telegram/webhook/route.ts
        /cron/morning-digest/route.ts
        /cron/evening-checkin/route.ts
        /cron/replan/route.ts
        /ics/[token]/route.ts           path token, separate secret (D10)
        /chat/route.ts                  maxDuration 300 (D7)
      /(web)
        tree/  week/  backlog/  verdict/  chat/     function over polish
  /tests
    /core                       mirrors src/core one-for-one
      validator/*.test.ts       the six required cases + cycle + missing outcome
      time/  capacity/  planning/  schedule/
    /fixtures
      world.ts                  hand-built world objects, no db
```

`/src/core` has no imports from `/src/db`, `/src/services`, or `/src/llm`, and that is
enforced by a lint rule rather than by discipline. It is the half that has to still be
correct in three years.

---

## Environment variables (`.env.example`)

```
DATABASE_URL=
ANTHROPIC_API_KEY=
CRON_SECRET=                  # cron + telegram webhook bearer
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ICS_FEED_TOKEN=               # WARNING: anyone with the feed URL can read your plan.
                              # Rotate independently of CRON_SECRET.
APP_BASE_URL=
```

---

## Build order once approved

1. Schema + migrations + `/tests/fixtures/world.ts`.
2. `/src/core/time` and `/src/core/validator` with the full test suite. Nothing else
   until these are green — everything downstream trusts them.
3. Backward pass, forward pass, tradeoffs, verdict.
4. Seed the tree from the seed context in `LIFE_DASH.md`, by interview.
5. Telegram capture → digest → check-in → cron.
6. ICS, web views, chat.
