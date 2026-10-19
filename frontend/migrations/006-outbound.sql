-- Outbound engine: daily category/city prospecting, cold email log, suppression, sales-call bookings.
CREATE TABLE IF NOT EXISTS outreach (
  id TEXT PRIMARY KEY, place_id TEXT NOT NULL, audit_id TEXT, run_id TEXT,
  category TEXT NOT NULL, city TEXT NOT NULL, business TEXT, email TEXT, website TEXT, phone TEXT,
  score INTEGER, grade TEXT, rank_label TEXT, rank_position INTEGER,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sent | followup_sent | booked | replied | unsubscribed | bounced | skipped | error
  skip_reason TEXT, subject TEXT, body_text TEXT, unsub_token TEXT,
  sent_at INTEGER, followup_at INTEGER, booked_at INTEGER, last_error TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_place ON outreach (place_id);
CREATE INDEX IF NOT EXISTS outreach_status ON outreach (status, sent_at);
CREATE INDEX IF NOT EXISTS outreach_run ON outreach (run_id);
CREATE INDEX IF NOT EXISTS outreach_unsub ON outreach (unsub_token);

CREATE TABLE IF NOT EXISTS outbound_runs (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, mode TEXT NOT NULL, category TEXT, city TEXT,
  found INTEGER DEFAULT 0, emailed INTEGER DEFAULT 0, skipped INTEGER DEFAULT 0, followups INTEGER DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]', notes TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS outbound_runs_day ON outbound_runs (day, mode);

CREATE TABLE IF NOT EXISTS suppression (email TEXT PRIMARY KEY, reason TEXT, at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS sales_bookings (
  id TEXT PRIMARY KEY, outreach_id TEXT, audit_id TEXT, name TEXT, email TEXT, phone TEXT, business TEXT,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, calendar_event_id TEXT, notes TEXT, source TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_bookings_start ON sales_bookings (start_at);
