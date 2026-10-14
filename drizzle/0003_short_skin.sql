ALTER TABLE `nodes` ADD `answer_collapsed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `nodes` ADD `prompt_tokens` integer;--> statement-breakpoint
ALTER TABLE `nodes` ADD `completion_tokens` integer;