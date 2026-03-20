-- Revert backfill: remove seal_id and review_id from payload (restore chain integrity).
-- Keeps correlation_id = SEAL-XXXXXXXX so search still works.
UPDATE evidence_events
SET payload = payload - 'seal_id' - 'review_id'
WHERE event_type IN ('DATA_TRANSFER_REVIEW', 'TRANSFER_EVALUATION_REVIEW')
  AND payload ? 'seal_id'
  AND correlation_id LIKE 'SEAL-%';
