CREATE TYPE "public"."escrow_action" AS ENUM('fund', 'submit_work', 'request_revision', 'release', 'release_after_review', 'cancel_by_freelancer', 'refund_after_deadline', 'raise_dispute', 'resolve_dispute', 'resolve_expired_dispute');--> statement-breakpoint
CREATE TYPE "public"."escrow_onchain_status" AS ENUM('none', 'funded', 'submitted', 'revision_requested', 'disputed', 'released', 'refunded', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."escrow_tx_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."escrow_version" AS ENUM('v2', 'v3');--> statement-breakpoint
CREATE TABLE "escrow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"escrow_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"escrow_id" bigint NOT NULL,
	"event_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"contract_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"escrow_address" text NOT NULL,
	"action" "escrow_action" NOT NULL,
	"tx_hash" text NOT NULL,
	"status" "escrow_tx_status" DEFAULT 'pending' NOT NULL,
	"initiated_by" uuid,
	"block_number" bigint,
	"metadata" jsonb,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"key" text PRIMARY KEY NOT NULL,
	"last_processed_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "escrow_version" "escrow_version" DEFAULT 'v2' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "chain_id" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "contract_ref" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "on_chain_status" "escrow_onchain_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "on_chain_revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "on_chain_max_revisions" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "work_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "review_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "dispute_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "settled_to_freelancer" numeric(38, 0);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "settled_to_client" numeric(38, 0);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "settled_to_fee" numeric(38, 0);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "last_event_block" bigint;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "last_event_log_index" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "sync_issue" text;--> statement-breakpoint
ALTER TABLE "escrow_events" ADD CONSTRAINT "escrow_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_events_log_unique" ON "escrow_events" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "escrow_events_escrow_idx" ON "escrow_events" USING btree ("chain_id","escrow_address","escrow_id");--> statement-breakpoint
CREATE INDEX "escrow_events_unapplied_idx" ON "escrow_events" USING btree ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_tx_chain_hash_unique" ON "escrow_transactions" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_tx_one_pending_per_contract" ON "escrow_transactions" USING btree ("contract_id") WHERE "escrow_transactions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "escrow_tx_status_idx" ON "escrow_transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_contract_ref_unique" ON "contracts" USING btree ("contract_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_escrow_onchain_unique" ON "contracts" USING btree ("escrow_contract_address","on_chain_contract_id") WHERE "contracts"."on_chain_contract_id" is not null;--> statement-breakpoint
CREATE INDEX "contracts_onchain_open_idx" ON "contracts" USING btree ("escrow_version","on_chain_status");