use actix_web::{web, HttpRequest, HttpResponse, get, post, patch, delete};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TenantRow {
    pub id: Uuid,
    pub name: String,
    pub plan: String,
    pub mode: String,
    pub api_key_hash: String,
    pub api_key_prefix: String,
    pub is_admin: bool,
    pub trial_expires_at: Option<DateTime<Utc>>,
    pub rate_limit_per_minute: i32,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct TenantResponse {
    pub id: Uuid,
    pub name: String,
    pub plan: String,
    pub mode: String,
    pub api_key_prefix: String,
    pub is_admin: bool,
    pub trial_expires_at: Option<String>,
    pub trial_status: String,
    pub rate_limit_per_minute: i32,
    pub evaluations_month: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

fn trial_status(trial_expires_at: Option<DateTime<Utc>>) -> String {
    match trial_expires_at {
        None => "active".to_string(),
        Some(t) if t > Utc::now() => "active".to_string(),
        Some(_) => "expired".to_string(),
    }
}

fn tenant_to_response(row: TenantRow, evals: i64) -> TenantResponse {
    TenantResponse {
        id: row.id,
        name: row.name,
        plan: row.plan,
        mode: row.mode,
        api_key_prefix: row.api_key_prefix,
        is_admin: row.is_admin,
        trial_expires_at: row.trial_expires_at.map(|t| t.to_rfc3339()),
        trial_status: trial_status(row.trial_expires_at),
        rate_limit_per_minute: row.rate_limit_per_minute,
        evaluations_month: evals,
        created_at: row.created_at.to_rfc3339(),
        deleted_at: row.deleted_at.map(|t| t.to_rfc3339()),
    }
}

fn extract_admin_check(req: &HttpRequest) -> Result<(), HttpResponse> {
    let auth = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !auth.starts_with("Bearer ") {
        return Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Missing Authorization header"
        })));
    }

    Ok(())
}

async fn verify_admin(req: &HttpRequest, pool: &PgPool) -> Result<Uuid, HttpResponse> {
    extract_admin_check(req)?;

    let bearer = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim_start_matches("Bearer ")
        .to_string();

    // JWT path: dashboard login sends JWT with is_admin in claims
    if bearer.starts_with("eyJ") {
        let secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "veridion-api-dev-secret-change-in-production".to_string());
        let key = jsonwebtoken::DecodingKey::from_secret(secret.as_ref());
        let validation = jsonwebtoken::Validation::default();
        let decoded = match jsonwebtoken::decode::<serde_json::Value>(&bearer, &key, &validation) {
            Ok(d) => d,
            Err(_) => {
                return Err(HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "Invalid or expired token"
                })));
            }
        };
        let is_admin = decoded.claims.get("is_admin").and_then(|v| v.as_bool()).unwrap_or(false);
        if !is_admin {
            return Err(HttpResponse::Forbidden().json(serde_json::json!({
                "error": "Admin access required"
            })));
        }
        let tenant_id_str = decoded.claims
            .get("tenant_id")
            .and_then(|v| v.as_str())
            .or_else(|| decoded.claims.get("company_id").and_then(|v| v.as_str()));
        let tenant_id = match tenant_id_str {
            Some(s) => Uuid::parse_str(s).map_err(|_| {
                HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "Invalid tenant in token"
                }))
            })?,
            None => {
                return Err(HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "Token missing tenant_id"
                })));
            }
        };
        return Ok(tenant_id);
    }

    // API key path: ss_test_/ss_live_ for programmatic admin access
    let mut hasher = Sha256::new();
    hasher.update(bearer.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let tenant: Option<(Uuid, bool)> = sqlx::query_as(
        "SELECT id, is_admin FROM tenants WHERE api_key_hash = $1 AND deleted_at IS NULL"
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("DB error: {}", e)
        }))
    })?;

    match tenant {
        Some((id, true)) => Ok(id),
        Some((_, false)) => Err(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "Admin access required"
        }))),
        None => Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid API key or token"
        }))),
    }
}

