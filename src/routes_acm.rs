use actix_web::{web, HttpRequest, HttpResponse, get, post};
use serde::Deserialize;
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

// ── Configure ────────────────────────────────────────────────────────────────

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_agent_by_oauth_client_id)
       .service(create_tool_call_event)
       .service(create_trust_annotation)
       .service(get_session_trust_level);
}
