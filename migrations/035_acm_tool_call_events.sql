-- Migration 035: ACM ToolCallEvent table
-- Implements: ACM Spec v0.1 ToolCallEvent record type
-- Regulatory mapping: EU AI Act Art. 12 (logging), GDPR data minimisation
--
-- This table is APPEND-ONLY. No UPDATE or DELETE should be issued by the application.
-- Integrity is enforced via a hash-chain: each record's event_hash covers its own
-- canonical fields, and prev_event_hash links it to the prior record for the same agent.
--
-- Differences from compliance_records (005):
--   - Proper FK to agents.id (VARCHAR(64))
--   - inputs/outputs JSONB with fields_requested / fields_returned
--   - context_trust_level (trusted/degraded/untrusted) — required field
--   - OTel trace_id + parent_span_id for delegation chain (v0.2 prep)
--   - Cryptographic hash-chain columns

CREATE TABLE IF NOT EXISTS tool_call_events (
    -- Identity
    event_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    session_id          UUID        NOT NULL,
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

    -- Tool call details
    tool_id             TEXT        NOT NULL,
    tool_version        TEXT,
    called_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Inputs (GDPR data minimisation: record what fields were requested)
    inputs              JSONB       NOT NULL DEFAULT '{"fields_requested": [], "data_subjects": []}',
    -- Expected shape: { "fields_requested": ["email", "dob"], "data_subjects": ["user:123"] }

    -- Outputs (what fields were returned — not the values themselves unless required)
    outputs             JSONB       NOT NULL DEFAULT '{"fields_returned": []}',
    -- Expected shape: { "fields_returned": ["email"] }

    -- Context trust (required — must be set by proxy from ContextTrustAnnotation)
    context_trust_level VARCHAR(20) NOT NULL CHECK (context_trust_level IN ('trusted', 'degraded', 'untrusted')),

    -- Outcome
    decision_made       BOOLEAN     NOT NULL DEFAULT false,
    human_review_required BOOLEAN   NOT NULL DEFAULT false,
    outcome_notes       TEXT,

    -- Legal basis (GDPR)
    legal_basis         TEXT,
    -- e.g. 'legitimate_interests', 'contract', 'legal_obligation', 'consent'
    purpose             TEXT,

    -- EU AI Act risk classification at time of call (denormalised from AgentRecord for immutability)
    eu_ai_act_risk_level VARCHAR(20),
    -- e.g. 'unacceptable', 'high', 'limited', 'minimal'

    -- OTel delegation chain (v0.2 prep — nullable, populated from W3C traceparent header)
    trace_id            UUID,
    parent_span_id      UUID,

    -- Append-only hash-chain integrity
    -- prev_event_hash: SHA-256 hex of the previous tool_call_event for this agent_id
    --   NULL for the first event of an agent (genesis record)
    prev_event_hash     VARCHAR(64),
    -- event_hash: SHA-256 hex of canonical fields for THIS record
    --   Computed by Rust API at write time before INSERT
    --   Canonical input: event_id || agent_id || session_id || tool_id || called_at || inputs || outputs || context_trust_level || decision_made
    event_hash          VARCHAR(64) NOT NULL,

    -- Reference links to related ACM records
    annotation_ref      UUID,   -- FK to context_trust_annotations.annotation_id (set if annotation exists for this session)
    oversight_record_ref UUID,  -- FK to human_oversight.id (set when human review triggered)

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NOTE: No updated_at — this table is append-only
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tool_call_events_agent_id
    ON tool_call_events(agent_id);

CREATE INDEX IF NOT EXISTS idx_tool_call_events_session_id
    ON tool_call_events(session_id);

CREATE INDEX IF NOT EXISTS idx_tool_call_events_tenant_id
    ON tool_call_events(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tool_call_events_called_at
    ON tool_call_events(called_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_call_events_human_review
    ON tool_call_events(human_review_required)
    WHERE human_review_required = true;

CREATE INDEX IF NOT EXISTS idx_tool_call_events_trace_id
    ON tool_call_events(trace_id)
    WHERE trace_id IS NOT NULL;

-- Prevent UPDATE and DELETE at the database level
-- (Belt-and-suspenders — the API layer must also enforce this)
CREATE OR REPLACE RULE tool_call_events_no_update AS
    ON UPDATE TO tool_call_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE tool_call_events_no_delete AS
    ON DELETE TO tool_call_events DO INSTEAD NOTHING;

-- /.well-known/acm/events view — exposes ACM-spec field names
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
    created_at
FROM tool_call_events;
