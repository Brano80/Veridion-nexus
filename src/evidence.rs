use chrono::Utc;
use sha2::{Sha256, Digest};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{EvidenceEventRow, EvidenceEventResponse};

const SEAL_SALT: &str = "VERIDION_PROFESSIONAL_COMPLIANCE_SEAL_2024";

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn compute_payload_hash(payload: &serde_json::Value) -> String {
    let canonical = serde_json::to_string(payload).unwrap_or_default();
    sha256_hex(&canonical)
}

pub fn compute_nexus_seal(payload_hash: &str, previous_hash: &str) -> String {
    let salt = std::env::var("NEXUS_SEAL_SALT").unwrap_or_else(|_| SEAL_SALT.to_string());
    let input = format!("{}{}{}", payload_hash, previous_hash, salt);
    sha256_hex(&input)
}

pub async fn get_latest_hash(pool: &PgPool, source_system: &str, tenant_id: uuid::Uuid) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT payload_hash FROM evidence_events WHERE tenant_id = $1 AND source_system = $2 ORDER BY sequence_number DESC LIMIT 1"
    )
    .bind(tenant_id)
    .bind(source_system)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

pub async fn get_next_sequence(pool: &PgPool, source_system: &str, tenant_id: uuid::Uuid) -> i64 {
    let max: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(sequence_number) FROM evidence_events WHERE tenant_id = $1 AND source_system = $2"
    )
    .bind(tenant_id)
    .bind(source_system)
    .fetch_one(pool)
    .await
    .ok()
    .flatten();
    max.unwrap_or(0) + 1
}

pub struct CreateEventParams {
    pub event_type: String,
    pub severity: String,
    pub source_system: String,
    pub regulatory_tags: Vec<String>,
    pub articles: Vec<String>,
    pub payload: serde_json::Value,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub source_ip: Option<String>,
    pub source_user_agent: Option<String>,
    pub tenant_id: uuid::Uuid,
}

pub async fn create_event(pool: &PgPool, params: CreateEventParams) -> Result<EvidenceEventRow, String> {
    let now = Utc::now();
    let event_id = Uuid::new_v4().to_string();
    let correlation_id = params.correlation_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let sequence_number = get_next_sequence(pool, &params.source_system, params.tenant_id).await;
    let payload_hash = compute_payload_hash(&params.payload);
    let previous_hash = get_latest_hash(pool, &params.source_system, params.tenant_id).await.unwrap_or_default();
    let nexus_seal = compute_nexus_seal(&payload_hash, &previous_hash);

    let tags_json = serde_json::to_value(&params.regulatory_tags).unwrap_or_default();
    let articles_json = serde_json::to_value(&params.articles).unwrap_or_default();

    sqlx::query(
        r#"INSERT INTO evidence_events
            (event_id, correlation_id, causation_id, sequence_number,
             occurred_at, recorded_at, event_type, severity,
             source_system, source_ip, source_user_agent,
             regulatory_tags, articles, payload,
             payload_hash, previous_hash, nexus_seal,
             verification_status, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'VERIFIED', $18)"#
    )
    .bind(&event_id)
    .bind(&correlation_id)
    .bind(&params.causation_id)
    .bind(sequence_number)
    .bind(now)
    .bind(now)
    .bind(&params.event_type)
    .bind(&params.severity)
    .bind(&params.source_system)
    .bind(&params.source_ip)
    .bind(&params.source_user_agent)
    .bind(&tags_json)
    .bind(&articles_json)
    .bind(&params.payload)
    .bind(&payload_hash)
    .bind(&previous_hash)
    .bind(&nexus_seal)
    .bind(params.tenant_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to insert evidence event: {}", e))?;

    Ok(EvidenceEventRow {
        event_id,
        correlation_id: Some(correlation_id),
        causation_id: params.causation_id,
        sequence_number,
        occurred_at: now,
        recorded_at: now,
        event_type: params.event_type,
        severity: params.severity,
        source_system: params.source_system,
        source_ip: params.source_ip,
        source_user_agent: params.source_user_agent,
        regulatory_tags: tags_json,
        articles: articles_json,
        payload: params.payload,
        payload_hash,
        previous_hash,
        company_id: None,
        nexus_seal: Some(nexus_seal),
        regulatory_framework: None,
        verification_status: Some("VERIFIED".into()),
        last_verification: None,
        scope_snapshot_hash: None,
        processing_duration_ms: None,
        retry_count: 0,
        error_message: None,
        created_at: now,
        updated_at: now,
    })
}

/// After `create_review` returns a SEAL-XXXXXXXX, link the Transfer — Review evidence row so Evidence Vault search finds it.
///
/// `evidence_events.event_id` is `VARCHAR(64)` (see `010_evidence_vault_and_sovereign_shield.sql`); bind as `&str`, not `Uuid`.
/// The UPDATE must match `tenant_id` and `event_id` (the logical row key used at insert time), not `id` (surrogate PK).
pub async fn attach_review_seal_to_event(
    pool: &PgPool,
    tenant_id: uuid::Uuid,
    event_id: &str,
    seal_id: &str,
) -> Result<(), String> {
    let result = sqlx::query(
        r#"UPDATE evidence_events
           SET correlation_id = $1
           WHERE tenant_id = $2 AND event_id = $3"#,
    )
    .bind(seal_id)
    .bind(tenant_id)
    .bind(event_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        log::warn!(
            "attach_review_seal: 0 rows updated for event_id={}",
            event_id
        );
        return Err(format!(
            "No evidence event updated for event_id={} tenant={}",
            event_id, tenant_id
        ));
    }
    Ok(())
}

/// Count distinct source_system chains that have at least one event with nexus_seal (sealed chain roots)
pub async fn count_sealed_chain_roots(pool: &PgPool, tenant_id: uuid::Uuid) -> Result<i64, String> {
    let count: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT source_system) FROM evidence_events WHERE tenant_id = $1 AND nexus_seal IS NOT NULL AND nexus_seal != ''"
    )
    .bind(tenant_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(count.unwrap_or(0))
}

