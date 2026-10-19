CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_path` text NOT NULL,
	`text_content` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_node_idx` ON `attachments` (`node_id`);--> statement-breakpoint
ALTER TABLE `llm_profiles` ADD `provider` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_profiles` ADD `capabilities` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_profiles` ADD `reasoning_effort` text;--> statement-breakpoint
ALTER TABLE `nodes` ADD `assistant_reasoning` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE VIRTUAL TABLE `nodes_fts` USING fts5(
	`title`,
	`user_content`,
	`assistant_content`,
	content='nodes',
	content_rowid='rowid',
	tokenize='trigram'
);--> statement-breakpoint
CREATE TRIGGER `nodes_fts_ai` AFTER INSERT ON `nodes` BEGIN
	INSERT INTO `nodes_fts`(`rowid`, `title`, `user_content`, `assistant_content`)
	VALUES (new.`rowid`, coalesce(new.`title`, ''), new.`user_content`, new.`assistant_content`);
END;--> statement-breakpoint
CREATE TRIGGER `nodes_fts_ad` AFTER DELETE ON `nodes` BEGIN
	INSERT INTO `nodes_fts`(`nodes_fts`, `rowid`, `title`, `user_content`, `assistant_content`)
	VALUES ('delete', old.`rowid`, coalesce(old.`title`, ''), old.`user_content`, old.`assistant_content`);
END;--> statement-breakpoint
CREATE TRIGGER `nodes_fts_au` AFTER UPDATE ON `nodes` BEGIN
	INSERT INTO `nodes_fts`(`nodes_fts`, `rowid`, `title`, `user_content`, `assistant_content`)
	VALUES ('delete', old.`rowid`, coalesce(old.`title`, ''), old.`user_content`, old.`assistant_content`);
	INSERT INTO `nodes_fts`(`rowid`, `title`, `user_content`, `assistant_content`)
	VALUES (new.`rowid`, coalesce(new.`title`, ''), new.`user_content`, new.`assistant_content`);
END;--> statement-breakpoint
INSERT INTO `nodes_fts`(`rowid`, `title`, `user_content`, `assistant_content`)
SELECT `rowid`, coalesce(`title`, ''), `user_content`, `assistant_content` FROM `nodes`;
