-- Migration 025: system_settings table for enforcement_mode (shadow | enforce)
-- Persists across restarts. Default: shadow (pre-enforcement observation mode).

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Per-tenant settings will be seeded in migration 029 after tenants table exists
-- Do not seed here because tenant_id is required (added in migration 026)
