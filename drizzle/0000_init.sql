CREATE TYPE "public"."capacity_source" AS ENUM('declared', 'demonstrated');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('telegram', 'web', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."commitment_source" AS ENUM('manual', 'telegram', 'imported');--> statement-breakpoint
CREATE TYPE "public"."date_basis" AS ENUM('external_fixed', 'self_imposed', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."date_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."date_flexibility" AS ENUM('fixed', 'elastic');--> statement-breakpoint
CREATE TYPE "public"."dependency_kind" AS ENUM('finish_to_start', 'gates_window');--> statement-breakpoint
CREATE TYPE "public"."effort_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."firmness" AS ENUM('firm', 'soft');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('todo', 'doing', 'done', 'dropped', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."node_kind" AS ENUM('achievement', 'state');--> statement-breakpoint
CREATE TYPE "public"."node_level" AS ENUM('life', 'decade', 'campaign', 'year', 'quarter');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('active', 'achieved', 'abandoned', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."outbound_kind" AS ENUM('morning_digest', 'evening_checkin', 'alert');--> statement-breakpoint
CREATE TYPE "public"."outcome_status" AS ENUM('completed', 'partial', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."param_author" AS ENUM('me', 'model');--> statement-breakpoint
CREATE TYPE "public"."plan_scope" AS ENUM('life', 'decade', 'campaign', 'year', 'quarter', 'week', 'day');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'validated', 'rejected', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."proxy_direction" AS ENUM('higher_better', 'lower_better', 'target_band');--> statement-breakpoint
CREATE TYPE "public"."proxy_source" AS ENUM('self_reported', 'derived_from_outcomes');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('external_overrun', 'no_time', 'didnt_want_to', 'did_something_else', 'blocked_external', 'other');--> statement-breakpoint
CREATE TYPE "public"."velocity_period" AS ENUM('week', 'month', 'quarter', 'year');--> statement-breakpoint
CREATE TYPE "public"."velocity_unit" AS ENUM('milestones', 'units', 'currency', 'rating_points');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planning_params" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"notes" text,
	"updated_by" "param_author" DEFAULT 'me' NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_guard" boolean DEFAULT true NOT NULL,
	"birth_date" date NOT NULL,
	"sex" text NOT NULL,
	"life_expectancy_override_years" numeric,
	"life_expectancy_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timezone_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iana_zone" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"title" text NOT NULL,
	"outcome_definition" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"amount" numeric,
	"unit_label" text,
	"target_date" date,
	"date_basis" date_basis,
	"window_open" date,
	"window_close" date,
	"achieved_at" timestamp with time zone,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "node_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"kind" "dependency_kind" DEFAULT 'finish_to_start' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"level" "node_level" NOT NULL,
	"kind" "node_kind" NOT NULL,
	"outcome_definition" text,
	"target_date" date,
	"date_basis" date_basis,
	"date_confidence" date_confidence,
	"window_open" date,
	"window_close" date,
	"window_basis" text,
	"required_velocity_amount" numeric,
	"required_velocity_unit" "velocity_unit",
	"required_velocity_unit_label" text,
	"required_velocity_period" "velocity_period",
	"required_velocity_computed_at" timestamp with time zone,
	"reversible" boolean DEFAULT true NOT NULL,
	"status" "node_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proxy_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"unit_label" text NOT NULL,
	"direction" "proxy_direction" DEFAULT 'higher_better' NOT NULL,
	"target_amount" numeric,
	"floor_amount" numeric,
	"target_period" "velocity_period" DEFAULT 'week' NOT NULL,
	"source" "proxy_source" DEFAULT 'self_reported' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proxy_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" numeric NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rating_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"prompt_text" text NOT NULL,
	"scale_min" integer DEFAULT 1 NOT NULL,
	"scale_max" integer DEFAULT 5 NOT NULL,
	"node_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"last_asked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension_id" uuid NOT NULL,
	"rated_at" timestamp with time zone NOT NULL,
	"value" numeric NOT NULL,
	"note" text,
	"capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capacity_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"hours_per_week" numeric NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"node_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"recurrence_rule" text,
	"source" "commitment_source" DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"external_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "day_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_date" date NOT NULL,
	"plan_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ordered_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"rationale" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"effort_minutes" integer DEFAULT 30 NOT NULL,
	"effort_confidence" "effort_confidence" DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"earliest_start_at" timestamp with time zone,
	"date_flexibility" date_flexibility DEFAULT 'elastic' NOT NULL,
	"status" "item_status" DEFAULT 'todo' NOT NULL,
	"blocked_reason" text,
	"recurrence_rule" text,
	"autopilot_critical" boolean DEFAULT false NOT NULL,
	"priority_hint" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"item_id" uuid,
	"commitment_id" uuid,
	"firmness" "firmness" DEFAULT 'soft' NOT NULL,
	"plan_id" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "scheduled_blocks_one_subject" CHECK (("scheduled_blocks"."item_id" is not null and "scheduled_blocks"."commitment_id" is null)
       or ("scheduled_blocks"."item_id" is null and "scheduled_blocks"."commitment_id" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"external_message_id" text,
	"raw_payload" jsonb NOT NULL,
	"raw_text" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed" jsonb,
	"parsed_at" timestamp with time zone,
	"parse_model" text,
	"parse_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"the_call" text NOT NULL,
	"reasoning" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"review_date" date,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"node_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_block_id" uuid,
	"item_id" uuid,
	"local_date" date NOT NULL,
	"status" "outcome_status" NOT NULL,
	"actual_minutes" integer,
	"skip_reason" "skip_reason",
	"skip_note" text,
	"capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seed_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"topic" text,
	"active" boolean DEFAULT true NOT NULL,
	"asked_at" timestamp with time zone,
	"answered_capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" jsonb NOT NULL,
	"plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"kind" "outbound_kind" NOT NULL,
	"local_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"external_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "plan_scope" NOT NULL,
	"scope_start" date NOT NULL,
	"scope_end" date NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"model" text,
	"prompt_version" text,
	"proposal" jsonb NOT NULL,
	"rationale" text,
	"verdict" jsonb,
	"capacity_source" "capacity_source",
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tradeoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"node_id" uuid,
	"milestone_id" uuid,
	"description" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "milestones" ADD CONSTRAINT "milestones_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "node_dependencies" ADD CONSTRAINT "node_dependencies_predecessor_id_nodes_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "node_dependencies" ADD CONSTRAINT "node_dependencies_successor_id_nodes_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proxy_metrics" ADD CONSTRAINT "proxy_metrics_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proxy_observations" ADD CONSTRAINT "proxy_observations_metric_id_proxy_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."proxy_metrics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rating_dimensions" ADD CONSTRAINT "rating_dimensions_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ratings" ADD CONSTRAINT "ratings_dimension_id_rating_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."rating_dimensions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capacity_budgets" ADD CONSTRAINT "capacity_budgets_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commitments" ADD CONSTRAINT "commitments_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_blocks" ADD CONSTRAINT "scheduled_blocks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_blocks" ADD CONSTRAINT "scheduled_blocks_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_scheduled_block_id_scheduled_blocks_id_fk" FOREIGN KEY ("scheduled_block_id") REFERENCES "public"."scheduled_blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_capture_id_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."captures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seed_questions" ADD CONSTRAINT "seed_questions_answered_capture_id_captures_id_fk" FOREIGN KEY ("answered_capture_id") REFERENCES "public"."captures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_violations" ADD CONSTRAINT "plan_violations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tradeoffs" ADD CONSTRAINT "tradeoffs_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tradeoffs" ADD CONSTRAINT "tradeoffs_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tradeoffs" ADD CONSTRAINT "tradeoffs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planning_params_key" ON "planning_params" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_singleton" ON "settings" USING btree ("singleton_guard");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestones_node_idx" ON "milestones" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "node_dependencies_edge" ON "node_dependencies" USING btree ("predecessor_id","successor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nodes_parent_idx" ON "nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nodes_level_idx" ON "nodes" USING btree ("level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nodes_window_close_idx" ON "nodes" USING btree ("window_close");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proxy_metrics_node_key" ON "proxy_metrics" USING btree ("node_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proxy_observations_metric_idx" ON "proxy_observations" USING btree ("metric_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rating_dimensions_key" ON "rating_dimensions" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ratings_dimension_idx" ON "ratings" USING btree ("dimension_id","rated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capacity_budgets_node_idx" ON "capacity_budgets" USING btree ("node_id","effective_from");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commitments_window_idx" ON "commitments" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commitments_external_identity" ON "commitments" USING btree ("source_key","external_uid") WHERE "commitments"."source_key" is not null and "commitments"."external_uid" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "day_plans_date_idx" ON "day_plans" USING btree ("local_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_node_idx" ON "items" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_status_idx" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_blocks_date_idx" ON "scheduled_blocks" USING btree ("local_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captures_received_idx" ON "captures" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_date_idx" ON "outcomes" USING btree ("local_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_item_idx" ON "outcomes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_messages_once_per_day" ON "outbound_messages" USING btree ("kind","local_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_violations_plan_idx" ON "plan_violations" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_violations_code_idx" ON "plan_violations" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_scope_idx" ON "plans" USING btree ("scope","scope_start");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tradeoffs_key" ON "tradeoffs" USING btree ("key");