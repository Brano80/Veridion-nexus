use actix_web::{web, HttpResponse, get};
use serde::Deserialize;
use sqlx::PgPool;

#[derive(Deserialize)]
pub struct RegistrySearchQuery {
    pub q: Option<String>,
    pub eu_ai_act_risk_level: Option<String>,
    pub deployment_region: Option<String>,
    pub data_residency: Option<String>,
    pub processes_personal_data: Option<bool>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct PublicAgentRow {
    id: String,
    name: String,
    description: String,
    version: String,
    url: Option<String>,
    provider_org: Option<String>,
    provider_url: Option<String>,
    #[sqlx(default)]
    eu_ai_act_risk_level: Option<String>,
    #[sqlx(default)]
    processes_personal_data: Option<bool>,
    #[sqlx(default)]
    automated_decision_making: Option<bool>,
    #[sqlx(default)]
    deployment_environment: Option<String>,
    #[sqlx(default)]
    deployment_region: Option<String>,
    #[sqlx(default)]
    data_residency: Option<String>,
    #[sqlx(default)]
    transfer_policies: serde_json::Value,
    #[sqlx(default)]
    tools_permitted: serde_json::Value,
    #[sqlx(default)]
    a2a_card_url: Option<String>,
    #[sqlx(default)]
    public_registry_description: Option<String>,
    #[sqlx(default)]
    public_registry_contact_email: Option<String>,
    #[sqlx(default)]
    public_registry_listed_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}

fn agent_to_public_json(a: &PublicAgentRow) -> serde_json::Value {
    serde_json::json!({
        "agent_id": a.id,
        "name": a.name,
        "description": a.public_registry_description.as_deref().unwrap_or(&a.description),
        "version": a.version,
        "url": a.url,
        "provider": {
            "organization": a.provider_org,
            "url": a.provider_url,
        },
        "eu_ai_act": {
            "risk_level": a.eu_ai_act_risk_level.as_deref().unwrap_or("minimal"),
            "processes_personal_data": a.processes_personal_data.unwrap_or(false),
            "automated_decision_making": a.automated_decision_making.unwrap_or(false),
        },
        "deployment": {
            "environment": a.deployment_environment,
            "region": a.deployment_region,
            "data_residency": a.data_residency,
        },
        "transfer_policies": a.transfer_policies,
        "tools_permitted": a.tools_permitted,
        "a2a_card_url": a.a2a_card_url,
        "contact_email": a.public_registry_contact_email,
        "listed_at": a.public_registry_listed_at.map(|d| d.to_rfc3339()),
        "registered_at": a.created_at.to_rfc3339(),
    })
}

// ── GET /api/public/registry/agents ──────────────────────────────────────────

#[get("/api/public/registry/agents")]
pub async fn search_registry(
    pool: web::Data<PgPool>,
    query: web::Query<RegistrySearchQuery>,
) -> HttpResponse {
    let limit = query.limit.unwrap_or(20).min(100).max(1);
    let page = query.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let mut where_clauses = vec![
        "public_registry_listed = true".to_string(),
        "deleted_at IS NULL".to_string(),
        "status = 'active'".to_string(),
    ];
    let mut bind_idx = 0u32;
    let mut binds_text: Vec<String> = Vec::new();
    let mut binds_bool: Vec<bool> = Vec::new();

    if let Some(ref q) = query.q {
        if !q.trim().is_empty() {
            bind_idx += 1;
            where_clauses.push(format!(
                "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(provider_org, '')) @@ plainto_tsquery('english', ${})",
                bind_idx
            ));
            binds_text.push(q.clone());
        }
    }

    if let Some(ref risk) = query.eu_ai_act_risk_level {
        if !risk.is_empty() {
            bind_idx += 1;
            where_clauses.push(format!("eu_ai_act_risk_level = ${}", bind_idx));
            binds_text.push(risk.clone());
        }
    }

    if let Some(ref region) = query.deployment_region {
        if !region.is_empty() {
            bind_idx += 1;
            where_clauses.push(format!("deployment_region = ${}", bind_idx));
            binds_text.push(region.clone());
        }
    }

    if let Some(ref residency) = query.data_residency {
        if !residency.is_empty() {
            bind_idx += 1;
            where_clauses.push(format!("data_residency = ${}", bind_idx));
            binds_text.push(residency.clone());
        }
    }

    if let Some(ppd) = query.processes_personal_data {
        bind_idx += 1;
        where_clauses.push(format!("processes_personal_data = ${}", bind_idx));
        binds_bool.push(ppd);
    }

    let where_sql = where_clauses.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) as count FROM agents WHERE {}", where_sql);
    let select_sql = format!(
        r#"SELECT id, name, description, version, url, provider_org, provider_url,
            eu_ai_act_risk_level, processes_personal_data, automated_decision_making,
            deployment_environment, deployment_region, data_residency,
            COALESCE(transfer_policies, '[]'::jsonb) as transfer_policies,
            COALESCE(tools_permitted, '[]'::jsonb) as tools_permitted,
            a2a_card_url, public_registry_description, public_registry_contact_email,
            public_registry_listed_at, created_at
        FROM agents WHERE {}
        ORDER BY public_registry_listed_at DESC NULLS LAST, created_at DESC
        LIMIT {} OFFSET {}"#,
        where_sql, limit, offset
    );