fn generate_api_key(prefix: &str) -> (String, String, String) {
    use std::time::{SystemTime, UNIX_EPOCH};

    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    let mut hasher = Sha256::new();
    hasher.update(seed.to_le_bytes());
    hasher.update(Uuid::new_v4().as_bytes());
    let random_hex: String = format!("{:x}", hasher.finalize());
    let hex_part = &random_hex[..32];

    let raw_key = format!("{}_{}", prefix, hex_part);
    let key_prefix = raw_key[..16.min(raw_key.len())].to_string();

    let mut hash = Sha256::new();
    hash.update(raw_key.as_bytes());
    let api_key_hash = format!("{:x}", hash.finalize());

    (raw_key, api_key_hash, key_prefix)
}

// ── GET /api/v1/admin/tenants ──

#[get("/api/v1/admin/tenants")]
pub async fn list_tenants(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let tenants: Vec<TenantRow> = match sqlx::query_as::<_, TenantRow>(
        "SELECT id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, \
         trial_expires_at, rate_limit_per_minute, deleted_at, created_at, updated_at \
         FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC"
    )
    .fetch_all(pool.get_ref())
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to list tenants: {}", e)
            }));
        }
    };

    let mut results = Vec::with_capacity(tenants.len());
    for tenant in tenants {
        let evals: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM compliance_records \
             WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())::timestamptz"
        )
        .bind(tenant.id)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

        results.push(tenant_to_response(tenant, evals));
    }

    HttpResponse::Ok().json(results)
}

// ── GET /api/v1/admin/tenants/{id} (detail view) ──

#[get("/api/v1/admin/tenants/{id}")]
pub async fn get_tenant_detail(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let tenant_id = path.into_inner();

    let tenant_row: Option<TenantRow> = sqlx::query_as::<_, TenantRow>(
        "SELECT id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, \
         trial_expires_at, rate_limit_per_minute, deleted_at, created_at, updated_at \
         FROM tenants WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let tenant_row = match tenant_row {
        Some(t) => t,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "Tenant not found"
            }));
        }
    };

    // Activity: evals this month, evals total, last activity
    let evals_month: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compliance_records \
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())::timestamptz"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let evals_total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compliance_records WHERE tenant_id = $1"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let last_activity: Option<DateTime<Utc>> = sqlx::query_scalar(
        "SELECT MAX(created_at) FROM compliance_records WHERE tenant_id = $1"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .ok()
    .flatten();

    // Transfer Summary: total, blocked, allowed, pending review (from evidence_events)
    let total_transfers: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let blocked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield' AND event_type = 'DATA_TRANSFER_BLOCKED'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let allowed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield' AND event_type = 'DATA_TRANSFER'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let pending_review: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM evidence_events WHERE tenant_id = $1 AND source_system = 'sovereign-shield' AND event_type = 'DATA_TRANSFER_REVIEW'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    // SCC Registry: active SCCs
    #[derive(sqlx::FromRow)]
    struct SccRow {
        partner_name: String,
        destination_country_code: String,
        expires_at: Option<DateTime<Utc>>,
        scc_module: Option<String>,
    }

    let scc_rows: Vec<SccRow> = sqlx::query_as(
        "SELECT partner_name, destination_country_code, expires_at, scc_module \
         FROM scc_registries WHERE tenant_id = $1 AND status = 'active' \
         ORDER BY partner_name, destination_country_code"
    )
    .bind(tenant_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let scc_registry: Vec<serde_json::Value> = scc_rows.iter().map(|r| {
        serde_json::json!({
            "partnerName": r.partner_name,
            "country": r.destination_country_code,
            "expiry": r.expires_at.map(|t| t.to_rfc3339()),
            "module": r.scc_module,
        })
    }).collect();

    // Review Queue: pending count, overdue count (pending and created_at < NOW() - 24h)
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM human_oversight WHERE tenant_id = $1 AND status = 'PENDING'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let overdue_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM human_oversight WHERE tenant_id = $1 AND status = 'PENDING' AND created_at < NOW() - INTERVAL '24 hours'"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let account = serde_json::json!({
        "name": tenant_row.name,
        "plan": tenant_row.plan,
        "mode": tenant_row.mode,
        "trialStatus": trial_status(tenant_row.trial_expires_at),
        "trialExpiry": tenant_row.trial_expires_at.map(|t| t.to_rfc3339()),
        "createdAt": tenant_row.created_at.to_rfc3339(),
        "apiKeyPrefix": tenant_row.api_key_prefix,
    });

    let activity = serde_json::json!({
        "evalsThisMonth": evals_month,
        "evalsTotal": evals_total,
        "lastActivityAt": last_activity.map(|t| t.to_rfc3339()),
    });

    let transfer_summary = serde_json::json!({
        "total": total_transfers,
        "blocked": blocked,
        "allowed": allowed,
        "pendingReview": pending_review,
    });

    HttpResponse::Ok().json(serde_json::json!({
        "account": account,
        "activity": activity,
        "transferSummary": transfer_summary,
        "sccRegistry": scc_registry,
        "reviewQueue": {
            "pendingCount": pending_count,
            "overdueCount": overdue_count,
        },
    }))
}

