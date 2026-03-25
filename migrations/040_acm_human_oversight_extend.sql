-- Migration 040: Extend human_oversight for ACM HumanOversightRecord
-- ACM-only rows may omit seal_id (nullable after this migration).

ALTER TABLE human_oversight ALTER COLUMN seal_id DROP NOT NULL;

ALTER TABLE human_oversight
    ADD COLUMN IF NOT EXISTS agent_id         UUID REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS event_ref        UUID REFERENCES tool_call_events(event_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS review_trigger   VARCHAR(40)
        CHECK (review_trigger IS NULL OR review_trigger IN (
            'degraded_context_trust',
            'high_impact_decision',
            'anomaly_detected',
            'manual_request',
            'periodic_audit'
        )),
    ADD COLUMN IF NOT EXISTS reviewer_outcome VARCHAR(20)
        CHECK (reviewer_outcome IS NULL OR reviewer_outcome IN ('approved', 'rejected', 'escalated', 'pending')),
    ADD COLUMN IF NOT EXISTS eu_ai_act_compliance BOOLEAN,
    ADD COLUMN IF NOT EXISTS flagged_at       TIMESTAMPTZ DEFAULT NOW();

UPDATE human_oversight
SET flagged_at = created_at
WHERE flagged_at IS NULL;

UPDATE human_oversight
SET reviewer_outcome =
    CASE status
        WHEN 'APPROVED' THEN 'approved'
        WHEN 'REJECTED' THEN 'rejected'
        WHEN 'PENDING'  THEN 'pending'
        ELSE 'pending'
    END
WHERE reviewer_outcome IS NULL;

CREATE INDEX IF NOT EXISTS idx_human_oversight_agent_id
    ON human_oversight(agent_id)
    WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_oversight_event_ref
    ON human_oversight(event_ref)
    WHERE event_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_oversight_review_trigger
    ON human_oversight(review_trigger)
    WHERE review_trigger IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_oversight_pending_acm
    ON human_oversight(reviewer_outcome, flagged_at DESC)
    WHERE reviewer_outcome = 'pending';

CREATE OR REPLACE VIEW acm_human_oversight_records AS
SELECT
    id                      AS oversight_record_id,
    agent_id,
    event_ref,
    tenant_id,
    review_trigger,
    flagged_at,
    reviewer_id,
    reviewer_outcome,
    decided_at              AS reviewed_at,
    eu_ai_act_compliance,
    comments                AS notes,
    status,
    seal_id                 AS compliance_record_seal_id,
    created_at,
    updated_at
FROM human_oversight;

CREATE OR REPLACE VIEW acm_oversight_pending AS
SELECT
    id                  AS oversight_record_id,
    agent_id,
    event_ref,
    tenant_id,
    review_trigger,
    flagged_at,
    comments            AS notes
FROM human_oversight
WHERE reviewer_outcome = 'pending'
   OR (reviewer_outcome IS NULL AND status = 'PENDING');
