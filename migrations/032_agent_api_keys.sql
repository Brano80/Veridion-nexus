ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
