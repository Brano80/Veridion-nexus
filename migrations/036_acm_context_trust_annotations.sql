-- Migration 036: ACM ContextTrustAnnotation table
-- Implements: ACM Spec v0.1 ContextTrustAnnotation record type
-- Regulatory mapping: EU AI Act Art. 14 (human oversight trigger condition)
--
-- Inspired by AgentLock v1.1 trust model. Key invariant:
--   Once a session is degraded or untrusted, it CANNOT recover to a higher trust level.
--   This is enforced by session_trust_persistent = true (always true in v0.1).
--
-- One annotation record is created per session. It is updated (trust level can only
-- go DOWN, never up) as the session progresses. When trust degrades, a new snapshot
-- row is appended (append-preferred) with the degradation details.
--
-- The proxy is responsible for:
--   1. Creating an annotation at session start (trusted by default)
--   2. Appending a new row when trust degrades (never updating the existing row)
--   3. Linking tool_call_events.annotation_ref to the latest annotation for the session

CREATE TABLE IF NOT EXISTS context_trust_annotations (
    -- Identity
    annotation_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id            VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    session_id          UUID        NOT NULL,
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

    -- Trust state at this point in the session
    trust_level         VARCHAR(20) NOT NULL CHECK (trust_level IN ('trusted', 'degraded', 'untrusted')),

    -- Sources present in context window at time of annotation
    -- Expected shape: [{ "source": "internal-crm", "verified": true }, { "source": "web-search", "verified": false }]
    sources_in_context  JSONB       NOT NULL DEFAULT '[]',

    -- What caused the trust level to degrade (null if this is the initial trusted annotation)
    degradation_trigger TEXT,
    -- e.g. 'external_web_source', 'unverified_tool_output', 'user_supplied_url'

    -- Spec invariant: once degraded, trust does not recover within session
    -- Always true in v0.1. Field exists for spec compatibility and future configurability.
    session_trust_persistent BOOLEAN NOT NULL DEFAULT true,

    -- Whether this annotation triggered a human review requirement
    triggered_human_review BOOLEAN NOT NULL DEFAULT false,
    oversight_record_ref   UUID,   -- FK to human_oversight.id if review was triggered

    annotated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NOTE: Append-only. Trust level can only decrease. Never update an existing row.
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_context_trust_annotations_agent_id
    ON context_trust_annotations(agent_id);

CREATE INDEX IF NOT EXISTS idx_context_trust_annotations_session_id
    ON context_trust_annotations(session_id);

CREATE INDEX IF NOT EXISTS idx_context_trust_annotations_tenant_id
    ON context_trust_annotations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_context_trust_annotations_trust_level
    ON context_trust_annotations(trust_level)
    WHERE trust_level IN ('degraded', 'untrusted');

CREATE INDEX IF NOT EXISTS idx_context_trust_annotations_annotated_at
    ON context_trust_annotations(annotated_at DESC);

-- Helper: get current (lowest) trust level for a session
-- Returns the most recent / lowest trust annotation for a given session_id
CREATE OR REPLACE VIEW acm_session_trust_summary AS
SELECT DISTINCT ON (session_id)
    annotation_id,
    agent_id,
    session_id,
    tenant_id,
    trust_level,
    sources_in_context,
    degradation_trigger,
    session_trust_persistent,
    triggered_human_review,
    oversight_record_ref,
    annotated_at
FROM context_trust_annotations
ORDER BY
    session_id,
    -- Lowest trust wins: untrusted < degraded < trusted
    CASE trust_level
        WHEN 'untrusted' THEN 0
        WHEN 'degraded'  THEN 1
        WHEN 'trusted'   THEN 2
    END ASC,
    annotated_at DESC;
