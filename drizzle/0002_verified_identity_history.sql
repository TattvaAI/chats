ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_sub text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE profiles ADD CONSTRAINT profiles_google_sub_unique UNIQUE (google_sub);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- A zero default deliberately invalidates sessions issued by the old instant-login route.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS followups (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 report_number integer NOT NULL DEFAULT 1, question text NOT NULL, answer text,
 status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversations_owner_created_idx ON conversations(user_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS otp_codes_expiry_idx ON otp_codes(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchases_owner_idx ON purchases(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchases_report_idx ON purchases(report_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS analysis_jobs_created_idx ON analysis_jobs(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS analysis_jobs_conversation_idx ON analysis_jobs(conversation_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS report_shares_expiry_idx ON report_shares(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS request_limits_expiry_idx ON request_limits(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS feedback_email_idx ON feedback(email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS followups_history_idx ON followups(conversation_id, report_number, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS followups_pending_idx ON followups(status, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS followups_created_idx ON followups(created_at);
--> statement-breakpoint
-- Legacy owned reports may still carry a guest token. Account ownership replaces it.
UPDATE conversations SET delete_token = NULL WHERE user_id IS NOT NULL AND delete_token IS NOT NULL;
