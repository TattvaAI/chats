-- The original readiness migration predates the migration journal for core tables.
-- New databases need this baseline first; existing tables and their data are preserved.
CREATE TABLE IF NOT EXISTS profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL CONSTRAINT profiles_email_unique UNIQUE,
 locale text NOT NULL DEFAULT 'en', created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid CONSTRAINT conversations_user_id_profiles_id_fk REFERENCES profiles(id) ON DELETE CASCADE,
 title text NOT NULL, category text NOT NULL, source text NOT NULL,
 participants text[] NOT NULL DEFAULT ARRAY[]::text[], message_count integer DEFAULT 0,
 file_url text, delete_token text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL CONSTRAINT reports_conversation_id_conversations_id_fk REFERENCES conversations(id) ON DELETE CASCADE,
 report_number integer NOT NULL DEFAULT 1, type text NOT NULL DEFAULT 'initial', preview_data jsonb NOT NULL,
 full_report_data jsonb, is_unlocked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid CONSTRAINT purchases_user_id_profiles_id_fk REFERENCES profiles(id) ON DELETE SET NULL,
 report_id uuid CONSTRAINT purchases_report_id_reports_id_fk REFERENCES reports(id) ON DELETE CASCADE, stripe_session_id text NOT NULL CONSTRAINT purchases_stripe_session_id_unique UNIQUE,
 amount integer NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS otp_codes (
 email text PRIMARY KEY, code text NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, send_count integer NOT NULL DEFAULT 0,
 last_sent_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
 token text PRIMARY KEY, profile_id uuid NOT NULL CONSTRAINT sessions_profile_id_profiles_id_fk REFERENCES profiles(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS analytics_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_name text NOT NULL,
 metadata jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delete_token text;
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_number integer NOT NULL DEFAULT 1;
