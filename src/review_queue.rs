use chrono::Utc;
use sha2::{Sha256, Digest};
use sqlx::PgPool;
use uuid::Uuid;
use std::collections::HashMap;

use crate::evidence::{self, CreateEventParams};
use crate::models::{ComplianceRecordRow, HumanOversightRow, ReviewItemResponse, EvidenceEventRow};

/// Get current enforcement mode from system_settings
async fn get_enforcement_mode(pool: &PgPool, tenant_id: uuid::Uuid) -> Result<String, String> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM system_settings WHERE tenant_id = $1 AND key = 'enforcement_mode'"
    )
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to get enforcement mode: {}", e))?;

    Ok(row.map(|r| r.0).unwrap_or_else(|| "shadow".to_string()))
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub async fn create_review(
    pool: &PgPool,
    agent_id: &str,
    action: &str,
    _module: &str,
    context: &serde_json::Value,
    evidence_event_id: &str,
    tenant_id: uuid::Uuid,
) -> Result<String, String> {
    // Do not create a duplicate review for the same evidence event (e.g. already rejected or approved).
    // Return existing seal_id so frontend stops re-adding; REQUIRES ATTENTION only shows PENDING items.
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT seal_id FROM compliance_records WHERE tenant_id = $1 AND evidence_event_id = $2 LIMIT 1",
    )
    .bind(tenant_id)
    .bind(evidence_event_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to check existing review: {}", e))?;

    if let Some((existing_seal_id,)) = existing {
        return Ok(existing_seal_id);
    }

    let seal_id = format!("SEAL-{}", Uuid::new_v4().to_string().replace('-', "")[..16].to_uppercase());
    let tx_id = format!("TX-{}", Uuid::new_v4().to_string().replace('-', "")[..12].to_uppercase());
    let payload_hash = sha256_hex(&serde_json::to_string(context).unwrap_or_default());

    // Use transaction to ensure atomicity
    let mut tx = pool.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;

    if let Err(e) = sqlx::query(
        r#"INSERT INTO compliance_records
            (agent_id, action_summary, seal_id, status, human_oversight_status, tx_id, payload_hash, evidence_event_id, tenant_id)
           VALUES ($1, $2, $3, 'PENDING_REVIEW', 'PENDING', $4, $5, $6, $7)"#
    )
    .bind(agent_id)
    .bind(action)
    .bind(&seal_id)
    .bind(&tx_id)
    .bind(&payload_hash)
    .bind(evidence_event_id)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return Err(format!("Failed to create compliance record: {}", e));
    }

    if let Err(e) = sqlx::query(
        "INSERT INTO human_oversight (seal_id, status, tenant_id) VALUES ($1, 'PENDING', $2)"
    )
    .bind(&seal_id)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return Err(format!("Failed to create human oversight entry: {}", e));
    }

    tx.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(seal_id)
}

/// Evidence event IDs that already have a decision (APPROVED or REJECTED). Used to exclude them from REQUIRES ATTENTION.
pub async fn get_decided_evidence_event_ids(pool: &PgPool, tenant_id: uuid::Uuid) -> Result<Vec<String>, String> {
    let rows: Vec<(Option<String>,)> = sqlx::query_as(
        r#"SELECT DISTINCT cr.evidence_event_id
           FROM compliance_records cr
           JOIN human_oversight ho ON ho.seal_id = cr.seal_id
           WHERE cr.tenant_id = $1
             AND ho.tenant_id = $1
             AND ho.status IN ('APPROVED', 'REJECTED') 
             AND cr.evidence_event_id IS NOT NULL"#,
    )
    .bind(tenant_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().filter_map(|(id,)| id).collect())
}

