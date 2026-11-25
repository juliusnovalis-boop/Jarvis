CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"tools" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "command_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"origin" text DEFAULT 'mobile' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reply" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"room" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'off' NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'sim' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"attachment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pc_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"token" text NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pc_nodes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vision_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"engine" text DEFAULT 'local' NOT NULL,
	"faces" integer DEFAULT 0 NOT NULL,
	"brightness" integer DEFAULT 0 NOT NULL,
	"motion" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
