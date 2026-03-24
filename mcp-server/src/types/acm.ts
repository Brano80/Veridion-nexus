/**
 * ACM Spec v0.1 type definitions
 * Source: https://www.veridion-nexus.eu/spec
 *
 * These mirror the five ACM record types. Keep in sync with the spec.
 * All IDs are UUIDs (string). All timestamps are ISO 8601.
 */

// ── AgentRecord ──────────────────────────────────────────────────────────────

export interface AgentRecord {
  agent_id: string;
  display_name: string;
  version: string;
  tenant_id: string;
  oauth_client_id: string;
  oauth_issuer: string;
  oauth_scope: string;
  deployment_environment: string;
  deployment_region: string;
  data_residency: string;  // ISO 3166-1 alpha-2
  eu_ai_act_risk_level: 'unacceptable' | 'high' | 'limited' | 'minimal';
  processes_personal_data: boolean;
  automated_decision_making: boolean;
  tools_permitted: string[];
  transfer_policies: TransferPolicy[];
  retention_policy: RetentionPolicy;
  a2a_card_url?: string;
  status: string;
}

export interface TransferPolicy {
  destination: string;  // ISO 3166-1 alpha-2
  mechanism: TransferMechanism;
  scc_ref?: string;
  bcr_ref?: string;
  dpf_relied_upon?: boolean;
}

export type TransferMechanism =
  | 'adequacy'
  | 'scc'
  | 'bcr'
  | 'dpf'
  | 'derogation'
  | 'blocked';

export interface RetentionPolicy {
  minimum_retention_days: number;
  legal_basis_for_retention: string;
  deletion_scheduled_at?: string | null;
}

// ── ToolCallEvent ────────────────────────────────────────────────────────────

export interface ToolCallEventInput {
  agent_id: string;
  session_id: string;
  tenant_id: string;
  tool_id: string;
  tool_version?: string;
  called_at: string;               // ISO 8601
  inputs: ToolCallInputs;
  outputs: ToolCallOutputs;
  context_trust_level: TrustLevel;
  decision_made: boolean;
  human_review_required: boolean;
  outcome_notes?: string;
  legal_basis?: string;
  purpose?: string;
  eu_ai_act_risk_level?: string;
  // OTel delegation chain (v0.2 prep — from W3C traceparent header)
  trace_id?: string;
  parent_span_id?: string;
  // Links to related records
  annotation_ref?: string;
  oversight_record_ref?: string;
}

export interface ToolCallInputs {
  fields_requested: string[];      // field names, not values (data minimisation)
  data_subjects: string[];         // e.g. ['user:abc123']
}

export interface ToolCallOutputs {
  fields_returned: string[];       // field names, not values
}

// ── ContextTrustAnnotation ───────────────────────────────────────────────────

export type TrustLevel = 'trusted' | 'degraded' | 'untrusted';

export interface ContextTrustAnnotationInput {
  agent_id: string;
  session_id: string;
  tenant_id: string;
  trust_level: TrustLevel;
  sources_in_context: ContextSource[];
  degradation_trigger?: string;
  session_trust_persistent: true;  // always true in v0.1
  triggered_human_review: boolean;
  oversight_record_ref?: string;
}

export interface ContextSource {
  source: string;    // e.g. 'internal-crm', 'web-search-result'
  verified: boolean;
}

// ── DataTransferRecord ───────────────────────────────────────────────────────
// Implemented in Phase 2 — type stubs here for completeness

export interface DataTransferRecordInput {
  agent_id: string;
  event_ref: string;          // tool_call_events.event_id that triggered this transfer
  tenant_id: string;
  origin_country: string;     // ISO 3166-1 alpha-2, should be EEA
  destination_country: string;
  transfer_mechanism: TransferMechanism;
  data_categories: string[];  // GDPR Art. 9 categories
  dpf_relied_upon: boolean;
  transfer_timestamp: string;
}

// ── HumanOversightRecord ─────────────────────────────────────────────────────
// Implemented in Phase 2 — type stubs here for completeness

export type ReviewTrigger =
  | 'degraded_context_trust'
  | 'high_impact_decision'
  | 'anomaly_detected'
  | 'manual_request'
  | 'periodic_audit';

export interface HumanOversightRecordInput {
  agent_id: string;
  event_ref: string;           // tool_call_events.event_id that triggered review
  tenant_id: string;
  review_trigger: ReviewTrigger;
  flagged_at: string;          // ISO 8601
  reviewer_id?: string;
  reviewer_outcome?: 'approved' | 'rejected' | 'escalated' | 'pending';
  eu_ai_act_compliance?: boolean;
  notes?: string;
}

// ── API response types ───────────────────────────────────────────────────────

export interface AlApiResponse<T> {
  data: T;
  error?: string;
}

export interface CreatedRecord {
  id: string;
  created_at: string;
}
