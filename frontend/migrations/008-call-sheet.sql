-- Call sheet: keep the Google rating/review count of businesses we couldn't email, plus the phone line type.
-- Safe to run once. (The code still works before this runs — the call sheet just lacks ratings.)
ALTER TABLE outreach ADD COLUMN rating REAL;
ALTER TABLE outreach ADD COLUMN reviews INTEGER;
