ALTER TABLE tenants ADD COLUMN voice_number TEXT;
ALTER TABLE tenants ADD COLUMN transfer_number TEXT;
ALTER TABLE tenants ADD COLUMN voice_id TEXT;
ALTER TABLE tenants ADD COLUMN retell_agent_id TEXT;
ALTER TABLE tenants ADD COLUMN retell_llm_id TEXT;
CREATE INDEX IF NOT EXISTS tenants_voice ON tenants (voice_number);
ALTER TABLE conversations ADD COLUMN summary TEXT;
