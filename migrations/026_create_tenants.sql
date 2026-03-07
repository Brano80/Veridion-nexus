-- Migration 026: Multi-tenancy — tenants table, tenant_id columns, admin tenant seed
-- Supports API key auth, per-tenant isolation, trial management, soft delete.

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'free_trial',
    mode VARCHAR(50) NOT NULL DEFAULT 'shadow',
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    api_key_prefix VARCHAR(20) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    trial_expires_at TIMESTAMPTZ,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 100,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_api_key_hash ON tenants(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE evidence_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE scc_registries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE compliance_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE human_oversight ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_evidence_events_tenant_id ON evidence_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scc_registries_tenant_id ON scc_registries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_records_tenant_id ON compliance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_human_oversight_tenant_id ON human_oversight(tenant_id);

-- Seed admin tenant with SHA-256 of 'ss_test_adminkey_dev_only_change_in_prod'
INSERT INTO tenants (name, plan, mode, api_key_hash, api_key_prefix, is_admin, trial_expires_at, rate_limit_per_minute)
VALUES (
    'Veridion Admin',
    'enterprise',
    'enforce',
    '9a09dcbd610a6fbc5f0f55c0bc1230c9635ef1a3dbf331ad3a6e119a39c0c4c8',
    'ss_test_adminke',
    true,
    NULL,
    10000
) ON CONFLICT (api_key_hash) DO NOTHING;
