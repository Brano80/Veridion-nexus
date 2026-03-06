-- Migration 027: Add FK constraint from users.company_id to tenants.id
-- Links user accounts to their tenant for multi-tenancy auth.

ALTER TABLE users
  ADD CONSTRAINT fk_users_tenant
  FOREIGN KEY (company_id) REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_users_company_id_fk
  ON users(company_id);
