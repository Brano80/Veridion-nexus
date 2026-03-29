use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{Error, HttpMessage};
use futures_util::future::{ok, LocalBoxFuture, Ready};
use std::rc::Rc;
use std::env;

use crate::tenant::{sha256_hex, load_admin_tenant, TenantContext};

pub struct TenantAuthMiddleware {
    pool: sqlx::PgPool,
}

impl TenantAuthMiddleware {
    pub fn new(pool: sqlx::PgPool) -> Self {
        Self { pool }
    }
}

impl<S, B> Transform<S, ServiceRequest> for TenantAuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = TenantAuthMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(TenantAuthMiddlewareService {
            service: Rc::new(service),
            pool: self.pool.clone(),
        })
    }
}

pub struct TenantAuthMiddlewareService<S> {
    service: Rc<S>,
    pool: sqlx::PgPool,
}

impl<S, B> Service<ServiceRequest> for TenantAuthMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let pool = self.pool.clone();
        let service = self.service.clone();

        Box::pin(async move {
            let path = req.path().to_string();

            // Exempted routes — pass through without auth
            if path == "/health"
                || path == "/"
                || path == "/api/v1/auth/dev-bypass"
                || path == "/api/v1/auth/register"
                || path == "/api/v1/auth/login"
                || path == "/api/v1/auth/logout"
                || path == "/api/v1/auth/forgot-password"
                || path == "/api/v1/auth/reset-password"
                || path == "/api/v1/auth/dev-reset-password"
                || !path.starts_with("/api/v1/")
            {
                return service.call(req).await;
            }

            let is_dev = std::env::var("RUST_ENV")
                .unwrap_or_else(|_| "development".into())
                == "development";

            let auth_header = req
                .headers()
                .get("Authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(|s| s.trim().to_string());

            // Dev bypass: no auth header in development → load admin tenant
            if is_dev && auth_header.is_none() {
                match load_admin_tenant(&pool).await {
                    Ok(tenant) => {
                        req.extensions_mut().insert(tenant);
                        return service.call(req).await;
                    }
                    Err(e) => {
                        log::warn!("Dev bypass failed: {}", e);
                        return Err(actix_web::error::ErrorUnauthorized(
                            serde_json::json!({
                                "error": "unauthorized",
                                "message": "API key required"
                            })
                            .to_string(),
                        ));
                    }
                }
            }

            // Require auth header
            let auth_value = match auth_header {
                Some(k) => k,
                None => {
                    return Err(actix_web::error::ErrorUnauthorized(
                        serde_json::json!({
                            "error": "unauthorized",
                            "message": "Missing Authorization header"
                        })
                        .to_string(),
                    ));
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

            // Determine if this is an API key or JWT token
            let t: TenantRow = if auth_value.starts_with("ss_test_") || auth_value.starts_with("ss_live_") {
                // API key path: hash and look up tenant
                let key_hash = sha256_hex(&auth_value);

                let tenant_row: Option<TenantRow> = sqlx::query_as(
                    "SELECT id, name, plan, mode, is_admin, trial_expires_at \
                     FROM tenants WHERE api_key_hash = $1 AND deleted_at IS NULL",
                )
                .bind(&key_hash)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();

                match tenant_row {
                    Some(t) => t,
                    None => {
                        return Err(actix_web::error::ErrorUnauthorized(
                            serde_json::json!({
                                "error": "unauthorized",
                                "message": "Invalid API key"
                            })
                            .to_string(),
                        ));
                    }
                }
            } else if auth_value.starts_with("eyJ") {
                // JWT token path: decode and extract tenant_id
                let secret = env::var("JWT_SECRET")
                    .unwrap_or_else(|_| "veridion-api-dev-secret-change-in-production".to_string());

                let validation = jsonwebtoken::Validation::default();
                let decoded = match jsonwebtoken::decode::<serde_json::Value>(
                    &auth_value,
                    &jsonwebtoken::DecodingKey::from_secret(secret.as_ref()),
                    &validation,
                ) {
                    Ok(d) => d,
                    Err(e) => {
                        log::debug!("JWT decode error: {}", e);
                        return Err(actix_web::error::ErrorUnauthorized(
                            serde_json::json!({
                                "error": "unauthorized",
                                "message": "Invalid or expired token"
                            })
                            .to_string(),
                        ));
                    }
                };

                // Extract tenant_id from claims
                let tenant_id_str = decoded.claims
                    .get("tenant_id")
                    .and_then(|v| v.as_str())
                    .or_else(|| decoded.claims.get("company_id").and_then(|v| v.as_str()));

                let tenant_id = match tenant_id_str {
                    Some(id_str) => match uuid::Uuid::parse_str(id_str) {
                        Ok(id) => id,
                        Err(_) => {
                            return Err(actix_web::error::ErrorUnauthorized(
                                serde_json::json!({
                                    "error": "unauthorized",
                                    "message": "Invalid tenant ID in token"
                                })
                                .to_string(),
                            ));
                        }
                    },
                    None => {
                        return Err(actix_web::error::ErrorUnauthorized(
                            serde_json::json!({
                                "error": "unauthorized",
                                "message": "Token missing tenant_id"
                            })
                            .to_string(),
                        ));
                    }
                };

                // Load tenant from database using tenant_id
                let tenant_row: Option<TenantRow> = sqlx::query_as(
                    "SELECT id, name, plan, mode, is_admin, trial_expires_at \
                     FROM tenants WHERE id = $1 AND deleted_at IS NULL",
                )
                .bind(tenant_id)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();

                match tenant_row {
                    Some(t) => t,
                    None => {
                        return Err(actix_web::error::ErrorUnauthorized(
                            serde_json::json!({
                                "error": "unauthorized",
                                "message": "Tenant not found"
                            })
                            .to_string(),
                        ));
                    }
                }
            } else {
                // Unknown format
                return Err(actix_web::error::ErrorUnauthorized(
                    serde_json::json!({
                        "error": "unauthorized",
                        "message": "Invalid authorization format. Use API key (ss_test_/ss_live_) or JWT token"
                    })
                    .to_string(),
                ));
            };

            // Check trial expiry for free_trial plans
            if t.plan == "free_trial" {
                if let Some(expires_at) = t.trial_expires_at {
                    if expires_at < chrono::Utc::now() {
                        return Err(actix_web::error::ErrorPaymentRequired(
                            serde_json::json!({
                                "error": "trial_expired",
                                "message": "Free trial has expired"
                            })
                            .to_string(),
                        ));
                    }
                }
            }

            // Inject TenantContext into request extensions
            req.extensions_mut().insert(TenantContext {
                tenant_id: t.id,
                name: t.name,
                plan: t.plan,
                mode: t.mode,
                is_admin: t.is_admin,
            });

            service.call(req).await
        })
    }
}