pub async fn list_reviews(pool: &PgPool, status: Option<&str>, tenant_id: uuid::Uuid) -> Result<Vec<ReviewItemResponse>, String> {
    let rows: Vec<(ComplianceRecordRow, HumanOversightRow)> = if let Some(s) = status {
        let cr_rows: Vec<ComplianceRecordRow> = sqlx::query_as(
            r#"SELECT cr.* FROM compliance_records cr
               JOIN human_oversight ho ON ho.seal_id = cr.seal_id
               WHERE cr.tenant_id = $1 AND ho.tenant_id = $1 AND ho.status = $2
               ORDER BY cr.created_at DESC"#
        )
        .bind(tenant_id)
        .bind(s)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        let ho_rows: Vec<HumanOversightRow> = sqlx::query_as(
            "SELECT * FROM human_oversight WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC"
        )
        .bind(tenant_id)
        .bind(s)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        cr_rows.into_iter().zip(ho_rows.into_iter()).collect()
    } else {
        let cr_rows: Vec<ComplianceRecordRow> = sqlx::query_as(
            r#"SELECT cr.* FROM compliance_records cr
               JOIN human_oversight ho ON ho.seal_id = cr.seal_id
               WHERE cr.tenant_id = $1 AND ho.tenant_id = $1
               ORDER BY cr.created_at DESC"#
        )
        .bind(tenant_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        let ho_rows: Vec<HumanOversightRow> = sqlx::query_as(
            "SELECT * FROM human_oversight WHERE tenant_id = $1 ORDER BY created_at DESC"
        )
        .bind(tenant_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        cr_rows.into_iter().zip(ho_rows.into_iter()).collect()
    };

    // Fetch all evidence events upfront to extract destination/partner data
    let evidence_event_ids: Vec<String> = rows.iter()
        .filter_map(|(cr, _)| cr.evidence_event_id.clone())
        .collect();
    
    let mut evidence_payloads: HashMap<String, serde_json::Value> = HashMap::new();
    if !evidence_event_ids.is_empty() {
        // Use PostgreSQL ANY(array) syntax for efficient batch fetch
        if let Ok(evt_rows) = sqlx::query_as::<_, (String, serde_json::Value)>(
            "SELECT event_id, payload FROM evidence_events WHERE event_id = ANY($1)"
        )
        .bind(&evidence_event_ids)
        .fetch_all(pool)
        .await
        {
            for (evt_id, payload) in evt_rows {
                evidence_payloads.insert(evt_id, payload);
            }
        }
    }

    let reviews: Vec<ReviewItemResponse> = rows.into_iter().map(|(cr, ho)| {
        let final_decision = match ho.status.as_str() {
            "APPROVED" => Some("ALLOW".to_string()),
            "REJECTED" => Some("BLOCK".to_string()),
            _ => None,
        };
        let status = match ho.status.as_str() {
            "PENDING" => "PENDING",
            "APPROVED" | "REJECTED" => "DECIDED",
            _ => &ho.status,
        };

        // Build context with evidence_event_id if available
        let mut context = serde_json::json!({
            "seal_id": cr.seal_id,
            "tx_id": cr.tx_id,
            "risk_level": cr.risk_level,
        });
        
        // Add evidence_event_id to context and extract destination/partner from evidence event payload
        if let Some(ref evt_id) = cr.evidence_event_id {
            context["event_id"] = serde_json::json!(evt_id);
            context["evidence_id"] = serde_json::json!(evt_id);
            
            // Extract destination and partner from pre-fetched payload
            if let Some(payload) = evidence_payloads.get(evt_id) {
                if let Some(payload_obj) = payload.as_object() {
                    // Extract destination_country (full name)
                    if let Some(dest_country) = payload_obj.get("destination_country")
                        .or_else(|| payload_obj.get("destinationCountry"))
                        .or_else(|| payload_obj.get("destination")) {
                        context["destination_country"] = dest_country.clone();
                    }
                    // Extract destination_country_code
                    if let Some(dest_code) = payload_obj.get("destination_country_code")
                        .or_else(|| payload_obj.get("destinationCountryCode")) {
                        context["destination_country_code"] = dest_code.clone();
                    }
                    // Extract partner_name
                    if let Some(partner) = payload_obj.get("partner_name")
                        .or_else(|| payload_obj.get("partnerName")) {
                        context["partner_name"] = partner.clone();
                    }
                }
            }
        }
        
        ReviewItemResponse {
            id: cr.seal_id.clone(),
            created: cr.created_at.to_rfc3339(),
            agent_id: cr.agent_id.clone(),
            action: cr.action_summary.clone(),
            module: "sovereign-shield".to_string(),
            suggested_decision: "REVIEW".to_string(),
            context,
            status: status.to_string(),
            evidence_id: cr.evidence_event_id.clone().unwrap_or_else(|| cr.seal_id.clone()),
            decided_by: ho.reviewer_id.clone(),
            decision_reason: ho.comments.clone(),
            final_decision,
            decided_at: ho.decided_at.map(|t| t.to_rfc3339()),
            expires_at: None,
        }
    }).collect();

    Ok(reviews)
}

pub async fn decide_review(
    pool: &PgPool,
    seal_id: &str,
    decision: &str,
    reviewer_id: &str,
    comments: &str,
    tenant_id: uuid::Uuid,
) -> Result<(), String> {
    let ho_status = match decision {
        "ALLOW" | "APPROVE" => "APPROVED",
        "BLOCK" | "REJECT" => "REJECTED",
        _ => return Err(format!("Invalid decision: {}", decision)),
    };

    // Fetch the compliance record to get evidence_event_id and verify tenant_id
    let evidence_event_id: Option<String> = sqlx::query_scalar(
        "SELECT evidence_event_id FROM compliance_records WHERE tenant_id = $1 AND seal_id = $2"
    )
    .bind(tenant_id)
    .bind(seal_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to fetch compliance record: {}", e))?;

    if evidence_event_id.is_none() {
        return Err("Review not found or access denied".into());
    }

    // Use transaction to ensure atomicity
    let mut tx = pool.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = match sqlx::query(
        "UPDATE human_oversight SET status = $1, reviewer_id = $2, decided_at = $3, comments = $4 WHERE tenant_id = $5 AND seal_id = $6 AND status = 'PENDING'"
    )
    .bind(ho_status)
    .bind(reviewer_id)
    .bind(Utc::now())
    .bind(comments)
    .bind(tenant_id)
    .bind(seal_id)
    .execute(&mut *tx)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            return Err(format!("Failed to update human oversight: {}", e));
        }
    };

    if result.rows_affected() == 0 {
        let _ = tx.rollback().await;
        return Err("Review not found or already decided".into());
    }

    if let Err(e) = sqlx::query(
        "UPDATE compliance_records SET human_oversight_status = $1 WHERE tenant_id = $2 AND seal_id = $3"
    )
    .bind(ho_status)
    .bind(tenant_id)
    .bind(seal_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return Err(format!("Failed to update compliance record: {}", e));
    }

    // Get enforcement mode for shadow_mode flag
    let enforcement_mode = get_enforcement_mode(pool, tenant_id).await.unwrap_or_else(|_| "shadow".to_string());
    let is_shadow = enforcement_mode.eq_ignore_ascii_case("shadow");

    // Build payload with destination data from original event if available
    let mut payload = serde_json::json!({
        "seal_id": seal_id,
        "decision": ho_status,
        "reviewer_id": reviewer_id,
        "comments": comments,
        "shadow_mode": is_shadow,
    });

    // Fetch original evidence event and include destination data
    if let Some(ref evt_id) = evidence_event_id {
        if let Ok(Some(original_event)) = sqlx::query_as::<_, EvidenceEventRow>(
            "SELECT * FROM evidence_events WHERE tenant_id = $1 AND event_id = $2"
        )
        .bind(tenant_id)
        .bind(evt_id)
        .fetch_optional(pool)
        .await
        {
            // Extract destination data and data categories from original event payload
            if let Some(payload_obj) = original_event.payload.as_object() {
                if let Some(dest_country) = payload_obj.get("destination_country")
                    .or_else(|| payload_obj.get("destinationCountry")) {
                    payload["destination_country"] = dest_country.clone();
                }
                if let Some(dest_code) = payload_obj.get("destination_country_code")
                    .or_else(|| payload_obj.get("destinationCountryCode")) {
                    payload["destination_country_code"] = dest_code.clone();
                }
                if let Some(partner_name) = payload_obj.get("partner_name")
                    .or_else(|| payload_obj.get("partnerName")) {
                    payload["partner_name"] = partner_name.clone();
                }
                if let Some(data_categories) = payload_obj.get("data_categories")
                    .or_else(|| payload_obj.get("dataCategories")) {
                    payload["data_categories"] = data_categories.clone();
                }
            }
        }
    }

    // Set regulatory tags and articles based on decision type
    let regulatory_tags = vec!["GDPR".into(), "Art. 44".into(), "Art. 5(2)".into()];
    let articles = if ho_status == "APPROVED" {
        vec!["GDPR Art. 44".into(), "GDPR Art. 46(2)(c)".into(), "GDPR Art. 5(2)".into()]
    } else {
        vec!["GDPR Art. 44".into(), "GDPR Art. 5(2)".into()]
    };

    let params = CreateEventParams {
        event_type: format!("HUMAN_OVERSIGHT_{}", ho_status),
        severity: "L2".into(),
        source_system: "human-oversight".into(),
        regulatory_tags,
        articles,
        payload,
        correlation_id: Some(seal_id.to_string()),
        causation_id: evidence_event_id.clone(),
        source_ip: None,
        source_user_agent: None,
        tenant_id,
    };

    if let Err(e) = evidence::create_event(pool, params).await {
        log::error!("Failed to create evidence event for review decision: {}", e);
    }

    tx.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

/// SLA timeout: auto-block pending reviews older than 24 hours.
pub async fn process_sla_timeouts(pool: &PgPool) -> Result<(), String> {
    #[derive(sqlx::FromRow)]
    struct TimeoutRow {
        seal_id: String,
        evidence_event_id: Option<String>,
    }

    #[derive(sqlx::FromRow)]
    struct TimeoutRowWithTenant {
        seal_id: String,
        evidence_event_id: Option<String>,
        tenant_id: uuid::Uuid,
    }

    let rows: Vec<TimeoutRowWithTenant> = sqlx::query_as(
        r#"SELECT ho.seal_id, cr.evidence_event_id, ho.tenant_id
           FROM human_oversight ho
           JOIN compliance_records cr ON cr.seal_id = ho.seal_id AND cr.tenant_id = ho.tenant_id
           WHERE ho.status = 'PENDING'
             AND ho.created_at < NOW() - INTERVAL '24 hours'"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch SLA timeout items: {}", e))?;

    for row in rows {
        let seal_id = &row.seal_id;
        let evidence_event_id = row.evidence_event_id.as_deref();
        let tenant_id = row.tenant_id;

        // Update human_oversight
        sqlx::query(
            r#"UPDATE human_oversight
               SET status = 'REJECTED', reviewer_id = 'system-sla-timeout',
                   decided_at = NOW(), comments = 'SLA timeout'
               WHERE tenant_id = $1 AND seal_id = $2 AND status = 'PENDING'"#,
        )
        .bind(tenant_id)
        .bind(seal_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update human_oversight for {}: {}", seal_id, e))?;

        // Update compliance_records
        sqlx::query(
            r#"UPDATE compliance_records
               SET status = 'REJECTED', human_oversight_status = 'REJECTED'
               WHERE tenant_id = $1 AND seal_id = $2"#,
        )
        .bind(tenant_id)
        .bind(seal_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update compliance_records for {}: {}", seal_id, e))?;

        // Get enforcement mode for shadow_mode flag
        let enforcement_mode = get_enforcement_mode(pool, tenant_id).await.unwrap_or_else(|_| "shadow".to_string());
        let is_shadow = enforcement_mode.eq_ignore_ascii_case("shadow");

        // Build payload from original evidence event
        let mut payload = serde_json::json!({
            "decision": "REJECTED",
            "reason": "SLA timeout — transfer auto-blocked after 24 hours without human review",
            "reviewer_id": "system-sla-timeout",
            "shadow_mode": is_shadow,
        });

        let (country, partner) = if let Some(evt_id) = evidence_event_id {
            if let Ok(Some(original)) = sqlx::query_as::<_, EvidenceEventRow>(
                "SELECT * FROM evidence_events WHERE tenant_id = $1 AND event_id = $2",
            )
            .bind(tenant_id)
            .bind(evt_id)
            .fetch_optional(pool)
            .await
            {
                if let Some(obj) = original.payload.as_object() {
                    if let Some(v) = obj.get("destination_country").or_else(|| obj.get("destinationCountry")) {
                        payload["destination_country"] = v.clone();
                    }
                    if let Some(v) = obj.get("destination_country_code").or_else(|| obj.get("destinationCountryCode")) {
                        payload["destination_country_code"] = v.clone();
                    }
                    if let Some(v) = obj.get("partner_name").or_else(|| obj.get("partnerName")) {
                        payload["partner_name"] = v.clone();
                    }
                    if let Some(v) = obj.get("data_categories").or_else(|| obj.get("dataCategories")) {
                        payload["data_categories"] = v.clone();
                    }
                }
                let country = original
                    .payload
                    .get("destination_country")
                    .or(original.payload.get("destinationCountry"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let partner = original
                    .payload
                    .get("partner_name")
                    .or(original.payload.get("partnerName"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                (country.to_string(), partner.to_string())
            } else {
                ("?".into(), "?".into())
            }
        } else {
            ("?".into(), "?".into())
        };

        log::warn!(
            "SLA timeout: auto-blocked transfer to {} via {} (seal: {})",
            country,
            partner,
            seal_id
        );

        let params = CreateEventParams {
            event_type: "HUMAN_OVERSIGHT_REJECTED".into(),
            severity: "CRITICAL".into(),
            source_system: "human-oversight".into(),
            regulatory_tags: vec!["GDPR".into(), "Art. 44".into(), "Art. 5(2)".into()],
            articles: vec!["GDPR Art. 44".into(), "GDPR Art. 5(2)".into()],
            payload,
            correlation_id: Some(seal_id.to_string()),
            causation_id: evidence_event_id.map(String::from),
            source_ip: None,
            source_user_agent: None,
            tenant_id,
        };

        if let Err(e) = evidence::create_event(pool, params).await {
            log::error!("Failed to create SLA timeout evidence event for {}: {}", seal_id, e);
        }
    }

    Ok(())
}

/// After registering an SCC, auto-approve any pending review items whose transfer
/// matches the new SCC (destination country). Pairs "Register SCC" with transfer approval.
pub async fn approve_pending_reviews_for_scc(
    pool: &PgPool,
    destination_country_code: &str,
    _partner_name: Option<&str>,
    tenant_id: uuid::Uuid,
) -> Result<usize, String> {
    let country_upper = destination_country_code.to_uppercase();
    let rows: Vec<(String,)> = sqlx::query_as(
        r#"SELECT ho.seal_id FROM human_oversight ho
           JOIN compliance_records cr ON cr.seal_id = ho.seal_id
           JOIN evidence_events ee ON ee.event_id = cr.evidence_event_id
           WHERE ho.tenant_id = $1
             AND cr.tenant_id = $1
             AND ee.tenant_id = $1
             AND ho.status = 'PENDING'
             AND UPPER(ee.payload->>'destination_country_code') = $2"#,
    )
    .bind(tenant_id)
    .bind(&country_upper)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to find matching pending reviews: {}", e))?;

    let mut approved = 0;
    for (seal_id,) in rows {
        if decide_review(
            pool,
            &seal_id,
            "APPROVE",
            "scc-registration",
            "SCC registered for this destination",
            tenant_id,
        )
        .await
        .is_ok()
        {
            approved += 1;
        }
    }
    Ok(approved)
}
