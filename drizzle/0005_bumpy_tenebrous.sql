ALTER TABLE `nodes` ADD `title` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `title_generated` integer DEFAULT false NOT NULL;