ALTER TABLE "submissions" ADD COLUMN "form_service" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "qualifiers" jsonb;