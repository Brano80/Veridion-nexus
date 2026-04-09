use actix_web::{web, HttpRequest, HttpResponse, get, post, patch, delete};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::evidence::{self, CreateEventParams};
use crate::shield::{
    classify_country, country_name, Decision, TransferContext, all_country_classifications,
    evaluate_transfer_with_db,
};
use crate::review_queue;
use crate::tenant::{get_tenant_context, TenantContext};

/// Enforcement mode: shadow = observe only (return ALLOW, record real decision); enforce = block/review as policy.
pub async fn get_enforcement_mode(pool: &PgPool, tenant_id: uuid::Uuid) -> Result<String, String> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM system_settings WHERE tenant_id = $1 AND key = 'enforcement_mode'"
    )
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to get enforcement mode: {}", e))?;

    Ok(row.map(|r| r.0).unwrap_or_else(|| "shadow".to_string()))
}

#[derive(Deserialize)]
pub struct IngestLogEntry {
    #[serde(alias = "agentId", alias = "agent_id")]
    pub agent_id: Option<String>,
    #[serde(alias = "agentApiKey", alias = "agent_api_key")]
    pub agent_api_key: Option<String>,
    #[serde(alias = "sourceIp", alias = "source_ip")]
    pub source_ip: Option<String>,
    #[serde(alias = "destIp", alias = "dest_ip")]
    pub dest_ip: Option<String>,
    pub protocol: Option<String>,
    #[serde(alias = "dataSize", alias = "data_size")]
    pub data_size: Option<u64>,
    pub timestamp: Option<String>,
    #[serde(alias = "userAgent", alias = "user_agent")]
    pub user_agent: Option<String>,
    #[serde(alias = "requestPath", alias = "request_path")]
    pub request_path: Option<String>,
    #[serde(alias = "destinationCountryCode", alias = "destination_country_code")]
    pub destination_country_code: Option<String>,
    #[serde(alias = "destinationCountry", alias = "destination_country")]
    pub destination_country: Option<String>,
    #[serde(alias = "dataCategories", alias = "data_categories")]
    pub data_categories: Option<Vec<String>>,
    #[serde(alias = "partnerName", alias = "partner_name")]
    pub partner_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateRequest {
    #[serde(alias = "destination_country_code")]
    pub destination_country_code: Option<String>,
    #[serde(alias = "destination_country")]
    pub destination_country: Option<String>,
    #[serde(alias = "data_categories")]
    pub data_categories: Option<Vec<String>>,
    #[serde(alias = "partner_name")]
    pub partner_name: Option<String>,
    #[serde(alias = "source_ip")]
    pub source_ip: Option<String>,
    #[serde(alias = "dest_ip")]
    pub dest_ip: Option<String>,
    #[serde(alias = "data_size")]
    pub data_size: Option<u64>,
    pub protocol: Option<String>,
    #[serde(alias = "user_agent")]
    pub user_agent: Option<String>,
    #[serde(alias = "request_path")]
    pub request_path: Option<String>,
    #[serde(alias = "agent_id")]
    pub agent_id: Option<String>,
    #[serde(alias = "agent_api_key")]
    pub agent_api_key: Option<String>,
    #[serde(alias = "source_system")]
    pub source_system: Option<String>,
}

#[derive(sqlx::FromRow)]
struct AgentPolicyRow {
    id: String,
    name: String,
    allowed_data_categories: serde_json::Value,
    allowed_destination_countries: serde_json::Value,
    api_key_hash: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchSettingsRequest {
    pub enforcement_mode: Option<String>,
    pub confirmation_token: Option<String>,
}

#[get("/api/v1/settings")]
pub async fn get_settings(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let mode = match get_enforcement_mode(pool.get_ref(), tenant.tenant_id).await {
        Ok(m) => m,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "SETTINGS_FAILED",
                "message": e,
            }));
        }
    };
    let row: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
        "SELECT updated_at FROM system_settings WHERE tenant_id = $1 AND key = 'enforcement_mode'"
    )
    .bind(tenant.tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();
    let updated_at = row.map(|r| r.0.to_rfc3339()).unwrap_or_else(|| Utc::now().to_rfc3339());

    HttpResponse::Ok().json(serde_json::json!({
        "enforcement_mode": mode,
        "updated_at": updated_at,
    }))
}