// ── GET /api/v1/admin/stats ──

#[get("/api/v1/admin/stats")]
pub async fn admin_stats(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let active_trials: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND plan = 'free_trial' \
         AND (trial_expires_at IS NULL OR trial_expires_at > NOW())"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let pro: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND plan = 'pro'"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let evals_month: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compliance_records cr \
         INNER JOIN tenants t ON cr.tenant_id = t.id AND t.deleted_at IS NULL \
         WHERE cr.created_at >= date_trunc('month', NOW())::timestamptz"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    HttpResponse::Ok().json(serde_json::json!({
        "total_tenants": total,
        "active_trials": active_trials,
        "pro_tenants": pro,
        "total_evaluations_month": evals_month,
    }))
}

// ── POST /api/v1/admin/tenants ──

#[derive(Deserialize)]
pub struct CreateTenantRequest {
    pub name: String,
    pub plan: Option<String>,
    pub mode: Option<String>,
    pub trial_days: Option<i64>,
}

#[post("/api/v1/admin/tenants")]
pub async fn create_tenant(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<CreateTenantRequest>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let plan = body.plan.as_deref().unwrap_or("free_trial");
    let mode = body.mode.as_deref().unwrap_or("shadow");
    let trial_days = body.trial_days.unwrap_or(30);

    let trial_expires_at: Option<DateTime<Utc>> = if trial_days <= 0 {
        None
    } else {
        Some(Utc::now() + chrono::Duration::days(trial_days))
    };

    let (raw_key, api_key_hash, key_prefix) = generate_api_key("ss_test");

    let tenant: TenantRow = match sqlx::query_as::<_, TenantRow>(
        "INSERT INTO tenants (name, plan, mode, api_key_hash, api_key_prefix, trial_expires_at) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         RETURNING id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, \
         trial_expires_at, rate_limit_per_minute, deleted_at, created_at, updated_at"
    )
    .bind(&body.name)
    .bind(plan)
    .bind(mode)
    .bind(&api_key_hash)
    .bind(&key_prefix)
    .bind(trial_expires_at)
    .fetch_one(pool.get_ref())
    .await
    {
        Ok(t) => t,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create tenant: {}", e)
            }));
        }
    };

    // Seed system_settings so dashboard toggle and admin stay in sync
    let _ = sqlx::query(
        "INSERT INTO system_settings (tenant_id, key, value, updated_at) VALUES ($1, 'enforcement_mode', $2, NOW())"
    )
    .bind(tenant.id)
    .bind(mode)
    .execute(pool.get_ref())
    .await;

    let mut resp = serde_json::to_value(tenant_to_response(tenant, 0)).unwrap();
    resp["api_key_raw"] = serde_json::Value::String(raw_key);
    HttpResponse::Created().json(resp)
}

// ── PATCH /api/v1/admin/tenants/{id} ──

#[derive(Deserialize)]
pub struct UpdateTenantRequest {
    pub plan: Option<String>,
    pub mode: Option<String>,
    pub trial_expires_at: Option<Option<String>>,
    pub rate_limit_per_minute: Option<i32>,
}

