use actix_web::{web, HttpRequest, HttpResponse, get, post};
use serde::Deserialize;
use sqlx::PgPool;

use crate::review_queue;
use crate::tenant::get_tenant_context;

#[derive(Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
}

#[get("/api/v1/review-queue")]
pub async fn list_reviews(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    query: web::Query<ListQuery>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    match review_queue::list_reviews(pool.get_ref(), query.status.as_deref(), tenant.tenant_id).await {
        Ok(reviews) => {
            let pending = reviews.iter().filter(|r| r.status == "PENDING").count();
            let decided = reviews.iter().filter(|r| r.status == "DECIDED").count();
            let expired = reviews.iter().filter(|r| r.status == "EXPIRED").count();
            let total = reviews.len();

            HttpResponse::Ok().json(serde_json::json!({
                "reviews": reviews,
                "total": total,
                "pending": pending,
                "decided": decided,
                "expired": expired,
            }))
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[get("/api/v1/human_oversight/pending")]
pub async fn get_pending(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    match review_queue::list_reviews(pool.get_ref(), Some("PENDING"), tenant.tenant_id).await {
        Ok(reviews) => HttpResponse::Ok().json(serde_json::json!({
            "reviews": reviews,
            "total": reviews.len(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[get("/api/v1/human_oversight/decided-evidence-ids")]
pub async fn get_decided_evidence_ids(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    match review_queue::get_decided_evidence_event_ids(pool.get_ref(), tenant.tenant_id).await {
        Ok(ids) => HttpResponse::Ok().json(serde_json::json!({
            "evidenceEventIds": ids,
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionBody {
    pub decision: String,
    pub reason: String,
    pub reviewer_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewBody {
    pub agent_id: Option<String>,
    pub action: String,
    pub module: Option<String>,
    pub context: serde_json::Value,
    pub evidence_event_id: String,
}

#[post("/api/v1/review-queue")]
pub async fn create_review(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateReviewBody>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let agent_id = body.agent_id.as_deref().unwrap_or("sovereign-shield");
    let module = body.module.as_deref().unwrap_or("sovereign-shield");
    
    match review_queue::create_review(
        pool.get_ref(),
        agent_id,
        &body.action,
        module,
        &body.context,
        &body.evidence_event_id,
        tenant.tenant_id,
    ).await {
        Ok(seal_id) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "sealId": seal_id,
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[post("/api/v1/action/{seal_id}/approve")]
pub async fn approve_action(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<String>,
    body: web::Json<DecisionBody>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let seal_id = path.into_inner();
    let reviewer = body.reviewer_id.as_deref().unwrap_or("admin");

    match review_queue::decide_review(pool.get_ref(), &seal_id, "APPROVE", reviewer, &body.reason, tenant.tenant_id).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "sealId": seal_id,
            "decision": "APPROVED",
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e,
        })),
    }
}

#[post("/api/v1/action/{seal_id}/reject")]
pub async fn reject_action(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<String>,
    body: web::Json<DecisionBody>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };
    let seal_id = path.into_inner();
    let reviewer = body.reviewer_id.as_deref().unwrap_or("admin");

    match review_queue::decide_review(pool.get_ref(), &seal_id, "REJECT", reviewer, &body.reason, tenant.tenant_id).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "sealId": seal_id,
            "decision": "REJECTED",
        })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
            "error": e,
        })),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_reviews)
       .service(get_pending)
       .service(get_decided_evidence_ids)
       .service(create_review)
       .service(approve_action)
       .service(reject_action);
}