#[patch("/api/v1/settings")]
pub async fn patch_settings(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<PatchSettingsRequest>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let new_mode = match &body.enforcement_mode {
        Some(m) if m.eq_ignore_ascii_case("shadow") => "shadow",
        Some(m) if m.eq_ignore_ascii_case("enforce") => "enforce",
        Some(_) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "INVALID_MODE",
                "message": "enforcement_mode must be 'shadow' or 'enforce'",
            }));
        }
        None => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "MISSING_MODE",
                "message": "enforcement_mode is required",
            }));
        }
    };

    let current = get_enforcement_mode(pool.get_ref(), tenant.tenant_id).await.unwrap_or_else(|_| "shadow".into());
    let current_lower = current.to_lowercase();

    // Safety gate: shadow → enforce requires confirmation token "ENABLE_ENFORCEMENT"
    if current_lower == "shadow" && new_mode == "enforce" {
        let token = body.confirmation_token.as_deref().unwrap_or("");
        if token != "ENABLE_ENFORCEMENT" {
            return HttpResponse::Forbidden().json(serde_json::json!({
                "error": "CONFIRMATION_REQUIRED",
                "message": "Switching to enforce mode requires confirmation: send confirmation_token 'ENABLE_ENFORCEMENT'",
            }));
        }
    }

    // Try UPDATE first, if no rows affected, INSERT
    let result = sqlx::query(
        "UPDATE system_settings SET value = $1, updated_at = NOW() WHERE tenant_id = $2 AND key = 'enforcement_mode'"
    )
    .bind(new_mode)
    .bind(tenant.tenant_id)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(res) if res.rows_affected() > 0 => {
            // Keep tenants.mode in sync for admin panel
            let _ = sqlx::query("UPDATE tenants SET mode = $1, updated_at = NOW() WHERE id = $2")
                .bind(new_mode)
                .bind(tenant.tenant_id)
                .execute(pool.get_ref())
                .await;
            HttpResponse::Ok().json(serde_json::json!({
                "enforcement_mode": new_mode,
                "updated_at": Utc::now().to_rfc3339(),
            }))
        }
        Ok(_) => {
            // No existing row, INSERT instead
            let insert_result = sqlx::query(
                "INSERT INTO system_settings (tenant_id, key, value, updated_at) VALUES ($1, 'enforcement_mode', $2, NOW())"
            )
            .bind(tenant.tenant_id)
            .bind(new_mode)
            .execute(pool.get_ref())
            .await;

            match insert_result {
                Ok(_) => {
                    // Keep tenants.mode in sync for admin panel
                    let _ = sqlx::query("UPDATE tenants SET mode = $1, updated_at = NOW() WHERE id = $2")
                        .bind(new_mode)
                        .bind(tenant.tenant_id)
                        .execute(pool.get_ref())
                        .await;
                    HttpResponse::Ok().json(serde_json::json!({
                        "enforcement_mode": new_mode,
                        "updated_at": Utc::now().to_rfc3339(),
                    }))
                }
                Err(e) => {
                    HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "UPDATE_FAILED",
                        "message": format!("Failed to update settings: {}", e),
                    }))
                }
            }
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "UPDATE_FAILED",
                "message": format!("Failed to update settings: {}", e),
            }))
        }
    }
}

