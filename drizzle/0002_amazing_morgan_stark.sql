CREATE TABLE `node_digests` (
	`boundary_node_id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`covered_node_count` integer NOT NULL,
	`covered_token_count` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`boundary_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `node_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`quoted_node_id` text,
	`quote_text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quoted_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `node_quotes_node_idx` ON `node_quotes` (`node_id`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`user_content` text NOT NULL,
	`assistant_content` text DEFAULT '' NOT NULL,
	`assistant_status` text DEFAULT 'complete' NOT NULL,
	`assistant_error` text,
	`model` text,
	`turn_group_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_main_branch` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`is_collapsed` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nodes_project_idx` ON `nodes` (`project_id`);--> statement-breakpoint
CREATE INDEX `nodes_parent_idx` ON `nodes` (`parent_id`);--> statement-breakpoint
CREATE INDEX `nodes_turn_group_idx` ON `nodes` (`turn_group_id`);--> statement-breakpoint
CREATE TABLE `topic_cluster_nodes` (
	`cluster_id` text NOT NULL,
	`node_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`cluster_id`) REFERENCES `topic_clusters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_cluster_nodes_node_id_unique` ON `topic_cluster_nodes` (`node_id`);--> statement-breakpoint
CREATE INDEX `topic_cluster_nodes_cluster_idx` ON `topic_cluster_nodes` (`cluster_id`);--> statement-breakpoint
CREATE TABLE `topic_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`title_generated` integer DEFAULT false NOT NULL,
	`summary` text,
	`color` text,
	`is_collapsed` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `topic_clusters_project_idx` ON `topic_clusters` (`project_id`);