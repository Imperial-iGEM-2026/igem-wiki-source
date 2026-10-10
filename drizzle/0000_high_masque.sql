CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`author` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `presence` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seen` integer NOT NULL
);
