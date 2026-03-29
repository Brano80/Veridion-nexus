use actix_web::{web, HttpRequest, HttpResponse, post};
use chrono::{Duration, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::HashMap;
use std::env;
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

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    pub remember_me: Option<bool>,
}

#[derive(Serialize)]
struct LoginUserResponse {
    id: String,
    email: String,
    username: String,
    company_id: Option<String>,
    is_admin: bool,
    roles: Vec<String>,
    onboarded: bool,
}

#[derive(Serialize)]
struct LoginTenantResponse {
    id: String,
    name: String,
    plan: String,
    mode: String,
    trial_expires_at: Option<String>,
}

#[derive(Serialize)]
struct LoginSuccessResponse {
    token: String,
    user: LoginUserResponse,
    tenant: LoginTenantResponse,
}

#[post("/api/v1/auth/login")]
pub async fn login(
    pool: web::Data<PgPool>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    let email = body.email.trim();
    let password = &body.password;

    if email.is_empty() || password.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "missing_fields",
            "message": "Email and password are required"
        }));
    }

    #[derive(sqlx::FromRow)]
    struct UserRow {
        id: uuid::Uuid,
        username: String,
        email: String,
        password_hash: String,
        company_id: Option<uuid::Uuid>,
        onboarded: bool,
    }

    let user: Option<UserRow> = sqlx::query_as(
        "SELECT id, username, email, password_hash, company_id, onboarded \
         FROM users WHERE email = $1 AND active = true"
    )
    .bind(email)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let user = match user {
        Some(u) => u,
        None => {
            log::debug!("Login failed: user not found for email: {}", email);
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "invalid_credentials",
                "message": "Invalid email or password"
            }));
        }
    };

    // Trim any whitespace from the hash (database might have trailing spaces)
    let hash_trimmed = user.password_hash.trim();
    
    // Validate hash format (bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars)
    if !hash_trimmed.starts_with("$2") || hash_trimmed.len() != 60 {
        log::error!("Invalid bcrypt hash format for email {}: length={}, prefix={}", 
                   email, hash_trimmed.len(), &hash_trimmed[..hash_trimmed.len().min(7)]);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "internal_error",
            "message": "Invalid password hash format"
        }));
    }
    
    log::debug!("Login attempt for email: {}, hash prefix: {}...", email, &hash_trimmed[..7]);
    log::debug!("Password length: {}, Hash length: {}", password.len(), hash_trimmed.len());
    
    let password_valid = match bcrypt::verify(password, hash_trimmed) {
        Ok(valid) => {
            log::info!("bcrypt::verify result for {}: {}", email, valid);
            valid
        }
        Err(e) => {
            log::error!("bcrypt::verify error for email {}: {} (hash prefix: {})", 
                       email, e, &hash_trimmed[..7]);
            false
        }
    };
    
    if !password_valid {
        log::warn!("Login failed: invalid password for email: {}", email);
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "invalid_credentials",
            "message": "Invalid email or password"
        }));
    }

    let company_id = match user.company_id {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "no_tenant",
                "message": "No tenant associated with this account"
            }));
        }
    };

    #[derive(sqlx::FromRow)]
    struct TenantRow {
        id: uuid::Uuid,
        name: String,
        plan: String,
        mode: String,
        is_admin: bool,
        trial_expires_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let tenant: Option<TenantRow> = sqlx::query_as(
        "SELECT id, name, plan, mode, is_admin, trial_expires_at \
         FROM tenants WHERE id = $1 AND deleted_at IS NULL"
    )
    .bind(company_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let tenant = match tenant {
        Some(t) => t,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "invalid_credentials",
                "message": "Invalid email or password"
            }));
        }
    };

    if tenant.plan == "free_trial" {
        if let Some(expires_at) = tenant.trial_expires_at {
            if expires_at < Utc::now() {
                return HttpResponse::PaymentRequired().json(serde_json::json!({
                    "error": "trial_expired",
                    "message": "Your trial has expired. Contact hello@veridion-nexus.eu to upgrade.",
                    "upgrade_url": "https://veridion-nexus.eu"
                }));
            }
        }
    }

    let roles = if tenant.is_admin {
        vec!["admin".to_string(), "editor".to_string()]
    } else {
        vec!["editor".to_string()]
    };

    let secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "veridion-api-dev-secret-change-in-production".to_string());

    let now = Utc::now();
    let remember = body.remember_me.unwrap_or(false);
    let exp_hours = if remember { 24 * 30 } else { 24 };
    let exp = (now + Duration::hours(exp_hours)).timestamp() as usize;

    let token = match jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &serde_json::json!({
            "sub": user.id.to_string(),
            "username": user.username,
            "email": user.email,
            "company_id": tenant.id.to_string(),
            "roles": roles,
            "is_admin": tenant.is_admin,
            "tenant_id": tenant.id.to_string(),
            "plan": tenant.plan,
            "mode": tenant.mode,
            "onboarded": user.onboarded,
            "exp": exp,
            "iat": now.timestamp() as usize
        }),
        &jsonwebtoken::EncodingKey::from_secret(secret.as_ref()),
    ) {
        Ok(t) => t,
        Err(e) => {
            log::error!("JWT encode error: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to generate token"
            }));
        }
    };

    HttpResponse::Ok().json(LoginSuccessResponse {
        token,
        user: LoginUserResponse {
            id: user.id.to_string(),
            email: user.email,
            username: user.username,
            company_id: Some(tenant.id.to_string()),
            is_admin: tenant.is_admin,
            roles,
            onboarded: user.onboarded,
        },
        tenant: LoginTenantResponse {
            id: tenant.id.to_string(),
            name: tenant.name,
            plan: tenant.plan,
            mode: tenant.mode,
            trial_expires_at: tenant.trial_expires_at.map(|t| t.to_rfc3339()),
        },
    })
}

