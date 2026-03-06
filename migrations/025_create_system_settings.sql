-- Migration 025: system_settings table for enforcement_mode (shadow | enforce)
-- Persists across restarts. Default: shadow (pre-enforcement observation mode).

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed enforcement_mode = 'shadow' as default
INSERT INTO system_settings (key, value, updated_at)
VALUES ('enforcement_mode', 'shadow', NOW())
ON CONFLICT (key) DO NOTHING;
