ALTER TABLE "access_requests" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "notify_channel" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "notify_error" text;