#[post("/api/v1/auth/logout")]
pub async fn logout() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "message": "Logged out successfully"
    }))
}

fn sha256_hex_string(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn generate_password_reset_raw_token() -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

const FORGOT_PASSWORD_RESPONSE: &str = "If that email exists, a reset link has been sent";
const MAX_PASSWORD_RESET_EMAILS_PER_HOUR: i64 = 3;

#[derive(Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[post("/api/v1/auth/forgot-password")]
pub async fn forgot_password(
    pool: web::Data<PgPool>,
    body: web::Json<ForgotPasswordRequest>,
) -> HttpResponse {
    let email = body.email.trim();
    if email.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "message": FORGOT_PASSWORD_RESPONSE
        }));
    }

    #[derive(sqlx::FromRow)]
    struct UserIdRow {
        id: uuid::Uuid,
    }

    let user: Option<UserIdRow> = sqlx::query_as(
        "SELECT id FROM users WHERE email = $1 AND active = true",
    )
    .bind(email)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let Some(user) = user else {
        return HttpResponse::Ok().json(serde_json::json!({
            "message": FORGOT_PASSWORD_RESPONSE
        }));
    };

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM password_reset_tokens \
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
    )
    .bind(user.id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    if count >= MAX_PASSWORD_RESET_EMAILS_PER_HOUR {
        return HttpResponse::Ok().json(serde_json::json!({
            "message": FORGOT_PASSWORD_RESPONSE
        }));
    }

    let raw_token = generate_password_reset_raw_token();
    let token_hash = sha256_hex_string(&raw_token);
    let expires_at = Utc::now() + Duration::hours(1);

    if let Err(e) = sqlx::query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) \
         VALUES ($1, $2, $3)",
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(pool.get_ref())
    .await
    {
        log::error!("password_reset_tokens insert: {}", e);
        return HttpResponse::Ok().json(serde_json::json!({
            "message": FORGOT_PASSWORD_RESPONSE
        }));
    }

    let email_to = email.to_string();
    tokio::spawn(async move {
        if let Some(config) = EmailConfig::from_env() {
            let reset_url =
                format!("https://veridion-nexus.eu/reset-password?token={}", raw_token);
            match crate::email::send_password_reset_email(&config, &email_to, &reset_url).await {
                Ok(()) => log::info!("Password reset email queued for {}", email_to),
                Err(err) => log::error!("Failed to send password reset email: {}", err),
            }
        } else {
            log::warn!("SMTP not configured — password reset email not sent for {}", email_to);
        }
    });

    HttpResponse::Ok().json(serde_json::json!({
        "message": FORGOT_PASSWORD_RESPONSE
    }))
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[post("/api/v1/auth/reset-password")]
pub async fn reset_password(
    pool: web::Data<PgPool>,
    body: web::Json<ResetPasswordRequest>,
) -> HttpResponse {
    if body.new_password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "password_too_short",
            "message": "Password must be at least 8 characters"
        }));
    }

    let token_trimmed = body.token.trim();
    if token_trimmed.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_or_expired_token",
            "message": "This link has expired or already been used"
        }));
    }

    let token_hash = sha256_hex_string(token_trimmed);

    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            log::error!("reset_password begin tx: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to reset password"
            }));
        }
    };

    #[derive(sqlx::FromRow)]
    struct TokenRow {
        id: uuid::Uuid,
        user_id: uuid::Uuid,
    }

    let row: Option<TokenRow> = sqlx::query_as(
        "SELECT id, user_id FROM password_reset_tokens \
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() \
         FOR UPDATE",
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await
    .ok()
    .flatten();

    let Some(row) = row else {
        let _ = tx.rollback().await;
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_or_expired_token",
            "message": "This link has expired or already been used"
        }));
    };

    let password_hash = match bcrypt::hash(&body.new_password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => {
            let _ = tx.rollback().await;
            log::error!("bcrypt hash error: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to reset password"
            }));
        }
    };

    let updated = match sqlx::query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND active = true",
    )
    .bind(&password_hash)
    .bind(row.user_id)
    .execute(&mut *tx)
    .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            let _ = tx.rollback().await;
            log::error!("reset_password update user: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to reset password"
            }));
        }
    };

    if updated == 0 {
        let _ = tx.rollback().await;
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_or_expired_token",
            "message": "This link has expired or already been used"
        }));
    }

    if let Err(e) = sqlx::query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1")
        .bind(row.id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        log::error!("reset_password update token: {}", e);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "internal_error",
            "message": "Failed to reset password"
        }));
    }

    if let Err(e) = tx.commit().await {
        log::error!("reset_password commit: {}", e);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "internal_error",
            "message": "Failed to reset password"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "message": "Password reset successfully"
    }))
}

