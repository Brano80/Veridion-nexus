-- Migration 038: Public Compliance Registry fields on agents
-- Enables agents to opt-in to a public, cross-tenant registry for
-- EU AI Act Art. 12 compliance discovery by DPOs and compliance officers.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS public_registry_listed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS public_registry_description TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS public_registry_contact_email TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS public_registry_listed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agents_public_registry
    ON agents (public_registry_listed, status, eu_ai_act_risk_level)
    WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_agents_public_registry_search
    ON agents USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(provider_org, '')))
    WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active';
