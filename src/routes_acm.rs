use actix_web::{web, HttpRequest, HttpResponse, get, patch, post};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use sqlx::PgPool;
use uuid::Uuid;

fn verify_service_token(req: &HttpRequest) -> Result<(), HttpResponse> {
    let expected = std::env::var("AL_SERVICE_TOKEN").unwrap_or_default();
    if expected.is_empty() {
        if std::env::var("RUST_ENV").unwrap_or_else(|_| "development".into()) == "development" {
            return Ok(());
        }
        return Err(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "AL_SERVICE_TOKEN not configured"
        })));
    }

    let token = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");

    if token == expected {
        Ok(())
    } else {
        Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid service token"
        })))
    }
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

// ── GET /api/acm/agents?oauth_client_id={id} ────────────────────────────────

#[derive(Deserialize)]
pub struct AgentQuery {
    pub oauth_client_id: String,
}

#[get("/api/acm/agents")]
pub async fn get_agent_by_oauth_client_id(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    query: web::Query<AgentQuery>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let row: Option<serde_json::Value> = sqlx::query_scalar(
        r#"SELECT row_to_json(t) FROM (
            SELECT
                id AS agent_id,
                name AS display_name,
                version,
                tenant_id::text,
                oauth_client_id,
                oauth_issuer,
                COALESCE(oauth_scope, '') AS oauth_scope,
                COALESCE(deployment_environment, '') AS deployment_environment,
                COALESCE(deployment_region, '') AS deployment_region,
                COALESCE(data_residency, '') AS data_residency,
                COALESCE(eu_ai_act_risk_level, 'minimal') AS eu_ai_act_risk_level,
                COALESCE(processes_personal_data, false) AS processes_personal_data,
                COALESCE(automated_decision_making, false) AS automated_decision_making,
                COALESCE(tools_permitted, '[]'::jsonb) AS tools_permitted,
                COALESCE(transfer_policies, '[]'::jsonb) AS transfer_policies,
                retention_policy,
                a2a_card_url,
                status
            FROM agents
            WHERE oauth_client_id = $1
              AND deleted_at IS NULL
              AND status = 'active'
        ) t"#,
    )
    .bind(&query.oauth_client_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    match row {
        Some(agent) => HttpResponse::Ok().json(serde_json::json!({ "data": agent })),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Agent not found for oauth_client_id"
        })),
    }
}

// ── POST /api/acm/events ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateToolCallEventRequest {
    pub agent_id: String,
    pub session_id: String,
    pub tenant_id: String,
    pub tool_id: String,
    pub tool_version: Option<String>,
    pub called_at: String,
    pub inputs: serde_json::Value,
    pub outputs: serde_json::Value,
    pub context_trust_level: String,
    pub decision_made: bool,
    pub human_review_required: bool,
    pub outcome_notes: Option<String>,
    pub legal_basis: Option<String>,
    pub purpose: Option<String>,
    pub eu_ai_act_risk_level: Option<String>,
    pub trace_id: Option<String>,
    pub parent_span_id: Option<String>,
    pub annotation_ref: Option<String>,
    pub oversight_record_ref: Option<String>,
}

