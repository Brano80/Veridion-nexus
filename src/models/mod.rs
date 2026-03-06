use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ── Evidence Events ──

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EvidenceEventRow {
    pub event_id: String,
    pub correlation_id: String,
    pub causation_id: Option<String>,
    pub sequence_number: i64,
    pub occurred_at: DateTime<Utc>,
    pub recorded_at: DateTime<Utc>,
    pub event_type: String,
    pub severity: String,
    pub source_system: String,
    pub source_ip: Option<String>,
    pub source_user_agent: Option<String>,
    pub regulatory_tags: serde_json::Value,
    pub articles: serde_json::Value,
    pub payload: serde_json::Value,
    pub payload_hash: String,
    pub previous_hash: String,
    pub company_id: Option<Uuid>,
    pub nexus_seal: Option<String>,
    pub regulatory_framework: Option<String>,
    pub verification_status: Option<String>,
    pub last_verification: Option<DateTime<Utc>>,
    pub scope_snapshot_hash: Option<String>,
    pub processing_duration_ms: Option<i32>,
    pub retry_count: i32,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceEventResponse {
    pub id: String,
    pub event_id: String,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub sequence_number: i64,
    pub occurred_at: String,
    pub recorded_at: String,
    pub event_type: String,
    pub severity: String,
    pub source_system: String,
    pub source_ip: Option<String>,
    pub source_user_agent: Option<String>,
    pub regulatory_tags: Vec<String>,
    pub articles: Vec<String>,
    pub payload: serde_json::Value,
    pub payload_hash: String,
    pub previous_hash: String,
    pub nexus_seal: Option<String>,
    pub regulatory_framework: Option<String>,
    pub verification_status: Option<String>,
    pub last_verification: Option<String>,
    pub processing_duration_ms: Option<i32>,
    pub retry_count: Option<i32>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<EvidenceEventRow> for EvidenceEventResponse {
    fn from(r: EvidenceEventRow) -> Self {
        let tags: Vec<String> = serde_json::from_value(r.regulatory_tags.clone()).unwrap_or_default();
        let arts: Vec<String> = serde_json::from_value(r.articles.clone()).unwrap_or_default();
        Self {
            id: r.event_id.clone(),
            event_id: r.event_id,
            correlation_id: Some(r.correlation_id),
            causation_id: r.causation_id,
            sequence_number: r.sequence_number,
            occurred_at: r.occurred_at.to_rfc3339(),
            recorded_at: r.recorded_at.to_rfc3339(),
            event_type: r.event_type,
            severity: r.severity,
            source_system: r.source_system,
            source_ip: r.source_ip,
            source_user_agent: r.source_user_agent,
            regulatory_tags: tags,
            articles: arts,
            payload: r.payload,
            payload_hash: r.payload_hash,
            previous_hash: r.previous_hash,
            nexus_seal: r.nexus_seal,
            regulatory_framework: r.regulatory_framework,
            verification_status: r.verification_status,
            last_verification: r.last_verification.map(|t| t.to_rfc3339()),
            processing_duration_ms: r.processing_duration_ms,
            retry_count: Some(r.retry_count),
            error_message: r.error_message,
            created_at: r.created_at.to_rfc3339(),
            updated_at: r.updated_at.to_rfc3339(),
        }
    }
}

// ── Compliance Records + Human Oversight ──

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ComplianceRecordRow {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub agent_id: String,
    pub action_summary: String,
    pub seal_id: String,
    pub status: String,
    pub user_notified: Option<bool>,
    pub notification_timestamp: Option<DateTime<Utc>>,
    pub human_oversight_status: Option<String>,
    pub risk_level: Option<String>,
    pub user_id: Option<String>,
    pub tx_id: String,
    pub payload_hash: String,
    pub evidence_event_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct HumanOversightRow {
    pub id: Uuid,
    pub seal_id: String,
    pub status: String,
    pub reviewer_id: Option<String>,
    pub decided_at: Option<DateTime<Utc>>,
    pub comments: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItemResponse {
    pub id: String,
    pub created: String,
    pub agent_id: String,
    pub action: String,
    pub module: String,
    pub suggested_decision: String,
    pub context: serde_json::Value,
    pub status: String,
    pub evidence_id: String,
    pub decided_by: Option<String>,
    pub decision_reason: Option<String>,
    pub final_decision: Option<String>,
    pub decided_at: Option<String>,
    pub expires_at: Option<String>,
}

