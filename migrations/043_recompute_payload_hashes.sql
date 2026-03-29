-- Migration 043: Add hash_version to evidence_events
--
-- Background: payload_hash was computed with serde_json::to_string() which does
-- not guarantee key order.  After a JSONB round-trip through PostgreSQL the key
-- order can change, producing a different SHA-256 and a false TAMPERED status.
--
-- The Rust code now uses canonical_json() (sorted keys) for hashing.  Existing
-- rows still carry hashes computed with the old non-canonical serialisation and
-- must be recomputed via the admin endpoint POST /api/v1/admin/recompute-hashes.
--
-- hash_version tracks which hashing scheme a row uses:
--   1 = legacy (serde_json::to_string, non-deterministic key order)
--   2 = canonical (sorted keys, JSONB round-trip safe)

ALTER TABLE evidence_events
    ADD COLUMN IF NOT EXISTS hash_version INT NOT NULL DEFAULT 1;

-- New rows inserted after this migration use canonical hashing.
ALTER TABLE evidence_events
    ALTER COLUMN hash_version SET DEFAULT 2;