#[post("/api/acm/events")]
pub async fn create_tool_call_event(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateToolCallEventRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let event_id = Uuid::new_v4();
    let agent_uuid = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => {
            let agent_row: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM agents WHERE id::text = $1 OR oauth_client_id = $1"
            )
            .bind(&body.agent_id)
            .fetch_optional(pool.get_ref())
            .await
            .ok()
            .flatten();
            match agent_row {
                Some((id,)) => id,
                None => return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid agent_id"
                })),
            }
        }
    };

    let session_uuid = Uuid::parse_str(&body.session_id).unwrap_or_else(|_| Uuid::new_v4());
    let tenant_uuid = match Uuid::parse_str(&body.tenant_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid tenant_id"
        })),
    };

    let called_at = chrono::DateTime::parse_from_rfc3339(&body.called_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let trace_uuid = body.trace_id.as_deref().and_then(|s| Uuid::parse_str(s).ok());
    let parent_span_uuid = body.parent_span_id.as_deref().and_then(|s| Uuid::parse_str(s).ok());
    let annotation_uuid = body.annotation_ref.as_deref().and_then(|s| Uuid::parse_str(s).ok());
    let oversight_uuid = body.oversight_record_ref.as_deref().and_then(|s| Uuid::parse_str(s).ok());

    // Compute hash chain: get prev_event_hash for this agent
    let prev_hash: Option<String> = sqlx::query_scalar(
        "SELECT event_hash FROM tool_call_events WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(agent_uuid)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    // Compute event_hash: SHA-256 of canonical fields
    let canonical = format!(
        "{}{}{}{}{}{}{}{}{}",
        event_id,
        agent_uuid,
        session_uuid,
        body.tool_id,
        called_at.to_rfc3339(),
        serde_json::to_string(&body.inputs).unwrap_or_default(),
        serde_json::to_string(&body.outputs).unwrap_or_default(),
        body.context_trust_level,
        body.decision_made,
    );
    let event_hash = sha256_hex(&canonical);

    let result = sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
        r#"INSERT INTO tool_call_events (
            event_id, agent_id, session_id, tenant_id,
            tool_id, tool_version, called_at,
            inputs, outputs, context_trust_level,
            decision_made, human_review_required, outcome_notes,
            legal_basis, purpose, eu_ai_act_risk_level,
            trace_id, parent_span_id,
            prev_event_hash, event_hash,
            annotation_ref, oversight_record_ref
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18,
            $19, $20,
            $21, $22
        ) RETURNING created_at"#,
    )
    .bind(event_id)
    .bind(agent_uuid)
    .bind(session_uuid)
    .bind(tenant_uuid)
    .bind(&body.tool_id)
    .bind(&body.tool_version)
    .bind(called_at)
    .bind(&body.inputs)
    .bind(&body.outputs)
    .bind(&body.context_trust_level)
    .bind(body.decision_made)
    .bind(body.human_review_required)
    .bind(&body.outcome_notes)
    .bind(&body.legal_basis)
    .bind(&body.purpose)
    .bind(&body.eu_ai_act_risk_level)
    .bind(trace_uuid)
    .bind(parent_span_uuid)
    .bind(&prev_hash)
    .bind(&event_hash)
    .bind(annotation_uuid)
    .bind(oversight_uuid)
    .fetch_one(pool.get_ref())
    .await;

    match result {
        Ok(created_at) => HttpResponse::Created().json(serde_json::json!({
            "data": {
                "id": event_id.to_string(),
                "created_at": created_at.to_rfc3339(),
            }
        })),
        Err(e) => {
            log::error!("Failed to create tool_call_event: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create event: {}", e)
            }))
        }
    }
}

// ── POST /api/acm/trust-annotations ──────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateTrustAnnotationRequest {
    pub agent_id: String,
    pub session_id: String,
    pub tenant_id: String,
    pub trust_level: String,
    #[serde(default)]
    pub sources_in_context: serde_json::Value,
    pub degradation_trigger: Option<String>,
    #[serde(default = "default_true")]
    pub session_trust_persistent: bool,
    #[serde(default)]
    pub triggered_human_review: bool,
    pub oversight_record_ref: Option<String>,
}

fn default_true() -> bool { true }

#[post("/api/acm/trust-annotations")]
pub async fn create_trust_annotation(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateTrustAnnotationRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    // Validate trust_level
    if !["trusted", "degraded", "untrusted"].contains(&body.trust_level.as_str()) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "trust_level must be 'trusted', 'degraded', or 'untrusted'"
        }));
    }

    let annotation_id = Uuid::new_v4();
    let agent_uuid = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => {
            let row: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM agents WHERE id::text = $1 OR oauth_client_id = $1"
            )
            .bind(&body.agent_id)
            .fetch_optional(pool.get_ref())
            .await
            .ok()
            .flatten();
            match row {
                Some((id,)) => id,
                None => return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid agent_id"
                })),
            }
        }
    };
    let session_uuid = Uuid::parse_str(&body.session_id).unwrap_or_else(|_| Uuid::new_v4());
    let tenant_uuid = match Uuid::parse_str(&body.tenant_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid tenant_id"
        })),
    };
    let oversight_uuid = body.oversight_record_ref.as_deref().and_then(|s| Uuid::parse_str(s).ok());

    // Enforce monotonic degradation: check current trust level for this session
    let current_level: Option<String> = sqlx::query_scalar(
        r#"SELECT trust_level FROM context_trust_annotations
           WHERE session_id = $1
           ORDER BY annotated_at DESC LIMIT 1"#,
    )
    .bind(session_uuid)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    if let Some(current) = &current_level {
        let level_order = |l: &str| -> i32 {
            match l { "untrusted" => 0, "degraded" => 1, "trusted" => 2, _ => 2 }
        };
        if level_order(&body.trust_level) > level_order(current) {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Trust level can only degrade within a session (trusted → degraded → untrusted)"
            }));
        }
    }

    let sources = if body.sources_in_context.is_null() {
        serde_json::json!([])
    } else {
        body.sources_in_context.clone()
    };

    let result = sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
        r#"INSERT INTO context_trust_annotations (
            annotation_id, agent_id, session_id, tenant_id,
            trust_level, sources_in_context, degradation_trigger,
            session_trust_persistent, triggered_human_review, oversight_record_ref
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING created_at"#,
    )
    .bind(annotation_id)
    .bind(agent_uuid)
    .bind(session_uuid)
    .bind(tenant_uuid)
    .bind(&body.trust_level)
    .bind(&sources)
    .bind(&body.degradation_trigger)
    .bind(body.session_trust_persistent)
    .bind(body.triggered_human_review)
    .bind(oversight_uuid)
    .fetch_one(pool.get_ref())
    .await;

    match result {
        Ok(created_at) => HttpResponse::Created().json(serde_json::json!({
            "data": {
                "id": annotation_id.to_string(),
                "created_at": created_at.to_rfc3339(),
            }
        })),
        Err(e) => {
            log::error!("Failed to create trust annotation: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create annotation: {}", e)
            }))
        }
    }
}

