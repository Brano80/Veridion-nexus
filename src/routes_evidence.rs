use actix_web::{web, HttpResponse, get, post};
use sqlx::PgPool;
use serde::Deserialize;

use crate::evidence;

#[derive(Deserialize)]
pub struct ListEventsQuery {
    pub severity: Option<String>,
    pub event_type: Option<String>,
    pub search: Option<String>,
    pub destination_country: Option<String>,
    pub source_system: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[get("/api/v1/evidence/events")]
pub async fn list_events(
    pool: web::Data<PgPool>,
    query: web::Query<ListEventsQuery>,
) -> HttpResponse {
    let limit = query.limit.unwrap_or(50).min(10000);
    let offset = query.offset.unwrap_or(0).max(0);

    match evidence::list_events(
        pool.get_ref(),
        query.severity.as_deref(),
        query.event_type.as_deref(),
        query.search.as_deref(),
        query.destination_country.as_deref(),
        query.source_system.as_deref(),
        limit,
        offset,
    ).await {
        Ok((events, total)) => {
            let merkle_roots = evidence::count_sealed_chain_roots(pool.get_ref()).await.unwrap_or(0);
            HttpResponse::Ok().json(serde_json::json!({
                "events": events,
                "totalCount": total,
                "merkleRoots": merkle_roots,
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventBody {
    pub event_type: String,
    pub severity: String,
    pub source_system: String,
    pub regulatory_tags: Option<Vec<String>>,
    pub articles: Option<Vec<String>>,
    pub payload: serde_json::Value,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub source_ip: Option<String>,
    pub source_user_agent: Option<String>,
}

#[post("/api/v1/evidence/events")]
pub async fn create_event(
    pool: web::Data<PgPool>,
    body: web::Json<CreateEventBody>,
) -> HttpResponse {
    let params = evidence::CreateEventParams {
        event_type: body.event_type.clone(),
        severity: body.severity.clone(),
        source_system: body.source_system.clone(),
        regulatory_tags: body.regulatory_tags.clone().unwrap_or_default(),
        articles: body.articles.clone().unwrap_or_default(),
        payload: body.payload.clone(),
        correlation_id: body.correlation_id.clone(),
        causation_id: body.causation_id.clone(),
        source_ip: body.source_ip.clone(),
        source_user_agent: body.source_user_agent.clone(),
    };

    match evidence::create_event(pool.get_ref(), params).await {
        Ok(row) => HttpResponse::Created().json(serde_json::json!({
            "eventId": row.event_id,
            "sequenceNumber": row.sequence_number,
            "payloadHash": row.payload_hash,
            "previousHash": row.previous_hash,
            "createdAt": row.created_at.to_rfc3339(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyBody {
    #[serde(alias = "source_system")]
    pub source_system: Option<String>,
}

#[post("/api/v1/evidence/verify-integrity")]
pub async fn verify_integrity(
    pool: web::Data<PgPool>,
    body: web::Json<VerifyBody>,
) -> HttpResponse {
    let source = body.source_system.as_deref().unwrap_or("sovereign-shield");

    match evidence::verify_chain_integrity(pool.get_ref(), source).await {
        Ok((verified, message)) => HttpResponse::Ok().json(serde_json::json!({
            "verified": verified,
            "sourceSystem": source,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "message": message,
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_events)
       .service(create_event)
       .service(verify_integrity);
}
