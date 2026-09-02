ALTER TABLE "users" ADD COLUMN "digest" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_notes" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "product" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "topic" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "region" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "delivery_channel" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "last_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "read_at" timestamp with time zone;