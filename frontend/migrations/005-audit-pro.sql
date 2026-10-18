-- Local Discovery Pro: cached full audit (30 days), share links, Stripe, score history.
ALTER TABLE audits ADD COLUMN share_key TEXT;
ALTER TABLE audits ADD COLUMN full_json TEXT;
ALTER TABLE audits ADD COLUMN expires_at INTEGER;
ALTER TABLE audits ADD COLUMN pro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audits ADD COLUMN pro_at INTEGER;
ALTER TABLE audits ADD COLUMN stripe_session TEXT;
ALTER TABLE audits ADD COLUMN stripe_payment TEXT;
CREATE INDEX IF NOT EXISTS audits_place ON audits (place_id, created_at);
CREATE INDEX IF NOT EXISTS audits_stripe ON audits (stripe_session);
CREATE TABLE IF NOT EXISTS audit_history (id TEXT PRIMARY KEY, place_id TEXT NOT NULL, audit_id TEXT, score INTEGER, grade TEXT, listing_score INTEGER, website_score INTEGER, visibility_score INTEGER, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS audit_history_place ON audit_history (place_id, at);