/// Shared evaluate implementation for `/api/v1/shield/evaluate` and `POST /api/public/shield/evaluate`.
pub async fn evaluate_with_tenant_context(
    pool: &PgPool,
    tenant: &TenantContext,
    body: EvaluateRequest,
) -> HttpResponse {
    // Require agent registration for all evaluate calls
    let has_agent_id = body.agent_id.as_ref().map_or(false, |s| !s.trim().is_empty());
    let has_agent_key = body.agent_api_key.as_ref().map_or(false, |s| !s.trim().is_empty());
    if !has_agent_id || !has_agent_key {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "AGENT_REQUIRED",
            "message": "All transfers must originate from a registered agent. Register your agent at app.veridion-nexus.eu/agents",
        }));
    }

    // Agent policy enforcement
    let unregistered_agent = body.agent_id.is_none();
    let mut resolved_source_system: Option<String> = body.source_system.clone();
    if let Some(ref agent_id) = body.agent_id {
        let agent_row: Option<AgentPolicyRow> = sqlx::query_as(
            "SELECT id, name, allowed_data_categories, allowed_destination_countries, api_key_hash FROM agents WHERE id = $1 AND tenant_id = $2 AND status = 'active' AND deleted_at IS NULL"
        )
        .bind(agent_id)
        .bind(tenant.tenant_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

        match agent_row {
            None => {
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "AGENT_NOT_REGISTERED",
                    "message": "Agent not registered. Register this agent at app.veridion-nexus.eu/agents",
                }));
            }
            Some(ref agent) => {
                resolved_source_system = Some(agent.name.clone());
                let is_shadow = get_enforcement_mode(pool, tenant.tenant_id).await
                    .map(|m| m == "shadow")
                    .unwrap_or(true);
                // Validate agent API key if the agent has one set
                if agent.api_key_hash.is_some() {
                    match &body.agent_api_key {
                        None => {
                            return HttpResponse::Unauthorized().json(serde_json::json!({
                                "error": "AGENT_KEY_REQUIRED",
                                "message": "Agent API key required for registered agents",
                            }));
                        }
                        Some(provided_key) => {
                            let provided_hash = {
                                use sha2::{Sha256, Digest};
                                let mut hasher = Sha256::new();
                                hasher.update(provided_key.as_bytes());
                                format!("{:x}", hasher.finalize())
                            };
                            if Some(&provided_hash) != agent.api_key_hash.as_ref() {
                                return HttpResponse::Unauthorized().json(serde_json::json!({
                                    "error": "AGENT_KEY_INVALID",
                                    "message": "Agent API key does not match registered agent",
                                }));
                            }
                        }
                    }
                }
                let dest_code = body.destination_country_code.clone().unwrap_or_default().to_uppercase();
                let allowed_countries: Vec<String> = serde_json::from_value(agent.allowed_destination_countries.clone()).unwrap_or_default();
                // SCC-required destinations are evaluated by shield (SCC registry / REVIEW), not the agent destination allowlist — only globally blocked countries should hard-block here.
                let skip_dest_allowlist =
                    !dest_code.is_empty() && classify_country(&dest_code) == "scc_required";
                if !skip_dest_allowlist
                    && !dest_code.is_empty()
                    && !allowed_countries.is_empty()
                    && !allowed_countries.iter().any(|c| c.eq_ignore_ascii_case(&dest_code))
                {
                    let dest_name = if dest_code.is_empty() { "Unknown".to_string() } else { country_name(&dest_code) };
                    let mut violation_payload = serde_json::json!({
                        "agent_id": agent_id,
                        "violation": "destination_country",
                        "destination_country_code": dest_code,
                        "destination_country": dest_name,
                        "partner_name": body.partner_name,
                        "data_categories": body.data_categories,
                        "decision": "BLOCK",
                        "country_status": "agent_policy_violation",
                        "reason": "Destination country not in agent policy",
                    });
                    if is_shadow {
                        violation_payload["shadow_mode"] = serde_json::json!(true);
                    }
                    let params = CreateEventParams {
                        event_type: "AGENT_POLICY_VIOLATION".into(),
                        severity: "HIGH".into(),
                        source_system: agent.name.clone(),
                        regulatory_tags: vec!["GDPR".into()],
                        articles: vec![],
                        payload: violation_payload,
                        correlation_id: Some(Uuid::new_v4().to_string()),
                        causation_id: None,
                        source_ip: body.source_ip.clone(),
                        source_user_agent: body.user_agent.clone(),
                        tenant_id: tenant.tenant_id,
                    };
                    if let Err(e) = evidence::create_event(pool, params).await {
                        log::error!("Failed to create AGENT_POLICY_VIOLATION evidence (destination_country): {}", e);
                    }
                    if is_shadow {
                        return HttpResponse::Ok().json(serde_json::json!({
                            "decision": "ALLOW",
                            "reason": format!("SHADOW MODE — would have been BLOCK: {}", "Destination country not in agent policy"),
                            "severity": "HIGH",
                            "articles": [],
                            "country_status": "agent_policy_violation",
                            "timestamp": Utc::now().to_rfc3339(),
                        }));
                    }
                    return HttpResponse::Ok().json(serde_json::json!({
                        "decision": "BLOCK",
                        "reason": "Destination country not in agent policy",
                        "severity": "HIGH",
                        "articles": [],
                        "country_status": "agent_policy_violation",
                        "timestamp": Utc::now().to_rfc3339(),
                    }));
                }

                let allowed_categories: Vec<String> = serde_json::from_value(agent.allowed_data_categories.clone()).unwrap_or_default();
                if !allowed_categories.is_empty() {
                    if let Some(ref cats) = body.data_categories {
                        let violation: Vec<&String> = cats.iter().filter(|c| !allowed_categories.iter().any(|ac| ac.eq_ignore_ascii_case(c))).collect();
                        if !violation.is_empty() {
                            let mut violation_payload = serde_json::json!({
                                "agent_id": agent_id,
                                "violation": "data_categories",
                                "disallowed_categories": violation,
                                "destination_country_code": body.destination_country_code,
                                "destination_country": body.destination_country,
                                "partner_name": body.partner_name,
                                "data_categories": body.data_categories,
                                "decision": "BLOCK",
                                "country_status": "agent_policy_violation",
                                "reason": "Data category not permitted by agent policy",
                            });
                            if is_shadow {
                                violation_payload["shadow_mode"] = serde_json::json!(true);
                            }
                            let params = CreateEventParams {
                                event_type: "AGENT_POLICY_VIOLATION".into(),
                                severity: "HIGH".into(),
                                source_system: agent.name.clone(),
                                regulatory_tags: vec!["GDPR".into()],
                                articles: vec![],
                                payload: violation_payload,
                                correlation_id: Some(Uuid::new_v4().to_string()),
                                causation_id: None,
                                source_ip: body.source_ip.clone(),
                                source_user_agent: body.user_agent.clone(),
                                tenant_id: tenant.tenant_id,
                            };
                            if let Err(e) = evidence::create_event(pool, params).await {
                                log::error!("Failed to create AGENT_POLICY_VIOLATION evidence (data_categories): {}", e);
                            }
                            if is_shadow {
                                return HttpResponse::Ok().json(serde_json::json!({
                                    "decision": "ALLOW",
                                    "reason": format!("SHADOW MODE — would have been BLOCK: {}", "Data category not permitted by agent policy"),
                                    "severity": "HIGH",
                                    "articles": [],
                                    "country_status": "agent_policy_violation",
                                    "timestamp": Utc::now().to_rfc3339(),
                                }));
                            }
                            return HttpResponse::Ok().json(serde_json::json!({
                                "decision": "BLOCK",
                                "reason": "Data category not permitted by agent policy",
                                "severity": "HIGH",
                                "articles": [],
                                "country_status": "agent_policy_violation",
                                "timestamp": Utc::now().to_rfc3339(),
                            }));
                        }
                    }
                }

                // `allowed_partners` does not apply to SCC-required destinations — partner/SCC posture is decided by shield + SCC registry (REVIEW / ALLOW), not the agent allowlist.
            }
        }
    }

    let ctx = TransferContext {
        destination_country_code: body.destination_country_code.clone(),
        destination_country: body.destination_country.clone(),
        data_categories: body.data_categories.clone(),
        partner_name: body.partner_name.clone(),
        source_ip: body.source_ip.clone(),
        dest_ip: body.dest_ip.clone(),
        data_size: body.data_size,
        protocol: body.protocol.clone(),
        user_agent: body.user_agent.clone(),
        request_path: body.request_path.clone(),
    };

    let decision = match evaluate_transfer_with_db(pool, &ctx).await {
        Ok(d) => d,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "EVALUATION_FAILED",
                "message": e,
            }));
        }
    };
    let dest_code = ctx.destination_country_code.clone().unwrap_or_default();
    let dest_name = if dest_code.is_empty() {
        ctx.destination_country.clone().unwrap_or("Unknown".into())
    } else {
        country_name(&dest_code)
    };

    let correlation_id = Uuid::new_v4().to_string();

    let enforcement_mode = get_enforcement_mode(pool, tenant.tenant_id).await.unwrap_or_else(|_| "shadow".into());
    let is_shadow = enforcement_mode.eq_ignore_ascii_case("shadow");

    // Build payload with shadow_mode flag if in shadow mode
    let mut payload = serde_json::json!({
        "destination_country": dest_name,
        "destination_country_code": dest_code,
        "country_status": decision.country_status,
        "decision": decision.decision.to_string(),
        "reason": decision.reason,
        "data_categories": ctx.data_categories,
        "data_size": ctx.data_size,
        "source_ip": ctx.source_ip,
        "dest_ip": ctx.dest_ip,
        "protocol": ctx.protocol,
        "user_agent": ctx.user_agent,
        "request_path": ctx.request_path,
        "partner_name": ctx.partner_name,
    });
    
    if is_shadow {
        payload["shadow_mode"] = serde_json::json!(true);
    }
    if unregistered_agent {
        payload["unregistered_agent"] = serde_json::json!(true);
    }
    if let Some(ref aid) = body.agent_id {
        payload["agent_id"] = serde_json::json!(aid);
    }

    let event_type = decision.event_type.clone();
    let create_review = decision.decision == Decision::REVIEW;
    
    let (response_decision, response_reason) = if is_shadow {
        (Decision::ALLOW, format!("SHADOW MODE — would have been {}: {}", decision.decision.to_string(), decision.reason))
    } else {
        (decision.decision.clone(), decision.reason.clone())
    };

    let source_system_for_event: String = resolved_source_system.unwrap_or_else(|| "sovereign-shield".into());
    if body.agent_id.is_some() {
        log::info!("Evidence event source_system (agent_id provided): {}", source_system_for_event);
    }
    let params = CreateEventParams {
        event_type: event_type.clone(),
        severity: decision.severity.clone(),
        source_system: source_system_for_event,
        regulatory_tags: vec!["GDPR".into()],
        articles: decision.articles.clone(),
        payload: payload.clone(),
        correlation_id: Some(correlation_id.clone()),
        causation_id: None,
        source_ip: ctx.source_ip.clone(),
        source_user_agent: ctx.user_agent.clone(),
        tenant_id: tenant.tenant_id,
    };

    let (event_id, review_id) = match evidence::create_event(pool, params).await {
        Ok(event_row) => {
            let review_id = if create_review {
                let action = format!("transfer_data_to_{}", dest_code.to_lowercase());
                match review_queue::create_review(
                    pool,
                    "sovereign-shield",
                    &action,
                    "sovereign-shield",
                    &serde_json::json!({
                        "destination": dest_name,
                        "destination_country": dest_name,
                        "destination_country_code": dest_code,
                        "partner_name": ctx.partner_name.clone().unwrap_or_default(),
                        "data_categories": ctx.data_categories,
                        "reason": decision.reason,
                    }),
                    &event_row.event_id,
                    tenant.tenant_id,
                ).await {
                    Ok(seal_id) => {
                        match evidence::attach_review_seal_to_event(
                            pool,
                            tenant.tenant_id,
                            &event_row.event_id,
                            &seal_id,
                        )
                        .await
                        {
                            Ok(_) => log::info!(
                                "attach_review_seal: OK for event {} seal {}",
                                event_row.event_id,
                                seal_id
                            ),
                            Err(e) => log::error!(
                                "attach_review_seal: FAILED for event {} seal {} err {}",
                                event_row.event_id,
                                seal_id,
                                e
                            ),
                        }
                        Some(seal_id)
                    }
                    Err(e) => {
                        log::error!("Failed to create review for event {}: {}", event_row.event_id, e);
                        None
                    }
                }
            } else {
                None
            };
            (Some(event_row.event_id), review_id)
        }
        Err(e) => {
            log::error!("Failed to create evidence event: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "EVIDENCE_CREATION_FAILED",
                "message": format!("Failed to create evidence: {}", e),
            }));
        }
    };

    HttpResponse::Ok().json(serde_json::json!({
        "decision": response_decision.to_string(),
        "reason": response_reason,
        "severity": decision.severity,
        "articles": decision.articles,
        "country_status": decision.country_status,
        "evidence_id": event_id,
        "review_id": review_id,
        "timestamp": Utc::now().to_rfc3339(),
    }))
}

