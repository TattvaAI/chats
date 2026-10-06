CREATE TABLE IF NOT EXISTS analysis_jobs (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'queued', stage text NOT NULL DEFAULT 'Queued', payload jsonb,
 attempts integer NOT NULL DEFAULT 0, lease_id uuid, lease_until timestamptz,
 error_code text, error_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS analysis_jobs_queue_idx ON analysis_jobs(status, lease_until);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS report_shares (
 conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS request_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS feedback (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, email text, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
WITH numbered AS (
 SELECT id, row_number() OVER (PARTITION BY conversation_id ORDER BY created_at,id) AS num FROM reports
) UPDATE reports SET report_number=numbered.num FROM numbered WHERE reports.id=numbered.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reports_conversation_number_idx ON reports(conversation_id, report_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversations_owner_idx ON conversations(user_id);
