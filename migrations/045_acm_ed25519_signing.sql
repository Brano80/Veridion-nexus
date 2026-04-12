-- Migration 045: Ed25519 signatures for tool_call_events (Phase 3)
-- Nullable for existing rows; new inserts populate from API.

ALTER TABLE tool_call_events
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signing_key_id TEXT;

DROP VIEW IF EXISTS acm_tool_call_events;
CREATE OR REPLACE VIEW acm_tool_call_events AS
SELECT
    event_id,
    agent_id,
    session_id,
    tenant_id,
    tool_id,
    tool_version,
    called_at,
    inputs,
    outputs,
    context_trust_level                         AS "context_trust.level",
    decision_made                               AS "outcome.decision_made",
    human_review_required                       AS "outcome.human_review_required",
    outcome_notes,
    legal_basis,
    purpose,
    eu_ai_act_risk_level,
    trace_id,
    parent_span_id,
    prev_event_hash,
    event_hash,
    annotation_ref,
    oversight_record_ref,
    signature,
    signing_key_id,
    created_at
FROM tool_call_events;