#[post("/api/v1/shield/evaluate")]
pub async fn evaluate(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<EvaluateRequest>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    evaluate_with_tenant_context(pool.get_ref(), &tenant, body.into_inner()).await
}

#[post("/api/v1/shield/ingest-logs")]
pub async fn ingest_logs(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<Vec<IngestLogEntry>>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    // Require agent registration for all ingest-logs entries
    let entries = body.into_inner();
    let missing_agent = entries.iter().any(|e| {
        e.agent_id.as_ref().map_or(true, |s| s.trim().is_empty())
            || e.agent_api_key.as_ref().map_or(true, |s| s.trim().is_empty())
    });
    if missing_agent {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "AGENT_REQUIRED",
            "message": "All transfers must originate from a registered agent. Register your agent at app.veridion-nexus.eu/agents",
        }));
    }

    let mut processed = 0u64;
    let enforcement_mode = get_enforcement_mode(pool.get_ref(), tenant.tenant_id).await.unwrap_or_else(|_| "shadow".into());
    let is_shadow = enforcement_mode.eq_ignore_ascii_case("shadow");

    for entry in entries {
        let ctx = TransferContext {
            destination_country_code: entry.destination_country_code.clone(),
            destination_country: entry.destination_country.clone(),
            data_categories: entry.data_categories.clone(),
            partner_name: entry.partner_name.clone(),
            source_ip: entry.source_ip.clone(),
            dest_ip: entry.dest_ip.clone(),
            data_size: entry.data_size,
            protocol: entry.protocol.clone(),
            user_agent: entry.user_agent.clone(),
            request_path: entry.request_path.clone(),
        };

        let decision = match evaluate_transfer_with_db(pool.get_ref(), &ctx).await {
            Ok(d) => d,
            Err(e) => {
                log::error!("Ingest evaluation failed for entry: {}", e);
                continue;
            }
        };
        let dest_code = ctx.destination_country_code.clone().unwrap_or_default();
        let dest_name = if dest_code.is_empty() {
            ctx.destination_country.clone().unwrap_or("Unknown".into())
        } else {
            country_name(&dest_code)
        };

        let correlation_id = Uuid::new_v4().to_string();

        // Build payload with shadow_mode flag if in shadow mode
        let mut payload = serde_json::json!({
            "destination_country": dest_name,
            "destination_country_code": dest_code,
            "country_status": decision.country_status,
            "decision": decision.decision.to_string(),
            "reason": decision.reason,
            "data_categories": ctx.data_categories,
            "data_size": ctx.data_size,
            "source_ip": ctx.source_ip,
            "dest_ip": ctx.dest_ip,
            "protocol": ctx.protocol,
            "user_agent": ctx.user_agent,
            "request_path": ctx.request_path,
            "partner_name": ctx.partner_name,
        });
        
        if is_shadow {
            payload["shadow_mode"] = serde_json::json!(true);
        }

        // Use real event type and decision - shadow mode only affects API response, not evidence
        let event_type = decision.event_type.clone();
        let create_review = decision.decision == Decision::REVIEW;

        let params = CreateEventParams {
            event_type,
            severity: decision.severity.clone(),
            source_system: "sovereign-shield".into(),
            regulatory_tags: vec!["GDPR".into()],
            articles: decision.articles.clone(),
            payload,
            correlation_id: Some(correlation_id.clone()),
            causation_id: None,
            source_ip: ctx.source_ip.clone(),
            source_user_agent: ctx.user_agent.clone(),
            tenant_id: tenant.tenant_id,
        };

        match evidence::create_event(pool.get_ref(), params).await {
            Ok(event_row) => {
                if create_review {
                    let action = format!("transfer_data_to_{}", dest_code.to_lowercase());
                    match review_queue::create_review(
                        pool.get_ref(),
                        "sovereign-shield",
                        &action,
                        "sovereign-shield",
                        &serde_json::json!({
                            "destination": dest_name,
                            "destination_country": dest_name,
                            "destination_country_code": dest_code,
                            "partner_name": ctx.partner_name.clone().unwrap_or_default(),
                            "data_categories": ctx.data_categories,
                            "reason": decision.reason,
                        }),
                        &event_row.event_id,
                        tenant.tenant_id,
                    )
                    .await
                    {
                        Ok(seal_id) => {
                            match evidence::attach_review_seal_to_event(
                                pool.get_ref(),
                                tenant.tenant_id,
                                &event_row.event_id,
                                &seal_id,
                            )
                            .await
                            {
                                Ok(_) => log::info!(
                                    "attach_review_seal: OK for event {} seal {}",
                                    event_row.event_id,
                                    seal_id
                                ),
                                Err(e) => log::error!(
                                    "attach_review_seal: FAILED for event {} seal {} err {}",
                                    event_row.event_id,
                                    seal_id,
                                    e
                                ),
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to create review for event {}: {}", event_row.event_id, e);
                        }
                    }
                }
                processed += 1;
            }
            Err(e) => {
                log::error!("Failed to create evidence event: {}", e);
            }
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "processed": processed,
        "timestamp": Utc::now().to_rfc3339(),
    }))
}

