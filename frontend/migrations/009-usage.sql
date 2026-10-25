-- Voice minute tracking + overage billing. Applied automatically by functions/_lib/usage.js (ensureUsageSchema)
-- on first use; kept here for the record and for a fresh database.
CREATE TABLE IF NOT EXISTS call_usage (call_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT, direction TEXT, from_number TEXT, started_at INTEGER NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS call_usage_tenant ON call_usage (tenant_id, started_at);
ALTER TABLE plans ADD COLUMN period_start INTEGER;
ALTER TABLE plans ADD COLUMN period_end INTEGER;
ALTER TABLE plans ADD COLUMN trial_end INTEGER;
ALTER TABLE plans ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}';
