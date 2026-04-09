-- Idempotent demo tenant + enforcement + demo agent for POST /api/public/shield/evaluate.
-- Safe to run on every deploy (ON CONFLICT DO NOTHING throughout).
-- Schema: tenants use UUID id + api_key_hash (SHA-256 hex), not plain api_key columns.
--
-- Tenant API key (Bearer for /api/v1/* if needed): ss_test_demo_api_key_veridion_public_testing_only
-- Demo agent API key (injected by public route if omitted): ss_test_demo_agent_key_veridion_public

-- Demo tenant (fixed id — must match DEMO_TENANT_ID in src/routes_public_validator.rs)
INSERT INTO tenants (id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, trial_expires_at, rate_limit_per_minute)
VALUES (
  'a0000001-0000-4000-8000-00000000d3d0'::uuid,
  'Veridion Demo',
  'pro',
  'enforce',
  '74d37e75ced779c4482ee061228a77f084d974ee2c8552f2a79817b417e68a5e',
  'ss_test_demo_api_key',
  false,
  NULL,
  100
) ON CONFLICT (id) DO NOTHING;

-- Enforcement: enforce (not shadow — shadow returns ALLOW to the caller regardless of real decision)
INSERT INTO system_settings (key, value, tenant_id)
VALUES (
  'enforcement_mode',
  'enforce',
  'a0000001-0000-4000-8000-00000000d3d0'::uuid
)
ON CONFLICT (key, tenant_id) DO NOTHING;

-- Registered agent for evaluate (empty allowlists = policy does not block destinations/categories)
INSERT INTO agents (
  id, tenant_id, name, description, version,
  allowed_data_categories, allowed_destination_countries, allowed_partners,
  status, api_key_hash
)
VALUES (
  'agt_demo_public',
  'a0000001-0000-4000-8000-00000000d3d0'::uuid,
  'Veridion Demo Agent',
  'Pre-seeded public demo agent for landing and try-it flows.',
  '1.0.0',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'active',
  '1cb9e522e94e84f876fa92af4fbcfecd2e00641b23e9e4f0bc628833295fd8ec'
) ON CONFLICT (id) DO NOTHING;

-- No SCC rows — US (and other SCC-required destinations) yield real REVIEW until an SCC is registered.
-- Russia / Venezuela / etc. use static blocked list in src/shield.rs — no extra rows needed.
-- EU / adequate countries need no config — ALLOW from classification.