#[get("/api/v1/lenses/sovereign-shield/stats")]
pub async fn shield_stats(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let total_transfers: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield'"
    )
    .bind(tenant.tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let blocked_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield' AND event_type = 'DATA_TRANSFER_BLOCKED' AND created_at >= CURRENT_DATE"
    )
    .bind(tenant.tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let pending_reviews: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM human_oversight WHERE tenant_id = $1 AND status = 'PENDING'"
    )
    .bind(tenant.tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let active_agents: Option<i64> = sqlx::query_scalar(
        r#"SELECT COUNT(DISTINCT payload->>'partner_name') 
           FROM evidence_events 
           WHERE tenant_id = $1
           AND source_system = 'sovereign-shield' 
           AND created_at >= NOW() - INTERVAL '24 hours'
           AND payload ? 'partner_name'
           AND payload->>'partner_name' != ''
           AND payload->>'partner_name' != 'TestPartner'"#
    )
    .bind(tenant.tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .ok()
    .flatten();
    let active_agents = active_agents.unwrap_or(0);

    #[derive(sqlx::FromRow)]
    struct AttentionRow {
        destination_country_code: Option<String>,
        decision: Option<String>,
        occurrence_count: Option<i64>,
        first_seen: Option<chrono::DateTime<chrono::Utc>>,
        last_seen: Option<chrono::DateTime<chrono::Utc>>,
        event_id: Option<String>,
        system_name: Option<String>,
    }

    let attention_rows: Vec<AttentionRow> = sqlx::query_as(
        r#"SELECT
            payload->>'destination_country_code' as destination_country_code,
            payload->>'decision' as decision,
            COUNT(*) as occurrence_count,
            MIN(created_at) as first_seen,
            MAX(created_at) as last_seen,
            MIN(event_id) as event_id,
            MIN(payload->>'source_ip') as system_name
        FROM evidence_events
        WHERE tenant_id = $1
          AND source_system = 'sovereign-shield'
          AND event_type IN ('DATA_TRANSFER_BLOCKED', 'DATA_TRANSFER_REVIEW')
        GROUP BY payload->>'destination_country_code', payload->>'decision'
        ORDER BY COUNT(*) DESC
        LIMIT 20"#
    )
    .bind(tenant.tenant_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let requires_attention: Vec<serde_json::Value> = attention_rows.iter().map(|r| {
        let code = r.destination_country_code.clone().unwrap_or_default();
        serde_json::json!({
            "eventId": r.event_id,
            "destinationCountry": country_name(&code),
            "destinationCountryCode": code,
            "systemName": r.system_name.clone().unwrap_or("unknown".into()),
            "occurrenceCount": r.occurrence_count.unwrap_or(0),
            "firstSeen": r.first_seen.map(|t| t.to_rfc3339()),
            "lastSeen": r.last_seen.map(|t| t.to_rfc3339()),
            "decision": r.decision,
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "totalTransfers": total_transfers,
        "activeAdequateCount": 13,
        "totalAdequateWhitelistCount": 15,
        "sccCoverage": {
            "percentage": 0,
            "trend": 0,
            "covered": 0,
            "total": 6
        },
        "blockedToday": blocked_today,
        "pendingApprovals": pending_reviews,
        "expiringSccs": 0,
        "dataVolumeToday": 0,
        "highRiskDestinations": 0,
        "activeAgents": active_agents,
        "requiresAttention": requires_attention,
    }))
}

#[get("/api/v1/lenses/sovereign-shield/countries")]
pub async fn shield_countries(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let mut countries = all_country_classifications();

    #[derive(sqlx::FromRow)]
    struct CountryTransferCount {
        country_code: Option<String>,
        transfer_count: Option<i64>,
    }

    let counts: Vec<CountryTransferCount> = sqlx::query_as(
        r#"SELECT
            payload->>'destination_country_code' as country_code,
            COUNT(*) as transfer_count
        FROM evidence_events
        WHERE tenant_id = $1
          AND source_system = 'sovereign-shield'
          AND payload->>'destination_country_code' IS NOT NULL
        GROUP BY payload->>'destination_country_code'"#
    )
    .bind(tenant.tenant_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    for country in &mut countries {
        let code = country.get("code").and_then(|v| v.as_str()).unwrap_or("");
        let transfer_count = counts.iter()
            .find(|c| c.country_code.as_deref() == Some(code))
            .and_then(|c| c.transfer_count)
            .unwrap_or(0);
        country.as_object_mut().map(|obj| {
            obj.insert("transfers".into(), serde_json::json!(transfer_count));
            obj.insert("mechanisms".into(), serde_json::json!(0));
        });
    }

    HttpResponse::Ok().json(countries)
}

#[get("/api/v1/lenses/sovereign-shield/requires-attention")]
pub async fn shield_requires_attention(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    #[derive(sqlx::FromRow)]
    struct Row {
        destination_country_code: Option<String>,
        decision: Option<String>,
        occurrence_count: Option<i64>,
        first_seen: Option<chrono::DateTime<chrono::Utc>>,
        last_seen: Option<chrono::DateTime<chrono::Utc>>,
        event_id: Option<String>,
        system_name: Option<String>,
    }

    let rows: Vec<Row> = sqlx::query_as(
        r#"SELECT
            payload->>'destination_country_code' as destination_country_code,
            payload->>'decision' as decision,
            COUNT(*) as occurrence_count,
            MIN(created_at) as first_seen,
            MAX(created_at) as last_seen,
            MIN(event_id) as event_id,
            MIN(payload->>'source_ip') as system_name
        FROM evidence_events
        WHERE tenant_id = $1
          AND source_system = 'sovereign-shield'
          AND event_type IN ('DATA_TRANSFER_BLOCKED', 'DATA_TRANSFER_REVIEW')
        GROUP BY payload->>'destination_country_code', payload->>'decision'
        ORDER BY COUNT(*) DESC
        LIMIT 20"#
    )
    .bind(tenant.tenant_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let items: Vec<serde_json::Value> = rows.iter().map(|r| {
        let code = r.destination_country_code.clone().unwrap_or_default();
        serde_json::json!({
            "eventId": r.event_id,
            "destinationCountry": country_name(&code),
            "destinationCountryCode": code,
            "systemName": r.system_name.clone().unwrap_or("unknown".into()),
            "occurrenceCount": r.occurrence_count.unwrap_or(0),
            "firstSeen": r.first_seen.map(|t| t.to_rfc3339()),
            "lastSeen": r.last_seen.map(|t| t.to_rfc3339()),
            "decision": r.decision,
            "blockedReason": null,
        })
    }).collect();

    HttpResponse::Ok().json(items)
}

#[get("/api/v1/lenses/sovereign-shield/transfers/by-destination")]
pub async fn transfers_by_destination(pool: web::Data<PgPool>) -> HttpResponse {
    #[derive(sqlx::FromRow)]
    struct Row {
        destination: Option<String>,
        status: Option<String>,
        count: Option<i64>,
    }

    let rows: Vec<Row> = sqlx::query_as(
        r#"SELECT
            payload->>'destination_country' as destination,
            payload->>'country_status' as status,
            COUNT(*) as count
        FROM evidence_events
        WHERE source_system = 'sovereign-shield'
          AND payload->>'destination_country' IS NOT NULL
        GROUP BY payload->>'destination_country', payload->>'country_status'
        ORDER BY COUNT(*) DESC
        LIMIT 20"#
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let items: Vec<serde_json::Value> = rows.iter().map(|r| {
        let status_label = match r.status.as_deref() {
            Some("adequate_protection") | Some("eu_eea") => "Adequate",
            Some("scc_required") => "SCC",
            Some("blocked") => "Blocked",
            _ => "Unknown",
        };
        serde_json::json!({
            "destination": r.destination,
            "status": status_label,
            "count": r.count.unwrap_or(0),
        })
    }).collect();

    HttpResponse::Ok().json(items)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SccRegistryRequest {
    pub partner_name: String,
    pub destination_country_code: String,
    pub expires_at: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub tia_completed: bool,
    pub dpa_id: Option<String>,
    pub scc_module: Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SccRegistryRow {
    pub id: Uuid,
    pub partner_name: String,
    pub destination_country_code: String,
    pub status: String,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub registered_by: Option<String>,
    pub registered_at: chrono::DateTime<chrono::Utc>,
    pub notes: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(default)]
    pub tia_completed: bool,
    #[sqlx(default)]
    pub dpa_id: Option<String>,
    #[sqlx(default)]
    pub scc_module: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SccRegistryPatchRequest {
    pub tia_completed: Option<bool>,
}

#[post("/api/v1/scc-registries")]
pub async fn register_scc(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<SccRegistryRequest>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let expires_at = body.expires_at.as_ref().and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    });

    let dest_upper = body.destination_country_code.to_uppercase();

    // Use transaction to ensure atomicity of SCC registration + auto-approve
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "REGISTRATION_FAILED",
                "message": format!("Failed to begin transaction: {}", e),
            }));
        }
    };

    let row = match sqlx::query_as::<_, SccRegistryRow>(
        r#"INSERT INTO scc_registries 
           (partner_name, destination_country_code, status, expires_at, registered_by, notes, tia_completed, dpa_id, scc_module, tenant_id)
           VALUES ($1, $2, 'active', $3, 'admin', $4, $5, $6, $7, $8)
           RETURNING *"#
    )
    .bind(&body.partner_name)
    .bind(&dest_upper)
    .bind(&expires_at)
    .bind(&body.notes)
    .bind(body.tia_completed)
    .bind(&body.dpa_id)
    .bind(&body.scc_module)
    .bind(tenant.tenant_id)
    .fetch_one(&mut *tx)
    .await {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "REGISTRATION_FAILED",
                "message": format!("Failed to register SCC: {}", e),
            }));
        }
    };

    // Auto-approve pending review items whose transfer matches this SCC (destination country)
    // Note: approve_pending_reviews_for_scc needs to be updated to accept tenant_id and use transaction
    // For now, we'll commit the SCC registration and handle auto-approve separately
    // TODO: Update approve_pending_reviews_for_scc to accept tenant_id and use the transaction
    if let Err(e) = tx.commit().await {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "REGISTRATION_FAILED",
            "message": format!("Failed to commit transaction: {}", e),
        }));
    }

    // Auto-approve after commit (will be fixed in next step to use transaction)
    if let Ok(n) = review_queue::approve_pending_reviews_for_scc(
        pool.get_ref(),
        &dest_upper,
        Some(body.partner_name.as_str()),
        tenant.tenant_id,
    )
    .await
    {
        if n > 0 {
            log::info!("SCC registration auto-approved {} pending review(s) for {}", n, dest_upper);
        }
    }

    HttpResponse::Created().json(serde_json::json!({
        "id": row.id.to_string(),
        "partnerName": row.partner_name,
        "destinationCountryCode": row.destination_country_code,
        "status": row.status,
        "expiresAt": row.expires_at.map(|t| t.to_rfc3339()),
        "registeredBy": row.registered_by,
        "registeredAt": row.registered_at.to_rfc3339(),
        "notes": row.notes,
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
        "tiaCompleted": row.tia_completed,
        "dpaId": row.dpa_id,
        "sccModule": row.scc_module,
    }))
}

