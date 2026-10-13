ALTER TABLE `cards` ADD `title_generated` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `cards` SET `title_generated` = 1;
