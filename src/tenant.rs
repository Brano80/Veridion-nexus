use actix_web::{HttpMessage, HttpRequest};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Tenant context injected into request extensions by middleware
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantContext {
    pub tenant_id: Uuid,
    pub name: String,
    pub plan: String,
    pub mode: String,
    pub is_admin: bool,
}

/// Extract TenantContext from request extensions
pub fn get_tenant_context(req: &HttpRequest) -> Result<TenantContext, actix_web::Error> {
    req.extensions()
        .get::<TenantContext>()
        .cloned()
        .ok_or_else(|| {
            actix_web::error::ErrorUnauthorized(serde_json::json!({
                "error": "unauthorized",
                "message": "Tenant context not found"
            }))
        })
}

/// Helper function to compute SHA-256 hash of API key
pub fn sha256_hex(input: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Load admin tenant for dev bypass
pub async fn load_admin_tenant(pool: &sqlx::PgPool) -> Result<TenantContext, String> {
    #[derive(sqlx::FromRow)]
    struct TenantRow {
        id: Uuid,
        name: String,
        plan: String,
        mode: String,
        is_admin: bool,
    }

    let row: Option<TenantRow> = sqlx::query_as(
        "SELECT id, name, plan, mode, is_admin FROM tenants WHERE is_admin = true AND deleted_at IS NULL LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to load admin tenant: {}", e))?;

    match row {
        Some(t) => Ok(TenantContext {
            tenant_id: t.id,
            name: t.name,
            plan: t.plan,
            mode: t.mode,
            is_admin: t.is_admin,
        }),
        None => Err("Admin tenant not found".to_string()),
    }
}
