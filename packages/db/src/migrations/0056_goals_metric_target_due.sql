ALTER TABLE "goals" ADD COLUMN "metric" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "target_value" numeric;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "current_value" numeric;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "due_at" timestamp with time zone;