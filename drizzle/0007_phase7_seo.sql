ALTER TABLE "seo_audits" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_audits" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "seo_audits" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "seo_audits" ADD COLUMN "started_by_id" uuid;--> statement-breakpoint
ALTER TABLE "seo_overrides" ADD COLUMN "faq_enabled" boolean;--> statement-breakpoint
ALTER TABLE "seo_audits" ADD CONSTRAINT "seo_audits_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;