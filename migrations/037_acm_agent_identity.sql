-- Migration 037: Extend agents table for ACM AgentRecord compliance
-- Implements: ACM Spec v0.1 AgentRecord fields not yet present
-- Adds: OAuth 2.1 identity fields, EU AI Act classification, retention policy,
--       A2A card URL, and transfer policies
--
-- IMPORTANT: oauth_client_id is the bridge between the MCP proxy and the agents table.
--   The proxy extracts client_id from the inbound OAuth 2.1 Bearer token and uses
--   GET /api/agents?oauth_client_id={id} to resolve the full AgentRecord.
--   This is the sole source of agent identity — self-reported identity is rejected.
--
-- retention_policy is REQUIRED. The Rust API must reject agent registration
-- (POST /api/agents) if retention_policy is null or missing minimum fields.
-- Minimum required sub-fields:
--   { "minimum_retention_days": <int>, "legal_basis_for_retention": <string> }
-- Optional: { "deletion_scheduled_at": <ISO8601 string or null> }

-- OAuth 2.1 agent identity
ALTER TABLE agents ADD COLUMN IF NOT EXISTS oauth_client_id       TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS oauth_issuer           TEXT;
-- The JWKS URI or authorization server base URL
-- e.g. 'https://auth.veridion-nexus.eu' or for local dev: 'http://localhost:8080'
ALTER TABLE agents ADD COLUMN IF NOT EXISTS oauth_scope            TEXT;
-- Space-separated scopes this agent is authorised to use
-- e.g. 'acm:write tool:read'
ALTER TABLE agents ADD COLUMN IF NOT EXISTS token_expiry_seconds   INTEGER DEFAULT 3600;

-- ACM Spec AgentRecord.classification fields
ALTER TABLE agents ADD COLUMN IF NOT EXISTS eu_ai_act_risk_level          VARCHAR(20)
    CHECK (eu_ai_act_risk_level IN ('unacceptable', 'high', 'limited', 'minimal'));
ALTER TABLE agents ADD COLUMN IF NOT EXISTS processes_personal_data        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS automated_decision_making      BOOLEAN NOT NULL DEFAULT false;

-- ACM Spec AgentRecord.deployment fields
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deployment_environment  VARCHAR(50);
-- e.g. 'production', 'staging', 'development'
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deployment_region       TEXT;
-- e.g. 'eu-west-1', 'eu-central-1'
ALTER TABLE agents ADD COLUMN IF NOT EXISTS data_residency          TEXT;
-- ISO 3166-1 alpha-2 country code, e.g. 'DE', 'IE', 'NL'

-- ACM Spec AgentRecord.transfer_policies
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_policies       JSONB NOT NULL DEFAULT '[]';
-- Expected shape: [{ "destination": "US", "mechanism": "scc", "scc_ref": "2021/914/EU" }]

-- ACM Spec AgentRecord — A2A interoperability
ALTER TABLE agents ADD COLUMN IF NOT EXISTS a2a_card_url            TEXT;
-- URL to the agent's A2A card (/.well-known/agent.json on the agent's host)

-- ACM Spec AgentRecord — permitted tools allowlist
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tools_permitted         JSONB NOT NULL DEFAULT '[]';
-- Expected shape: ["tool_id_1", "tool_id_2"]
-- Proxy MUST reject tool calls for tools not in this list (log as outcome: blocked)

-- Retention policy — REQUIRED field enforced at API layer
-- The API must reject registration if this is null or lacks minimum_retention_days
ALTER TABLE agents ADD COLUMN IF NOT EXISTS retention_policy        JSONB;
-- Required shape:
-- {
--   "minimum_retention_days": 1095,          -- 3 years default
--   "legal_basis_for_retention": "EU AI Act Art. 12 + GDPR Art. 30",
--   "deletion_scheduled_at": null            -- or ISO8601 date
-- }

-- Index for OAuth 2.1 client_id lookup (proxy hot path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_oauth_client_id
    ON agents(oauth_client_id)
    WHERE oauth_client_id IS NOT NULL;

-- Index for EU AI Act high-risk agent queries
CREATE INDEX IF NOT EXISTS idx_agents_eu_ai_act_risk_level
    ON agents(eu_ai_act_risk_level)
    WHERE eu_ai_act_risk_level IS NOT NULL;

-- /.well-known/acm/agents view — exposes ACM-spec field names
CREATE OR REPLACE VIEW acm_agent_records AS
SELECT
    id                          AS agent_id,
    name                        AS display_name,
    version,
    tenant_id,
    -- owner (resolved from tenants table in application layer)
    deployment_environment,
    deployment_region,
    data_residency,
    eu_ai_act_risk_level,
    processes_personal_data,
    automated_decision_making,
    tools_permitted,
    transfer_policies,
    retention_policy,
    a2a_card_url,
    oauth_client_id,
    oauth_issuer,
    oauth_scope,
    status,
    created_at,
    updated_at
FROM agents;
