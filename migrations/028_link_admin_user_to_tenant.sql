-- Migration 028: Link admin user to admin tenant
-- Updates the admin user (username='admin') to be associated with the admin tenant (is_admin=true)

UPDATE users
SET company_id = (
    SELECT id FROM tenants WHERE is_admin = true LIMIT 1
)
WHERE username = 'admin' AND company_id IS NULL;
