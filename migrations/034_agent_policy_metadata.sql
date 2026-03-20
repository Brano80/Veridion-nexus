-- GDPR Art. 30 / extended agent registration (autonomy, legal basis, DPIA, partner detail)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS policy_metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS policy_metadata JSONB NOT NULL DEFAULT '{}';
