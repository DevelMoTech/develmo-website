ALTER TABLE "applications" ADD COLUMN "ack_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "ack_error" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_sent_by_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_period" text DEFAULT 'year' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "canonical_override" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "updated_by_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_rejection_sent_by_id_users_id_fk" FOREIGN KEY ("rejection_sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;