    // Build dynamic queries — sqlx doesn't support truly dynamic bind lists,
    // so we use query_scalar/query_as with raw SQL and bind in order.
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    let mut select_query = sqlx::query_as::<_, PublicAgentRow>(&select_sql);

    let mut text_idx = 0;
    let mut bool_idx = 0;

    // Rebind in the same order as where_clauses were built
    for _ in 0..bind_idx {
        if text_idx < binds_text.len() {
            count_query = count_query.bind(binds_text[text_idx].clone());
            select_query = select_query.bind(binds_text[text_idx].clone());
            text_idx += 1;
        } else if bool_idx < binds_bool.len() {
            count_query = count_query.bind(binds_bool[bool_idx]);
            select_query = select_query.bind(binds_bool[bool_idx]);
            bool_idx += 1;
        }
    }

    let total: i64 = count_query
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    let agents: Vec<PublicAgentRow> = select_query
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default();

    let items: Vec<serde_json::Value> = agents.iter().map(agent_to_public_json).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "agents": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total as f64 / limit as f64).ceil() as i64,
    }))
}

// ── GET /api/public/registry/agents/{agent_id} ──────────────────────────────

#[derive(Deserialize)]
pub struct AgentPath {
    pub agent_id: String,
}

#[get("/api/public/registry/agents/{agent_id}")]
pub async fn get_registry_agent(
    pool: web::Data<PgPool>,
    path: web::Path<AgentPath>,
) -> HttpResponse {
    let agent: Option<PublicAgentRow> = sqlx::query_as(
        r#"SELECT id, name, description, version, url, provider_org, provider_url,
            eu_ai_act_risk_level, processes_personal_data, automated_decision_making,
            deployment_environment, deployment_region, data_residency,
            COALESCE(transfer_policies, '[]'::jsonb) as transfer_policies,
            COALESCE(tools_permitted, '[]'::jsonb) as tools_permitted,
            a2a_card_url, public_registry_description, public_registry_contact_email,
            public_registry_listed_at, created_at
        FROM agents
        WHERE id = $1
          AND public_registry_listed = true
          AND deleted_at IS NULL
          AND status = 'active'"#,
    )
    .bind(&path.agent_id)
    .fetch_optional(pool.get_ref())
    .await
    .ok()
    .flatten();

    match agent {
        Some(a) => {
            let mut json = agent_to_public_json(&a);

            // Enrich with last audit event timestamp if available
            let last_event: Option<(chrono::DateTime<chrono::Utc>,)> = sqlx::query_as(
                "SELECT created_at FROM tool_call_events WHERE agent_id::text = $1 ORDER BY created_at DESC LIMIT 1"
            )
            .bind(&path.agent_id)
            .fetch_optional(pool.get_ref())
            .await
            .ok()
            .flatten();

            if let Some((ts,)) = last_event {
                json["accountability_ledger"] = serde_json::json!({
                    "active": true,
                    "last_event_at": ts.to_rfc3339(),
                });
            } else {
                json["accountability_ledger"] = serde_json::json!({
                    "active": false,
                });
            }

            HttpResponse::Ok().json(serde_json::json!({ "data": json }))
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Agent not found in public registry"
        })),
    }
}

// ── GET /api/public/registry/stats ───────────────────────────────────────────

#[get("/api/public/registry/stats")]
pub async fn registry_stats(pool: web::Data<PgPool>) -> HttpResponse {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agents WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active'"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let by_risk: Vec<(Option<String>, i64)> = sqlx::query_as(
        r#"SELECT COALESCE(eu_ai_act_risk_level, 'minimal') as level, COUNT(*) as count
        FROM agents
        WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active'
        GROUP BY eu_ai_act_risk_level
        ORDER BY count DESC"#
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let by_region: Vec<(Option<String>, i64)> = sqlx::query_as(
        r#"SELECT COALESCE(deployment_region, 'unspecified') as region, COUNT(*) as count
        FROM agents
        WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active'
        GROUP BY deployment_region
        ORDER BY count DESC"#
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let by_residency: Vec<(Option<String>, i64)> = sqlx::query_as(
        r#"SELECT COALESCE(data_residency, 'unspecified') as residency, COUNT(*) as count
        FROM agents
        WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active'
        GROUP BY data_residency
        ORDER BY count DESC"#
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let personal_data_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM agents WHERE public_registry_listed = true AND deleted_at IS NULL AND status = 'active' AND processes_personal_data = true"
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    HttpResponse::Ok().json(serde_json::json!({
        "total_listed": total,
        "processes_personal_data": personal_data_count,
        "by_risk_level": by_risk.iter().map(|(level, count)| {
            serde_json::json!({ "level": level, "count": count })
        }).collect::<Vec<_>>(),
        "by_region": by_region.iter().map(|(region, count)| {
            serde_json::json!({ "region": region, "count": count })
        }).collect::<Vec<_>>(),
        "by_data_residency": by_residency.iter().map(|(residency, count)| {
            serde_json::json!({ "residency": residency, "count": count })
        }).collect::<Vec<_>>(),
    }))
}

// ── Configure ────────────────────────────────────────────────────────────────

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(search_registry)
       .service(get_registry_agent)
       .service(registry_stats);
}