/// Count total events that have a nexus_seal (sealed events)
pub async fn count_total_sealed_events(pool: &PgPool, tenant_id: uuid::Uuid) -> Result<i64, String> {
    let count: Option<i64> = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND nexus_seal IS NOT NULL AND nexus_seal != ''"
    )
    .bind(tenant_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(count.unwrap_or(0))
}

pub async fn list_events(
    pool: &PgPool,
    severity: Option<&str>,
    event_type: Option<&str>,
    search: Option<&str>,
    destination_country: Option<&str>,
    source_system: Option<&str>,
    limit: i64,
    offset: i64,
    tenant_id: uuid::Uuid,
) -> Result<(Vec<EvidenceEventResponse>, i64), String> {
    let mut conditions = vec!["tenant_id = $1".to_string()];
    let mut bind_idx = 1u32;

    if severity.is_some() {
        bind_idx += 1;
        conditions.push(format!("severity = ${}", bind_idx));
    }
    if event_type.is_some() {
        bind_idx += 1;
        conditions.push(format!("event_type = ${}", bind_idx));
    }
    if search.is_some() {
        bind_idx += 1;
        conditions.push(format!(
            "(event_id ILIKE '%' || ${idx} || '%' OR COALESCE(correlation_id, '') ILIKE '%' || ${idx} || '%' OR COALESCE(causation_id, '') ILIKE '%' || ${idx} || '%' OR event_type ILIKE '%' || ${idx} || '%' OR COALESCE(nexus_seal, '') ILIKE '%' || ${idx} || '%' OR COALESCE(payload->>'seal_id', payload->>'sealId', '') ILIKE '%' || ${idx} || '%' OR COALESCE(payload->>'review_id', payload->>'reviewId', '') ILIKE '%' || ${idx} || '%' OR CAST(payload AS TEXT) ILIKE '%' || ${idx} || '%')",
            idx = bind_idx
        ));
    }
    if destination_country.is_some() {
        bind_idx += 1;
        conditions.push(format!(
            "(payload->>'destination_country' ILIKE '%' || ${idx} || '%' OR payload->>'destinationCountry' ILIKE '%' || ${idx} || '%')",
            idx = bind_idx
        ));
    }
    if source_system.is_some() {
        bind_idx += 1;
        conditions.push(format!("source_system = ${}", bind_idx));
    }

    let where_clause = conditions.join(" AND ");
    bind_idx += 1;
    let offset_idx = bind_idx;
    bind_idx += 1;
    let limit_idx = bind_idx;

    let query_str = format!(
        "SELECT * FROM evidence_events WHERE {} ORDER BY created_at DESC OFFSET ${} LIMIT ${}",
        where_clause, offset_idx, limit_idx
    );
    let count_str = format!(
        "SELECT COUNT(*) FROM evidence_events WHERE {}",
        where_clause
    );

    let mut query = sqlx::query_as::<_, EvidenceEventRow>(&query_str);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_str);

    // Always bind tenant_id first
    query = query.bind(tenant_id);
    count_query = count_query.bind(tenant_id);

    if let Some(s) = severity {
        query = query.bind(s.to_string());
        count_query = count_query.bind(s.to_string());
    }
    if let Some(et) = event_type {
        query = query.bind(et.to_string());
        count_query = count_query.bind(et.to_string());
    }
    if let Some(s) = search {
        query = query.bind(s.to_string());
        count_query = count_query.bind(s.to_string());
    }
    if let Some(dc) = destination_country {
        query = query.bind(dc.to_string());
        count_query = count_query.bind(dc.to_string());
    }
    if let Some(ss) = source_system {
        query = query.bind(ss.to_string());
        count_query = count_query.bind(ss.to_string());
    }

    query = query.bind(offset).bind(limit);

    let rows = query.fetch_all(pool).await.map_err(|e| e.to_string())?;
    let total: i64 = count_query.fetch_one(pool).await.unwrap_or(0);

    let events: Vec<EvidenceEventResponse> = rows.into_iter().map(|r| r.into()).collect();
    Ok((events, total))
}

pub async fn verify_chain_integrity(pool: &PgPool, source_system: &str, tenant_id: uuid::Uuid) -> Result<(bool, String), String> {
    let rows = sqlx::query_as::<_, EvidenceEventRow>(
        "SELECT * FROM evidence_events WHERE tenant_id = $1 AND source_system = $2 ORDER BY sequence_number ASC"
    )
    .bind(tenant_id)
    .bind(source_system)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok((true, "No events to verify".to_string()));
    }

    for (i, row) in rows.iter().enumerate() {
        let expected_hash = compute_payload_hash(&row.payload);
        if row.payload_hash != expected_hash {
            return Ok((false, format!("Event {} payload hash mismatch", row.event_id)));
        }

        if let Some(ref seal) = row.nexus_seal {
            let expected_seal = compute_nexus_seal(&row.payload_hash, &row.previous_hash);
            if seal != &expected_seal {
                return Ok((false, format!("Event {} nexus seal mismatch", row.event_id)));
            }
        }

        if i > 0 {
            let prev = &rows[i - 1];
            if row.previous_hash != prev.payload_hash {
                return Ok((false, format!("Event {} chain break: previous_hash does not match", row.event_id)));
            }
        }
    }

    Ok((true, format!("Chain verified: {} events", rows.len())))
}
