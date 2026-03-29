/**
 * ACM Spec v0.1 type definitions
 * Source: https://www.veridion-nexus.eu/spec
 *
 * These mirror the five ACM record types. Keep in sync with the spec.
 * All IDs are UUIDs (string). All timestamps are ISO 8601.
 */
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
    data_residency: string;
    eu_ai_act_risk_level: 'unacceptable' | 'high' | 'limited' | 'minimal';
    processes_personal_data: boolean;
    automated_decision_making: boolean;
    tools_permitted: string[];
    transfer_policies: TransferPolicy[];
    retention_policy: RetentionPolicy;
    a2a_card_url?: string;
    status: string;
    /** Per-agent PII hints; null/undefined = MCP proxy uses built-in defaults */
    pii_heuristics?: {
        arg_keys?: string[];
        tool_names?: string[];
    } | null;
}
export interface TransferPolicy {
    destination: string;
    mechanism: TransferMechanism;
    scc_ref?: string;
    bcr_ref?: string;
    dpf_relied_upon?: boolean;
}
export type TransferMechanism = 'adequacy' | 'scc' | 'bcr' | 'dpf' | 'derogation' | 'blocked';
export interface RetentionPolicy {
    minimum_retention_days: number;
    legal_basis_for_retention: string;
    deletion_scheduled_at?: string | null;
}
export interface ToolCallEventInput {
    agent_id: string;
    session_id: string;
    tenant_id: string;
    tool_id: string;
    tool_version?: string;
    called_at: string;
    inputs: ToolCallInputs;
    outputs: ToolCallOutputs;
    context_trust_level: TrustLevel;
    decision_made: boolean;
    human_review_required: boolean;
    outcome_notes?: string;
    legal_basis?: string;
    purpose?: string;
    eu_ai_act_risk_level?: string;
    trace_id?: string;
    parent_span_id?: string;
    annotation_ref?: string;
    oversight_record_ref?: string;
}
export interface ToolCallInputs {
    fields_requested: string[];
    data_subjects: string[];
}
export interface ToolCallOutputs {
    fields_returned: string[];
}
export type TrustLevel = 'trusted' | 'degraded' | 'untrusted';
export interface ContextTrustAnnotationInput {
    agent_id: string;
    session_id: string;
    tenant_id: string;
    trust_level: TrustLevel;
    sources_in_context: ContextSource[];
    degradation_trigger?: string;
    session_trust_persistent: true;
    triggered_human_review: boolean;
    oversight_record_ref?: string;
}
export interface ContextSource {
    source: string;
    verified: boolean;
}
export interface DataTransferRecordInput {
    agent_id: string;
    event_ref?: string;
    tenant_id: string;
    origin_country: string;
    destination_country: string;
    transfer_mechanism: TransferMechanism | string;
    data_categories?: string[];
    dpf_relied_upon?: boolean;
    scc_ref?: string;
    bcr_ref?: string;
    derogation_basis?: string;
    backup_mechanism?: string;
    transfer_timestamp?: string;
}
export type ReviewTrigger = 'degraded_context_trust' | 'high_impact_decision' | 'anomaly_detected' | 'manual_request' | 'periodic_audit';
export interface HumanOversightRecordInput {
    agent_id: string;
    event_ref?: string;
    tenant_id: string;
    review_trigger: ReviewTrigger;
    notes?: string;
}
export interface AlApiResponse<T> {
    data: T;
    error?: string;
}
export interface CreatedRecord {
    id: string;
    created_at: string;
}
