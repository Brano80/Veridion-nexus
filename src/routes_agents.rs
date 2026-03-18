use actix_web::{web, HttpRequest, HttpResponse, get, post};
use serde::Deserialize;
use sha2::{Sha256, Digest};
use sqlx::PgPool;

use crate::tenant::get_tenant_context;

fn generate_agent_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let hex: String = (0..12).map(|_| format!("{:x}", rng.gen::<u8>() % 16)).collect();
    format!("agt_{}", hex)
}

fn generate_agent_api_key() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let hex: String = (0..32).map(|_| format!("{:x}", rng.gen::<u8>() % 16)).collect();
    format!("agt_key_{}", hex)
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn compute_policy_hash(categories: &serde_json::Value, countries: &serde_json::Value, partners: &serde_json::Value) -> String {
    let combined = serde_json::json!({
        "allowed_data_categories": categories,
        "allowed_destination_countries": countries,
        "allowed_partners": partners,
    });
    let canonical = serde_json::to_string(&combined).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

#[derive(Deserialize)]
pub struct RegisterAgentRequest {
    pub name: String,
    pub description: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub url: Option<String>,
    pub provider_org: Option<String>,
    pub provider_url: Option<String>,
    #[serde(default)]
    pub allowed_data_categories: Vec<String>,
    #[serde(default)]
    pub allowed_destination_countries: Vec<String>,
    #[serde(default)]
    pub allowed_partners: Vec<String>,
}

fn default_version() -> String { "1.0.0".to_string() }

#[derive(sqlx::FromRow)]
struct AgentRow {
    id: String,
    tenant_id: uuid::Uuid,
    name: String,
    description: String,
    version: String,
    url: Option<String>,
    provider_org: Option<String>,
    provider_url: Option<String>,
    allowed_data_categories: serde_json::Value,
    allowed_destination_countries: serde_json::Value,
    allowed_partners: serde_json::Value,
    trust_level: i32,
    status: String,
    #[sqlx(default)]
    api_key_hash: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
struct PolicyVersionRow {
    id: i32,
    agent_id: String,
    version_number: i32,
    policy_hash: String,
    allowed_data_categories: serde_json::Value,
    allowed_destination_countries: serde_json::Value,
    allowed_partners: serde_json::Value,
    changed_by: Option<String>,
    change_reason: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

fn build_agent_card(agent: &AgentRow, policy_hash: &str, policy_version: i32) -> serde_json::Value {
    serde_json::json!({
        "name": agent.name,
        "description": agent.description,
        "version": agent.version,
        "url": agent.url,
        "provider": {
            "organization": agent.provider_org,
            "url": agent.provider_url,
        },
        "capabilities": {
            "streaming": false,
            "pushNotifications": false,
        },
        "skills": [],
        "authentication": {
            "schemes": ["Bearer"],
        },
        "x-veridion": {
            "agent_id": agent.id,
            "policy_version": format!("v{}", policy_version),
            "policy_version_hash": policy_hash,
            "trust_level": agent.trust_level,
            "allowed_data_categories": agent.allowed_data_categories,
            "allowed_destination_countries": agent.allowed_destination_countries,
            "allowed_partners": agent.allowed_partners,
            "gdpr_enforcement_mode": "shadow",
            "policy_history_url": format!("https://api.veridion-nexus.eu/api/v1/agents/{}/card", agent.id),
        },
    })
}

#[post("/api/v1/agents")]
pub async fn register_agent(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<RegisterAgentRequest>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let agent_id = generate_agent_id();
    let plaintext_key = generate_agent_api_key();
    let key_hash = sha256_hex(&plaintext_key);
    let categories_json = serde_json::to_value(&body.allowed_data_categories).unwrap_or_default();
    let countries_json = serde_json::to_value(&body.allowed_destination_countries).unwrap_or_default();
    let partners_json = serde_json::to_value(&body.allowed_partners).unwrap_or_default();
    let policy_hash = compute_policy_hash(&categories_json, &countries_json, &partners_json);

    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "REGISTRATION_FAILED",
                "message": format!("Failed to begin transaction: {}", e),
            }));
        }
    };

    let agent: AgentRow = match sqlx::query_as(
        r#"INSERT INTO agents (id, tenant_id, name, description, version, url, provider_org, provider_url,
            allowed_data_categories, allowed_destination_countries, allowed_partners, trust_level, status, api_key_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, 'active', $12)
           RETURNING *"#
    )
    .bind(&agent_id)
    .bind(tenant.tenant_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.version)
    .bind(&body.url)
    .bind(&body.provider_org)
    .bind(&body.provider_url)
    .bind(&categories_json)
    .bind(&countries_json)
    .bind(&partners_json)
    .bind(&key_hash)
    .fetch_one(&mut *tx)
    .await {
        Ok(a) => a,
        Err(e) => {
            let _ = tx.rollback().await;
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "REGISTRATION_FAILED",
                "message": format!("Failed to register agent: {}", e),
            }));
        }
    };

    if let Err(e) = sqlx::query(
        r#"INSERT INTO policy_versions (agent_id, tenant_id, version_number, policy_hash,
            allowed_data_categories, allowed_destination_countries, allowed_partners, changed_by, change_reason)
           VALUES ($1, $2, 1, $3, $4, $5, $6, 'system', 'Initial registration')"#
    )
    .bind(&agent_id)
    .bind(tenant.tenant_id)
    .bind(&policy_hash)
    .bind(&categories_json)
    .bind(&countries_json)
    .bind(&partners_json)
    .execute(&mut *tx)
    .await {
        let _ = tx.rollback().await;
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "REGISTRATION_FAILED",
            "message": format!("Failed to create policy version: {}", e),
        }));
    }

    if let Err(e) = tx.commit().await {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "REGISTRATION_FAILED",
            "message": format!("Failed to commit: {}", e),
        }));
    }

    let mut card = build_agent_card(&agent, &policy_hash, 1);
    card["x-veridion"]["agent_api_key"] = serde_json::json!(plaintext_key);
    card["x-veridion"]["WARNING"] = serde_json::json!("Store this key securely. It will not be shown again.");
    HttpResponse::Created().json(card)
}