// ── GET /api/acm/trust-annotations/session/{session_id}/current ──────────────

#[derive(Deserialize)]
pub struct SessionPath {
    pub session_id: String,
}

#[get("/api/acm/trust-annotations/session/{session_id}/current")]
pub async fn get_session_trust_level(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<SessionPath>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let session_uuid = match Uuid::parse_str(&path.session_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid session_id"
        })),
    };

    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT trust_level FROM context_trust_annotations
           WHERE session_id = $1
           ORDER BY
               CASE trust_level
                   WHEN 'untrusted' THEN 0
                   WHEN 'degraded'  THEN 1
                   WHEN 'trusted'   THEN 2
               END ASC,
               annotated_at DESC
           LIMIT 1"#,
    )
    .bind(session_uuid)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    match row {
        Some((trust_level,)) => HttpResponse::Ok().json(serde_json::json!({
            "data": { "trust_level": trust_level }
        })),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "No annotations found for session"
        })),
    }
}

// ── POST /api/acm/transfers ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateDataTransferRecordRequest {
    pub agent_id: String,
    pub event_ref: Option<String>,
    pub tenant_id: String,
    pub origin_country: String,
    pub destination_country: String,
    pub transfer_mechanism: String,
    pub data_categories: Option<serde_json::Value>,
    pub dpf_relied_upon: Option<bool>,
    pub scc_ref: Option<String>,
    pub bcr_ref: Option<String>,
    pub derogation_basis: Option<String>,
    pub backup_mechanism: Option<String>,
    pub transfer_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