#[get("/api/v1/scc-registries")]
pub async fn list_scc_registries(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    // Auto-expire SCCs past their expiry date before fetching
    if let Err(e) = sqlx::query(
        "UPDATE scc_registries
         SET status = 'expired'
         WHERE tenant_id = $1
         AND status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at < NOW()"
    )
    .bind(tenant.tenant_id)
    .execute(pool.get_ref())
    .await {
        log::warn!("Failed to auto-expire SCCs: {}", e);
    }

    let rows: Vec<SccRegistryRow> = match sqlx::query_as::<_, SccRegistryRow>(
        "SELECT * FROM scc_registries WHERE tenant_id = $1 ORDER BY registered_at DESC"
    )
    .bind(tenant.tenant_id)
    .fetch_all(pool.get_ref())
    .await {
        Ok(r) => r,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "QUERY_FAILED",
                "message": format!("Failed to list SCC registries: {}", e),
            }));
        }
    };

    let items: Vec<serde_json::Value> = rows.iter().map(|r| {
        serde_json::json!({
            "id": r.id.to_string(),
            "partnerName": r.partner_name,
            "destinationCountryCode": r.destination_country_code,
            "status": r.status,
            "expiresAt": r.expires_at.map(|t| t.to_rfc3339()),
            "registeredBy": r.registered_by,
            "registeredAt": r.registered_at.to_rfc3339(),
            "notes": r.notes,
            "createdAt": r.created_at.to_rfc3339(),
            "updatedAt": r.updated_at.to_rfc3339(),
            "tiaCompleted": r.tia_completed,
            "dpaId": r.dpa_id,
            "sccModule": r.scc_module,
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "registries": items,
        "total": items.len(),
    }))
}

