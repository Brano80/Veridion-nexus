-- Migration 029: Seed system_settings for admin tenant
-- Ensures admin tenant has enforcement_mode='shadow' on fresh start

INSERT INTO system_settings (key, value, tenant_id)
SELECT 
  'enforcement_mode',
  'shadow',
  id
FROM tenants 
WHERE is_admin = true
LIMIT 1
ON CONFLICT (key, tenant_id) DO NOTHING;
