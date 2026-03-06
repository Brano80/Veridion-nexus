use actix_web::{web, HttpRequest, HttpResponse, post};
use chrono::{Duration, Utc};
use rand::Rng;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::Instant;

use crate::email::EmailConfig;

const MAX_SIGNUPS_PER_HOUR: usize = 5;

pub struct SignupRateLimiter {
    attempts: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}

impl SignupRateLimiter {
    pub fn new() -> Self {
        Self {
            attempts: Mutex::new(HashMap::new()),
        }
    }

    fn check_and_record(&self, ip: IpAddr) -> bool {
        let mut map = self.attempts.lock().unwrap();
        let now = Instant::now();
        let one_hour = std::time::Duration::from_secs(3600);

        let entries = map.entry(ip).or_default();
        entries.retain(|t| now.duration_since(*t) < one_hour);

        if entries.len() >= MAX_SIGNUPS_PER_HOUR {
            return false;
        }

        entries.push(now);
        true
    }
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub company_name: String,
    pub email: String,
    pub password: String,
}

fn is_valid_email(email: &str) -> bool {
    let parts: Vec<&str> = email.splitn(2, '@').collect();
    if parts.len() != 2 {
        return false;
    }
    let local = parts[0];
    let domain = parts[1];
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    if !domain.contains('.') {
        return false;
    }
    let domain_parts: Vec<&str> = domain.split('.').collect();
    if domain_parts.last().map_or(true, |tld| tld.len() < 2) {
        return false;
    }
    true
}

fn generate_api_key() -> (String, String, String) {
    let mut rng = rand::thread_rng();
    let hex_chars: Vec<u8> = (0..32).map(|_| rng.gen_range(0..16u8)).collect();
    let hex_str: String = hex_chars.iter().map(|b| format!("{:x}", b)).collect();

    let raw_key = format!("ss_test_{}", hex_str);
    let prefix = raw_key[..20].to_string();

    let mut hasher = Sha256::new();
    hasher.update(raw_key.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    (raw_key, hash, prefix)
}

fn extract_client_ip(req: &HttpRequest) -> IpAddr {
    req.headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse().ok())
        .or_else(|| req.peer_addr().map(|a| a.ip()))
        .unwrap_or_else(|| "127.0.0.1".parse().unwrap())
}

async fn generate_username(pool: &PgPool, email: &str) -> String {
    let base: String = email
        .split('@')
        .next()
        .unwrap_or("user")
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect();

    let base = if base.is_empty() {
        "user".to_string()
    } else {
        base
    };

    let exists: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE username = $1")
            .bind(&base)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    if exists.is_none() {
        return base;
    }

    let mut rng = rand::thread_rng();
    for _ in 0..5 {
        let suffix: u16 = rng.gen_range(1000..9999);
        let candidate = format!("{}_{}", base, suffix);
        let exists: Option<(uuid::Uuid,)> =
            sqlx::query_as("SELECT id FROM users WHERE username = $1")
                .bind(&candidate)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten();
        if exists.is_none() {
            return candidate;
        }
    }

    format!("{}_{}", base, uuid::Uuid::new_v4().to_string().split('-').next().unwrap())
}

#[post("/api/v1/auth/register")]
pub async fn register(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    rate_limiter: web::Data<SignupRateLimiter>,
    body: web::Json<RegisterRequest>,
) -> HttpResponse {
    // Validate inputs
    if body.company_name.trim().len() < 2 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "company_name_required",
            "message": "Company name is required (minimum 2 characters)"
        }));
    }

    if !is_valid_email(&body.email) {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_email",
            "message": "A valid email address is required"
        }));
    }

    if body.password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "password_too_short",
            "message": "Password must be at least 8 characters"
        }));
    }

    // Rate limiting
    let client_ip = extract_client_ip(&req);
    if !rate_limiter.check_and_record(client_ip) {
        return HttpResponse::TooManyRequests().json(serde_json::json!({
            "error": "rate_limit_exceeded",
            "message": "Too many signup attempts. Please try again later."
        }));
    }

    // Check email uniqueness
    let email_exists: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(&body.email)
            .fetch_optional(pool.get_ref())
            .await
            .unwrap_or(None);

    if email_exists.is_some() {
        return HttpResponse::Conflict().json(serde_json::json!({
            "error": "email_taken",
            "message": "An account with this email already exists"
        }));
    }

    // Generate API key
    let (api_key_raw, api_key_hash, api_key_prefix) = generate_api_key();

    // Generate username
    let username = generate_username(pool.get_ref(), &body.email).await;

    // Hash password
    let password_hash = match bcrypt::hash(&body.password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => {
            log::error!("bcrypt hash error: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to process registration"
            }));
        }
    };

    let trial_expires_at = Utc::now() + Duration::days(30);

    // DB transaction: create tenant + user atomically
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            log::error!("Failed to begin transaction: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to process registration"
            }));
        }
    };

    let tenant_id: uuid::Uuid = match sqlx::query_scalar(
        "INSERT INTO tenants (name, plan, mode, api_key_hash, api_key_prefix, trial_expires_at, is_admin) \
         VALUES ($1, 'free_trial', 'shadow', $2, $3, $4, false) \
         RETURNING id"
    )
    .bind(body.company_name.trim())
    .bind(&api_key_hash)
    .bind(&api_key_prefix)
    .bind(trial_expires_at)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            log::error!("Failed to create tenant: {}", e);
            let _ = tx.rollback().await;
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to process registration"
            }));
        }
    };

    if let Err(e) = sqlx::query(
        "INSERT INTO users (username, email, password_hash, company_id, active, onboarded) \
         VALUES ($1, $2, $3, $4, true, false)"
    )
    .bind(&username)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(tenant_id)
    .execute(&mut *tx)
    .await
    {
        log::error!("Failed to create user: {}", e);
        let _ = tx.rollback().await;
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "internal_error",
            "message": "Failed to process registration"
        }));
    }

    if let Err(e) = tx.commit().await {
        log::error!("Failed to commit transaction: {}", e);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "internal_error",
            "message": "Failed to process registration"
        }));
    }

    // Send welcome email (async, non-blocking)
    let email_to = body.email.clone();
    let company = body.company_name.clone();
    let key_for_email = api_key_raw.clone();
    let trial_str = trial_expires_at.format("%Y-%m-%d").to_string();

    tokio::spawn(async move {
        if let Some(config) = EmailConfig::from_env() {
            match crate::email::send_welcome_email(
                &config,
                &email_to,
                &company,
                &key_for_email,
                &trial_str,
            )
            .await
            {
                Ok(()) => log::info!("Welcome email sent to {}", email_to),
                Err(e) => log::error!("Failed to send welcome email to {}: {}", email_to, e),
            }
        } else {
            log::warn!("SMTP not configured — skipping welcome email for {}", email_to);
        }
    });

    HttpResponse::Created().json(serde_json::json!({
        "tenant_id": tenant_id,
        "api_key_raw": api_key_raw,
        "api_key_prefix": api_key_prefix,
        "trial_expires_at": trial_expires_at.to_rfc3339(),
        "email": body.email,
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(register);
}