#[derive(Deserialize)]
pub struct DevResetPasswordRequest {
    pub username: String,
    pub new_password: String,
}

#[post("/api/v1/auth/dev-reset-password")]
pub async fn dev_reset_password(
    pool: web::Data<PgPool>,
    body: web::Json<DevResetPasswordRequest>,
) -> HttpResponse {
    // Only allow in development
    if env::var("RUST_ENV").unwrap_or_else(|_| "development".into()) != "development" {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Endpoint not available"
        }));
    }

    // Validate inputs
    if body.username.trim().is_empty() || body.new_password.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "missing_fields",
            "message": "username and new_password are required"
        }));
    }

    if body.new_password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "password_too_short",
            "message": "Password must be at least 8 characters"
        }));
    }

    // Generate hash using the SAME bcrypt crate and cost as registration
    let password_hash = match bcrypt::hash(&body.new_password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => {
            log::error!("bcrypt hash error: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to generate password hash"
            }));
        }
    };

    // Update the user's password hash
    let rows_affected = match sqlx::query(
        "UPDATE users SET password_hash = $1 WHERE username = $2 AND active = true"
    )
    .bind(&password_hash)
    .bind(body.username.trim())
    .execute(pool.get_ref())
    .await
    {
        Ok(result) => result.rows_affected(),
        Err(e) => {
            log::error!("Failed to update password: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Failed to update password"
            }));
        }
    };

    if rows_affected == 0 {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "user_not_found",
            "message": format!("User '{}' not found or inactive", body.username)
        }));
    }

    log::info!("Password reset for user: {}", body.username);

    HttpResponse::Ok().json(serde_json::json!({
        "message": "Password reset",
        "hash": password_hash
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(register)
       .service(login)
       .service(logout)
       .service(forgot_password)
       .service(reset_password)
       .service(dev_reset_password);
}
