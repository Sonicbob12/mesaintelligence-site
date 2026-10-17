ALTER TABLE tenants ADD COLUMN workflows_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, conversation_id TEXT, trigger TEXT NOT NULL, ref_id TEXT, status TEXT NOT NULL DEFAULT 'running', steps_json TEXT NOT NULL DEFAULT '[]', reminder_due INTEGER, reminder_sent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS workflow_runs_conv ON workflow_runs (conversation_id);
CREATE INDEX IF NOT EXISTS workflow_runs_tenant ON workflow_runs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS workflow_runs_reminder ON workflow_runs (reminder_due, reminder_sent);
