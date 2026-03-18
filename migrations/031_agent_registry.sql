CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    url VARCHAR(512),
    provider_org VARCHAR(255),
    provider_url VARCHAR(512),
    allowed_data_categories JSONB NOT NULL DEFAULT '[]',
    allowed_destination_countries JSONB NOT NULL DEFAULT '[]',
    allowed_partners JSONB NOT NULL DEFAULT '[]',
    trust_level INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_versions (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL REFERENCES agents(id),
    tenant_id UUID NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    policy_hash VARCHAR(128) NOT NULL,
    allowed_data_categories JSONB NOT NULL DEFAULT '[]',
    allowed_destination_countries JSONB NOT NULL DEFAULT '[]',
    allowed_partners JSONB NOT NULL DEFAULT '[]',
    changed_by VARCHAR(255),
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_agent_id ON policy_versions(agent_id);
