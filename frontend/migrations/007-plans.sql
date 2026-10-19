CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, tenant_id TEXT, audit_id TEXT, place_id TEXT, business TEXT, name TEXT, email TEXT, phone TEXT, website TEXT, stripe_customer TEXT, stripe_subscription TEXT, stripe_session TEXT, price_id TEXT, interval TEXT, status TEXT NOT NULL DEFAULT 'pending', portal_token TEXT, onboarded INTEGER NOT NULL DEFAULT 0, settings_json TEXT NOT NULL DEFAULT '{}', next_audit_at INTEGER, last_audit_id TEXT, last_score INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS plans_token ON plans (portal_token);
CREATE INDEX IF NOT EXISTS plans_sub ON plans (stripe_subscription);
CREATE INDEX IF NOT EXISTS plans_session ON plans (stripe_session);
CREATE INDEX IF NOT EXISTS plans_next ON plans (status, next_audit_at);
CREATE TABLE IF NOT EXISTS review_requests (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, tenant_id TEXT, customer_name TEXT, to_phone TEXT, to_email TEXT, channel TEXT, status TEXT NOT NULL DEFAULT 'sent', error TEXT, sent_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS review_requests_plan ON review_requests (plan_id, sent_at);