#[get("/api/v1/agents")]
pub async fn list_agents(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let agents: Vec<AgentRow> = match sqlx::query_as(
        "SELECT * FROM agents WHERE tenant_id = $1 AND status != 'deleted' ORDER BY created_at DESC"
    )
    .bind(tenant.tenant_id)
    .fetch_all(pool.get_ref())
    .await {
        Ok(a) => a,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "QUERY_FAILED",
                "message": format!("Failed to list agents: {}", e),
            }));
        }
    };

    let mut items = Vec::new();
    for agent in &agents {
        let pv: Option<PolicyVersionRow> = sqlx::query_as(
            "SELECT * FROM policy_versions WHERE agent_id = $1 ORDER BY version_number DESC LIMIT 1"
        )
        .bind(&agent.id)
        .fetch_optional(pool.get_ref())
        .await
        .ok()
        .flatten();

        let (hash, ver) = match &pv {
            Some(p) => (p.policy_hash.clone(), p.version_number),
            None => ("unknown".to_string(), 1),
        };

        items.push(build_agent_card(agent, &hash, ver));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "agents": items,
        "total": items.len(),
    }))
}

#[derive(Deserialize)]
pub struct AgentPath {
    pub agent_id: String,
}

#[get("/api/v1/agents/{agent_id}")]
pub async fn get_agent(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<AgentPath>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let agent: Option<AgentRow> = sqlx::query_as(
        "SELECT * FROM agents WHERE id = $1 AND tenant_id = $2"
    )
    .bind(&path.agent_id)
    .bind(tenant.tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let agent = match agent {
        Some(a) => a,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "NOT_FOUND",
                "message": "Agent not found",
            }));
        }
    };

    let versions: Vec<PolicyVersionRow> = sqlx::query_as(
        "SELECT * FROM policy_versions WHERE agent_id = $1 ORDER BY version_number DESC"
    )
    .bind(&agent.id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let current = versions.first();
    let (hash, ver) = match current {
        Some(p) => (p.policy_hash.clone(), p.version_number),
        None => ("unknown".to_string(), 1),
    };

    let mut card = build_agent_card(&agent, &hash, ver);

    let history: Vec<serde_json::Value> = versions.iter().map(|pv| {
        serde_json::json!({
            "version": format!("v{}", pv.version_number),
            "policy_hash": pv.policy_hash,
            "allowed_data_categories": pv.allowed_data_categories,
            "allowed_destination_countries": pv.allowed_destination_countries,
            "allowed_partners": pv.allowed_partners,
            "changed_by": pv.changed_by,
            "change_reason": pv.change_reason,
            "created_at": pv.created_at.to_rfc3339(),
        })
    }).collect();

    card["x-veridion"]["policy_history"] = serde_json::json!(history);

    HttpResponse::Ok().json(card)
}

#[get("/api/v1/agents/{agent_id}/card")]
pub async fn get_agent_card(
    pool: web::Data<PgPool>,
    path: web::Path<AgentPath>,
) -> HttpResponse {
    let agent: Option<AgentRow> = sqlx::query_as(
        "SELECT * FROM agents WHERE id = $1"
    )
    .bind(&path.agent_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let agent = match agent {
        Some(a) => a,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "NOT_FOUND",
                "message": "Agent not found",
            }));
        }
    };

    let pv: Option<PolicyVersionRow> = sqlx::query_as(
        "SELECT * FROM policy_versions WHERE agent_id = $1 ORDER BY version_number DESC LIMIT 1"
    )
    .bind(&agent.id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    let (hash, ver) = match &pv {
        Some(p) => (p.policy_hash.clone(), p.version_number),
        None => ("unknown".to_string(), 1),
    };

    HttpResponse::Ok().json(build_agent_card(&agent, &hash, ver))
}

#[post("/api/v1/agents/{agent_id}/rotate-key")]
pub async fn rotate_agent_key(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    path: web::Path<AgentPath>,
) -> HttpResponse {
    let tenant = match get_tenant_context(&req) {
        Ok(t) => t,
        Err(e) => return HttpResponse::from_error(e),
    };

    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM agents WHERE id = $1 AND tenant_id = $2 AND status = 'active'"
    )
    .bind(&path.agent_id)
    .bind(tenant.tenant_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    if exists.is_none() {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "NOT_FOUND",
            "message": "Agent not found",
        }));
    }

    let new_key = generate_agent_api_key();
    let new_hash = sha256_hex(&new_key);

    if let Err(e) = sqlx::query(
        "UPDATE agents SET api_key_hash = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3"
    )
    .bind(&new_hash)
    .bind(&path.agent_id)
    .bind(tenant.tenant_id)
    .execute(pool.get_ref())
    .await {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "ROTATE_FAILED",
            "message": format!("Failed to rotate key: {}", e),
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "agent_id": path.agent_id,
        "agent_api_key": new_key,
        "WARNING": "Store this key securely. It will not be shown again.",
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(register_agent)
       .service(list_agents)
       .service(get_agent)
       .service(get_agent_card)
       .service(rotate_agent_key);
}