#[derive(Deserialize)]
pub struct SccRegistryPath {
    pub id: String,
}

#[patch("/api/v1/scc-registries/{id}")]
pub async fn patch_scc_registry(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<SccRegistryPath>,
    body: web::Json<SccRegistryPatchRequest>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let id = match Uuid::parse_str(&path.id) {
        Ok(u) => u,
        Err(_) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "INVALID_ID",
                "message": "Invalid UUID format",
            }));
        }
    };

    if let Some(tia_completed) = body.tia_completed {
        let result = sqlx::query(
            "UPDATE scc_registries SET tia_completed = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 AND status = 'active'"
        )
        .bind(tia_completed)
        .bind(tenant.tenant_id)
        .bind(id)
        .execute(pool.get_ref())
        .await;

        match result {
            Ok(res) if res.rows_affected() > 0 => {
                return HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "id": path.id,
                    "tiaCompleted": tia_completed,
                }));
            }
            Ok(_) => {
                return HttpResponse::NotFound().json(serde_json::json!({
                    "error": "NOT_FOUND",
                    "message": "SCC registry not found or already revoked",
                }));
            }
            Err(e) => {
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "PATCH_FAILED",
                    "message": format!("Failed to update SCC: {}", e),
                }));
            }
        }
    }

    HttpResponse::BadRequest().json(serde_json::json!({
        "error": "INVALID_REQUEST",
        "message": "No updatable fields provided",
    }))
}