#[patch("/api/v1/admin/tenants/{id}")]
pub async fn update_tenant(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateTenantRequest>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let tenant_id = path.into_inner();

    let existing: Option<TenantRow> = sqlx::query_as::<_, TenantRow>(
        "SELECT id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, \
         trial_expires_at, rate_limit_per_minute, deleted_at, created_at, updated_at \
         FROM tenants WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let existing = match existing {
        Some(t) => t,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "Tenant not found"
            }));
        }
    };

    let plan = body.plan.as_deref().unwrap_or(&existing.plan);
    let mode = body.mode.as_deref().unwrap_or(&existing.mode);
    let rate_limit = body.rate_limit_per_minute.unwrap_or(existing.rate_limit_per_minute);

    let trial_expires_at: Option<DateTime<Utc>> = match &body.trial_expires_at {
        Some(Some(s)) => match s.parse::<DateTime<Utc>>() {
            Ok(dt) => Some(dt),
            Err(_) => {
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Invalid trial_expires_at format (expected ISO 8601)"
                }));
            }
        },
        Some(None) => None,
        None => existing.trial_expires_at,
    };

    let updated: TenantRow = match sqlx::query_as::<_, TenantRow>(
        "UPDATE tenants SET plan = $1, mode = $2, trial_expires_at = $3, \
         rate_limit_per_minute = $4, updated_at = NOW() \
         WHERE id = $5 AND deleted_at IS NULL \
         RETURNING id, name, plan, mode, api_key_hash, api_key_prefix, is_admin, \
         trial_expires_at, rate_limit_per_minute, deleted_at, created_at, updated_at"
    )
    .bind(plan)
    .bind(mode)
    .bind(trial_expires_at)
    .bind(rate_limit)
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    {
        Ok(t) => t,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to update tenant: {}", e)
            }));
        }
    };

    let evals: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compliance_records \
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())::timestamptz"
    )
    .bind(tenant_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    // Sync system_settings when mode changes so dashboard toggle shows correct
    if body.mode.is_some() {
        let upd = sqlx::query(
            "UPDATE system_settings SET value = $1, updated_at = NOW() WHERE tenant_id = $2 AND key = 'enforcement_mode'"
        )
        .bind(mode)
        .bind(tenant_id)
        .execute(pool.get_ref())
        .await;
        if let Ok(res) = upd {
            if res.rows_affected() == 0 {
                let _ = sqlx::query(
                    "INSERT INTO system_settings (tenant_id, key, value, updated_at) VALUES ($1, 'enforcement_mode', $2, NOW())"
                )
                .bind(tenant_id)
                .bind(mode)
                .execute(pool.get_ref())
                .await;
            }
        }
    }

    HttpResponse::Ok().json(tenant_to_response(updated, evals))
}

// ── DELETE /api/v1/admin/tenants/{id} ──

#[delete("/api/v1/admin/tenants/{id}")]
pub async fn delete_tenant(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let tenant_id = path.into_inner();

    let tenant: Option<(bool,)> = sqlx::query_as(
        "SELECT is_admin FROM tenants WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    match tenant {
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "Tenant not found"
            }));
        }
        Some((true,)) => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Cannot delete the admin tenant"
            }));
        }
        Some((false,)) => {}
    }

    match sqlx::query(
        "UPDATE tenants SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1"
    )
    .bind(tenant_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to delete tenant: {}", e)
        })),
    }
}

// ── POST /api/v1/admin/tenants/{id}/rotate-api-key ──

#[post("/api/v1/admin/tenants/{id}/rotate-api-key")]
pub async fn rotate_api_key(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    if let Err(e) = verify_admin(&req, pool.get_ref()).await {
        return e;
    }

    let tenant_id = path.into_inner();

    let existing_prefix: Option<(String,)> = sqlx::query_as(
        "SELECT api_key_prefix FROM tenants WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let prefix_type = match existing_prefix {
        Some((p,)) if p.starts_with("ss_live") => "ss_live",
        Some(_) => "ss_test",
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "Tenant not found"
            }));
        }
    };

    let (raw_key, api_key_hash, key_prefix) = generate_api_key(prefix_type);

    match sqlx::query(
        "UPDATE tenants SET api_key_hash = $1, api_key_prefix = $2, updated_at = NOW() \
         WHERE id = $3 AND deleted_at IS NULL"
    )
    .bind(&api_key_hash)
    .bind(&key_prefix)
    .bind(tenant_id)
    .execute(pool.get_ref())
    .await
    {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "api_key_prefix": key_prefix,
            "api_key_raw": raw_key
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to rotate API key: {}", e)
        })),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_tenant_detail)
       .service(list_tenants)
       .service(admin_stats)
       .service(create_tenant)
       .service(update_tenant)
       .service(delete_tenant)
       .service(rotate_api_key);
}
