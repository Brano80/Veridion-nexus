-- Backfill Transfer — Review evidence rows so Evidence Vault search finds SEAL-XXXXXXXX.
-- Links correlation_id + payload.seal_id/review_id from compliance_records.
--
-- Run on server (reports row count in psql output, e.g. UPDATE 3):
--   ssh root@46.225.118.162 "docker exec -i veridion-postgres psql -U postgres -d veridion_api" < scripts/backfill_evidence_seal_correlation.sql
--
-- Or from repo on a machine with ssh:
--   Get-Content scripts\backfill_evidence_seal_correlation.sql -Raw | ssh root@46.225.118.162 "docker exec -i veridion-postgres psql -U postgres -d veridion_api"

UPDATE evidence_events ee
SET
  correlation_id = cr.seal_id,
  payload = payload || jsonb_build_object(
    'seal_id', cr.seal_id,
    'review_id', cr.seal_id
  )
FROM compliance_records cr
WHERE cr.evidence_event_id = ee.event_id
  AND ee.event_type IN ('DATA_TRANSFER_REVIEW', 'TRANSFER_EVALUATION_REVIEW')
  AND (ee.correlation_id IS NULL OR ee.correlation_id NOT LIKE 'SEAL-%');