#[delete("/api/v1/scc-registries/{id}")]
pub async fn revoke_scc(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<SccRegistryPath>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let id = match Uuid::parse_str(&path.id) {
        Ok(u) => u,
        Err(_) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "INVALID_ID",
                "message": "Invalid UUID format",
            }));
        }
    };

    // ?revoke=1 for Revoke (active) -> status = 'revoked'; otherwise Remove/Archive -> status = 'archived'
    let revoke = req.query_string().contains("revoke=1") || req.query_string().contains("revoke=true");
    let new_status: &str = if revoke { "revoked" } else { "archived" };

    // Soft delete: set status, never actually delete. Allow for both 'active' and 'expired'
    let result = sqlx::query(
        "UPDATE scc_registries SET status = $1 WHERE tenant_id = $2 AND id = $3 AND status IN ('active', 'expired')"
    )
    .bind(new_status)
    .bind(tenant.tenant_id)
    .bind(id)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(res) if res.rows_affected() > 0 => {
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "id": path.id,
                "status": new_status,
            }))
        }
        Ok(_) => {
            HttpResponse::NotFound().json(serde_json::json!({
                "error": "NOT_FOUND",
                "message": "SCC registry not found or already revoked/archived",
            }))
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "REVOKE_FAILED",
                "message": format!("Failed to revoke/archive SCC: {}", e),
            }))
        }
    }
}

/// Auto-expire SCCs past their expiry date. Called by background job.
pub async fn auto_expire_sccs(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        "UPDATE scc_registries 
         SET status = 'expired' 
         WHERE status = 'active' 
         AND expires_at IS NOT NULL
         AND expires_at < NOW()"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to auto-expire SCCs: {}", e))?;
    Ok(())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_settings)
       .service(patch_settings)
       .service(evaluate)
       .service(ingest_logs)
       .service(shield_stats)
       .service(shield_countries)
       .service(shield_requires_attention)
       .service(transfers_by_destination)
       .service(register_scc)
       .service(list_scc_registries)
       .service(patch_scc_registry)
       .service(revoke_scc);
}
