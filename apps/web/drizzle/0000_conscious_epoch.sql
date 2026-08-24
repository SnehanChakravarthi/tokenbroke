CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"avatar_url" text NOT NULL,
	"github_created_at" timestamp with time zone NOT NULL,
	"x_handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_codes" (
	"code_digest" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"anonymous_name" text NOT NULL,
	"stable_hash" bigint NOT NULL,
	"account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_submitted_at" timestamp with time zone NOT NULL,
	"last_cli_version" text NOT NULL,
	"last_platform_os" text NOT NULL,
	"shadow_banned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_buckets" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_buckets_scope_key_hash_bucket_start_pk" PRIMARY KEY("scope","key_hash","bucket_start"),
	CONSTRAINT "rate_buckets_count_check" CHECK ("rate_buckets"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tool" text NOT NULL,
	"announced_at" timestamp with time zone,
	"landed_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"note" text,
	CONSTRAINT "resets_tool_check" CHECK ("resets"."tool" in ('claude-code', 'codex')),
	CONSTRAINT "resets_source_check" CHECK ("resets"."source" = 'admin')
);
--> statement-breakpoint
CREATE TABLE "snapshot_obs" (
	"device_id" text NOT NULL,
	"tool" text NOT NULL,
	"series_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"submission_id" bigint NOT NULL,
	"source" text DEFAULT 'snapshot' NOT NULL,
	"used_percent" real NOT NULL,
	"resets_at" timestamp with time zone,
	"window_minutes" integer,
	"raw_kind" text NOT NULL,
	"scope" text,
	"plan_raw" text,
	"cli_version" text NOT NULL,
	"registry_version" integer NOT NULL,
	CONSTRAINT "snapshot_obs_device_id_tool_series_id_observed_at_pk" PRIMARY KEY("device_id","tool","series_id","observed_at"),
	CONSTRAINT "snapshot_obs_tool_check" CHECK ("snapshot_obs"."tool" in ('claude-code', 'codex')),
	CONSTRAINT "snapshot_obs_source_check" CHECK ("snapshot_obs"."source" = 'snapshot'),
	CONSTRAINT "snapshot_obs_percentage_check" CHECK ("snapshot_obs"."used_percent" >= 0 and "snapshot_obs"."used_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"trigger" text NOT NULL,
	"schema_version" integer NOT NULL,
	"cli_version" text NOT NULL,
	"platform_os" text NOT NULL,
	"nonce" text NOT NULL,
	"raw_body" bytea NOT NULL,
	"signature" text NOT NULL,
	CONSTRAINT "submissions_trigger_check" CHECK ("submissions"."trigger" in ('manual', 'hook:claude-code', 'hook:codex'))
);
--> statement-breakpoint
CREATE TABLE "tool_states" (
	"device_id" text NOT NULL,
	"tool" text NOT NULL,
	"install" text NOT NULL,
	"observation" text NOT NULL,
	"tool_version" text,
	"observed_at" timestamp with time zone NOT NULL,
	"source_fetched_at" timestamp with time zone,
	"plan_raw" text,
	"plan_label" text,
	"windows" jsonb NOT NULL,
	"registry_version" integer NOT NULL,
	"state_nonce" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_states_device_id_tool_pk" PRIMARY KEY("device_id","tool"),
	CONSTRAINT "tool_states_tool_check" CHECK ("tool_states"."tool" in ('claude-code', 'codex'))
);
--> statement-breakpoint
ALTER TABLE "claim_codes" ADD CONSTRAINT "claim_codes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_obs" ADD CONSTRAINT "snapshot_obs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_obs" ADD CONSTRAINT "snapshot_obs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_states" ADD CONSTRAINT "tool_states_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_github_id_unique" ON "accounts" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "claim_codes_device_expires_idx" ON "claim_codes" USING btree ("device_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_public_key_unique" ON "devices" USING btree ("public_key");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_anonymous_name_unique" ON "devices" USING btree ("anonymous_name");--> statement-breakpoint
CREATE INDEX "devices_account_id_idx" ON "devices" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "resets_tool_landed_idx" ON "resets" USING btree ("tool","landed_at");--> statement-breakpoint
CREATE INDEX "snapshot_obs_tool_series_observed_idx" ON "snapshot_obs" USING btree ("tool","series_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_nonce_unique" ON "submissions" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "submissions_device_received_idx" ON "submissions" USING btree ("device_id","received_at");--> statement-breakpoint
CREATE INDEX "tool_states_tool_observed_idx" ON "tool_states" USING btree ("tool","observed_at");
--> statement-breakpoint
INSERT INTO "resets" ("tool", "announced_at", "landed_at", "source", "note")
VALUES ('codex', '2026-08-23T00:00:00.000Z', '2026-08-24T00:00:00.000Z', 'admin', 'Tibo-announced');