#[post("/api/acm/transfers")]
pub async fn create_data_transfer_record(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateDataTransferRecordRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let agent_id = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid agent_id"})),
    };
    let tenant_id = match Uuid::parse_str(&body.tenant_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid tenant_id"})),
    };
    let event_ref = body
        .event_ref
        .as_deref()
        .and_then(|s| Uuid::parse_str(s).ok());

    let valid_mechanisms = [
        "adequacy",
        "scc",
        "bcr",
        "dpf",
        "derogation",
        "blocked",
    ];
    if !valid_mechanisms.contains(&body.transfer_mechanism.as_str()) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid transfer_mechanism",
            "valid": valid_mechanisms
        }));
    }

    let dpf_relied_upon = body.dpf_relied_upon.unwrap_or(false);
    let data_categories = body
        .data_categories
        .clone()
        .unwrap_or_else(|| serde_json::json!([]));
    let transfer_timestamp = body
        .transfer_timestamp
        .unwrap_or_else(chrono::Utc::now);

    let schrems_iii_risk = dpf_relied_upon
        && body.transfer_mechanism == "dpf"
        && body.backup_mechanism.is_none();

    let row: Result<(Uuid, bool, chrono::DateTime<chrono::Utc>), sqlx::Error> = sqlx::query_as(
        r#"
        INSERT INTO data_transfer_records (
            agent_id, event_ref, tenant_id,
            origin_country, destination_country, transfer_mechanism,
            data_categories, dpf_relied_upon, schrems_iii_risk,
            scc_ref, bcr_ref, derogation_basis, backup_mechanism,
            transfer_timestamp
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING transfer_id, schrems_iii_risk, created_at
        "#,
    )
    .bind(agent_id)
    .bind(event_ref)
    .bind(tenant_id)
    .bind(&body.origin_country)
    .bind(&body.destination_country)
    .bind(&body.transfer_mechanism)
    .bind(data_categories)
    .bind(dpf_relied_upon)
    .bind(schrems_iii_risk)
    .bind(&body.scc_ref)
    .bind(&body.bcr_ref)
    .bind(&body.derogation_basis)
    .bind(&body.backup_mechanism)
    .bind(transfer_timestamp)
    .fetch_one(pool.get_ref())
    .await;

    match row {
        Ok((transfer_id, schrems_iii_risk, created_at)) => HttpResponse::Created().json(serde_json::json!({
            "data": {
                "id": transfer_id.to_string(),
                "transfer_id": transfer_id.to_string(),
                "schrems_iii_risk": schrems_iii_risk,
                "created_at": created_at.to_rfc3339(),
            }
        })),
        Err(e) => {
            log::error!("create_data_transfer_record error: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "database error"}))
        }
    }
}

#[patch("/api/acm/transfers/schrems-iii-review")]
pub async fn schrems_iii_bulk_review(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let result = sqlx::query(
        r#"
        UPDATE data_transfer_records
        SET schrems_iii_risk = true
        WHERE transfer_mechanism = 'dpf'
          AND dpf_relied_upon = true
          AND backup_mechanism IS NULL
          AND schrems_iii_risk = false
        "#,
    )
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(r) => HttpResponse::Ok().json(serde_json::json!({
            "updated": r.rows_affected(),
            "message": "All DPF-reliant records without backup mechanism flagged as Schrems III risk"
        })),
        Err(e) => {
            log::error!("schrems_iii_bulk_review error: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "database error"}))
        }
    }
}

// ── POST /api/acm/oversight ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateOversightRecordRequest {
    pub agent_id: String,
    pub event_ref: Option<String>,
    pub tenant_id: String,
    pub review_trigger: String,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOversightOutcomeRequest {
    pub reviewer_outcome: String,
    pub reviewer_id: Option<String>,
    pub notes: Option<String>,
    pub eu_ai_act_compliance: Option<bool>,
}

#[post("/api/acm/oversight")]
pub async fn create_oversight_record(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateOversightRecordRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let agent_id = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid agent_id"})),
    };
    let tenant_id = match Uuid::parse_str(&body.tenant_id) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid tenant_id"})),
    };
    let event_ref = body
        .event_ref
        .as_deref()
        .and_then(|s| Uuid::parse_str(s).ok());

    let valid_triggers = [
        "degraded_context_trust",
        "high_impact_decision",
        "anomaly_detected",
        "manual_request",
        "periodic_audit",
    ];
    if !valid_triggers.contains(&body.review_trigger.as_str()) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid review_trigger",
            "valid": valid_triggers
        }));
    }

    let row: Result<(Uuid, Option<String>, Option<String>, Option<chrono::DateTime<chrono::Utc>>, chrono::DateTime<chrono::Utc>), sqlx::Error> = sqlx::query_as(
        r#"
        INSERT INTO human_oversight (
            agent_id, event_ref, tenant_id,
            review_trigger, reviewer_outcome,
            flagged_at, comments,
            status
        )
        VALUES ($1, $2, $3, $4, 'pending', NOW(), $5, 'PENDING')
        RETURNING id, review_trigger, reviewer_outcome, flagged_at, created_at
        "#,
    )
    .bind(agent_id)
    .bind(event_ref)
    .bind(tenant_id)
    .bind(&body.review_trigger)
    .bind(&body.notes)
    .fetch_one(pool.get_ref())
    .await;

    match row {
        Ok((id, review_trigger, reviewer_outcome, flagged_at, created_at)) => {
            if let Some(event_id) = event_ref {
                let _ = sqlx::query(
                    "UPDATE tool_call_events SET oversight_record_ref = $1 WHERE event_id = $2",
                )
                .bind(id)
                .bind(event_id)
                .execute(pool.get_ref())
                .await;
            }

            HttpResponse::Created().json(serde_json::json!({
                "data": {
                    "id": id.to_string(),
                    "oversight_record_id": id.to_string(),
                    "review_trigger": review_trigger,
                    "reviewer_outcome": reviewer_outcome,
                    "flagged_at": flagged_at.map(|t| t.to_rfc3339()),
                    "created_at": created_at.to_rfc3339(),
                }
            }))
        }
        Err(e) => {
            log::error!("create_oversight_record error: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "database error"}))
        }
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct OversightPendingRow {
    id: Uuid,
    agent_id: Option<Uuid>,
    event_ref: Option<Uuid>,
    tenant_id: Option<Uuid>,
    review_trigger: Option<String>,
    reviewer_outcome: Option<String>,
    flagged_at: Option<chrono::DateTime<chrono::Utc>>,
    decided_at: Option<chrono::DateTime<chrono::Utc>>,
    eu_ai_act_compliance: Option<bool>,
    comments: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[get("/api/acm/oversight/pending")]
pub async fn list_pending_oversight(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let tenant_id = query
        .get("tenant_id")
        .and_then(|s| Uuid::parse_str(s).ok());

    let rows = if let Some(tid) = tenant_id {
        sqlx::query_as::<_, OversightPendingRow>(
            r#"
            SELECT id, agent_id, event_ref, tenant_id,
                   review_trigger, reviewer_outcome,
                   flagged_at, decided_at, eu_ai_act_compliance,
                   comments, created_at
            FROM human_oversight
            WHERE (reviewer_outcome = 'pending' OR (reviewer_outcome IS NULL AND status = 'PENDING'))
              AND tenant_id = $1
            ORDER BY flagged_at ASC NULLS LAST
            LIMIT 100
            "#,
        )
        .bind(tid)
        .fetch_all(pool.get_ref())
        .await
    } else {
        sqlx::query_as::<_, OversightPendingRow>(
            r#"
            SELECT id, agent_id, event_ref, tenant_id,
                   review_trigger, reviewer_outcome,
                   flagged_at, decided_at, eu_ai_act_compliance,
                   comments, created_at
            FROM human_oversight
            WHERE reviewer_outcome = 'pending' OR (reviewer_outcome IS NULL AND status = 'PENDING')
            ORDER BY flagged_at ASC NULLS LAST
            LIMIT 100
            "#,
        )
        .fetch_all(pool.get_ref())
        .await
    };

    match rows {
        Ok(r) => HttpResponse::Ok().json(serde_json::json!({ "data": r })),
        Err(e) => {
            log::error!("list_pending_oversight error: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "database error"}))
        }
    }
}

#[patch("/api/acm/oversight/{id}")]
pub async fn update_oversight_outcome(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<String>,
    body: web::Json<UpdateOversightOutcomeRequest>,
) -> HttpResponse {
    if let Err(resp) = verify_service_token(&req) {
        return resp;
    }

    let oversight_id = match Uuid::parse_str(path.as_str()) {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid id"})),
    };

    let valid_outcomes = ["approved", "rejected", "escalated", "pending"];
    if !valid_outcomes.contains(&body.reviewer_outcome.as_str()) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid reviewer_outcome",
            "valid": valid_outcomes
        }));
    }

    let legacy_status = match body.reviewer_outcome.as_str() {
        "approved" => "APPROVED",
        "rejected" => "REJECTED",
        "escalated" => "PENDING",
        _ => "PENDING",
    };

    let result = sqlx::query(
        r#"
        UPDATE human_oversight
        SET reviewer_outcome    = $1,
            reviewer_id         = $2,
            decided_at          = NOW(),
            eu_ai_act_compliance = $3,
            comments             = COALESCE($4, comments),
            status               = $5,
            updated_at           = NOW()
        WHERE id = $6
        "#,
    )
    .bind(&body.reviewer_outcome)
    .bind(&body.reviewer_id)
    .bind(body.eu_ai_act_compliance)
    .bind(&body.notes)
    .bind(legacy_status)
    .bind(oversight_id)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => HttpResponse::NotFound().json(serde_json::json!({ "error": "oversight record not found" })),
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "updated": true,
            "outcome": body.reviewer_outcome,
        })),
        Err(e) => {
            log::error!("update_oversight_outcome error: {e}");
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "database error"}))
        }
    }
}

// ── Configure ────────────────────────────────────────────────────────────────

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_agent_by_oauth_client_id)
        .service(create_tool_call_event)
        .service(create_trust_annotation)
        .service(get_session_trust_level)
        .service(create_data_transfer_record)
        .service(schrems_iii_bulk_review)
        .service(create_oversight_record)
        .service(list_pending_oversight)
        .service(update_oversight_outcome);
}
