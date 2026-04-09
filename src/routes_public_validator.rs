//! Public ACM record validator and sandbox API keys — no authentication.

use actix_web::body;
use actix_web::{web, HttpRequest, HttpResponse, post};
use rand::Rng;
use std::collections::BTreeSet;
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::routes_shield::{evaluate_with_tenant_context, EvaluateRequest};
use crate::tenant::TenantContext;

/// Fixed demo tenant id — must match `scripts/seed_demo.sql`.
const DEMO_TENANT_ID: &str = "a0000001-0000-4000-8000-00000000d3d0";
/// Pre-seeded demo agent (`agents.id`); credentials injected when request omits them.
const DEMO_AGENT_ID: &str = "agt_demo_public";
const DEMO_AGENT_API_KEY: &str = "ss_test_demo_agent_key_veridion_public";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct SandboxEvaluateBody {
    #[serde(default, alias = "destinationCountry")]
    destination_country: Option<String>,
    #[serde(default, alias = "destinationCountryCode")]
    destination_country_code: Option<String>,
    /// Friendly alias; merged with `partner_name` for Shield `partner_name`.
    #[serde(default, alias = "partnerName")]
    partner: Option<String>,
    #[serde(default)]
    partner_name: Option<String>,
    #[serde(default, alias = "dataCategories")]
    data_categories: Option<Vec<String>>,
    #[serde(default, alias = "agentId")]
    agent_id: Option<String>,
    #[serde(default, alias = "agentApiKey")]
    agent_api_key: Option<String>,
    #[serde(default, alias = "sourceIp")]
    source_ip: Option<String>,
    #[serde(default, alias = "destIp")]
    dest_ip: Option<String>,
    #[serde(default, alias = "dataSize")]
    data_size: Option<u64>,
    #[serde(default)]
    protocol: Option<String>,
    #[serde(default, alias = "userAgent")]
    user_agent: Option<String>,
    #[serde(default, alias = "requestPath")]
    request_path: Option<String>,
    #[serde(default, alias = "sourceSystem")]
    source_system: Option<String>,
}

impl SandboxEvaluateBody {
    fn into_evaluate_request(self) -> EvaluateRequest {
        let (destination_country_code, destination_country) =
            map_sandbox_destination(self.destination_country_code, self.destination_country);
        let partner_name = self.partner_name.or(self.partner);
        EvaluateRequest {
            destination_country_code,
            destination_country,
            data_categories: self.data_categories,
            partner_name,
            source_ip: self.source_ip,
            dest_ip: self.dest_ip,
            data_size: self.data_size,
            protocol: self.protocol,
            user_agent: self.user_agent,
            request_path: self.request_path,
            agent_id: self.agent_id,
            agent_api_key: self.agent_api_key,
            source_system: self.source_system,
        }
    }
}

/// If `code` is set or `country` looks like an ISO code (2–3 letters), use `destination_country_code`.
fn map_sandbox_destination(
    code: Option<String>,
    country: Option<String>,
) -> (Option<String>, Option<String>) {
    if let Some(c) = code.filter(|s| !s.trim().is_empty()) {
        return (Some(c.trim().to_uppercase()), None);
    }
    if let Some(d) = country.filter(|s| !s.trim().is_empty()) {
        let t = d.trim();
        if t.len() >= 2
            && t.len() <= 3
            && t.chars().all(|c| c.is_ascii_alphanumeric())
        {
            return (Some(t.to_uppercase()), None);
        }
        return (None, Some(d));
    }
    (None, None)
}

async fn load_demo_tenant(pool: &PgPool) -> Result<TenantContext, HttpResponse> {
    let demo_id = match Uuid::parse_str(DEMO_TENANT_ID) {
        Ok(id) => id,
        Err(_) => {
            return Err(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Invalid DEMO_TENANT_ID constant",
            })));
        }
    };

    #[derive(sqlx::FromRow)]
    struct TenantRow {
        id: Uuid,
        name: String,
        plan: String,
        mode: String,
        is_admin: bool,
    }

    let row: Option<TenantRow> = sqlx::query_as(
        "SELECT id, name, plan, mode, is_admin FROM tenants WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(demo_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| {
        log::error!("load_demo_tenant: {}", e);
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "database_error",
            "message": "Could not load demo tenant",
        }))
    })?;

    match row {
        Some(t) => Ok(TenantContext {
            tenant_id: t.id,
            name: t.name,
            plan: t.plan,
            mode: t.mode,
            is_admin: t.is_admin,
        }),
        None => Err(HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "error": "demo_not_configured",
            "message": "Demo tenant not found — run scripts/seed_demo.sql on the database.",
        }))),
    }
}

fn bearer_sandbox_raw_key(req: &HttpRequest) -> Result<String, HttpResponse> {
    let auth = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "unauthorized",
                "message": "Authorization: Bearer sbx_<key> required",
            }))
        })?;
    let token = auth
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "unauthorized",
                "message": "Authorization: Bearer sbx_<key> required",
            }))
        })?;
    if !token.starts_with("sbx_") {
        return Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "unauthorized",
            "message": "Sandbox key must use sbx_ prefix",
        })));
    }
    Ok(token.to_string())
}

async fn sandbox_key_is_valid(pool: &PgPool, raw_key: &str) -> Result<bool, HttpResponse> {
    let mut hasher = Sha256::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = format!("{:x}", hasher.finalize());
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM sandbox_keys WHERE key_hash = $1)",
    )
    .bind(&key_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| {
        log::error!("sandbox_keys lookup: {}", e);
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "database_error",
            "message": "Could not verify sandbox key",
        }))
    })
}

async fn append_sandbox_flag(res: HttpResponse) -> HttpResponse {
    let status = res.status();
    let body = res.into_body();
    let bytes = match body::to_bytes(body).await {
        Ok(b) => b,
        Err(e) => {
            log::error!("sandbox evaluate: read response body: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "message": "Could not read shield response body",
            }));
        }
    };

    if !status.is_success() {
        return HttpResponse::build(status)
            .content_type("application/json")
            .body(bytes);
    }

    match serde_json::from_slice::<serde_json::Value>(&bytes) {
        Ok(mut v) => {
            if let Some(obj) = v.as_object_mut() {
                obj.insert("sandbox".to_string(), serde_json::json!(true));
            }
            HttpResponse::build(status).json(v)
        }
        Err(_) => HttpResponse::build(status)
            .content_type("application/json")
            .body(bytes),
    }
}

#[derive(Serialize)]
struct ArticleTriggered {
    article: String,
    status: String,
    reason: String,
}

#[derive(Serialize)]
struct LimitationNote {
    note: String,
}

#[derive(Serialize)]
struct ValidateResponse {
    valid: bool,
    missing_fields: Vec<String>,
    articles_triggered: Vec<ArticleTriggered>,
    warnings: Vec<String>,
    limitations: Vec<LimitationNote>,
}

fn validate_limitations() -> Vec<LimitationNote> {
    vec![
        LimitationNote {
            note: "This validator checks record structure only. It does not inspect data content, so it cannot detect special category data (Art. 9 GDPR) or infer actual data categories from field values."
                .to_string(),
        },
        LimitationNote {
            note: "A passing result means your record conforms to the ACM schema. It is not a legal compliance clearance. Have your DPO or legal counsel review the full processing context."
                .to_string(),
        },
    ]
}

fn client_ip(req: &HttpRequest) -> String {
    if let Some(ff) = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(first) = ff.split(',').next() {
            let s = first.trim();
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    req.connection_info()
        .realip_remote_addr()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn non_empty_str(v: &serde_json::Value, key: &str) -> bool {
    v.get(key)
        .and_then(|x| x.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

fn json_value_present(v: &serde_json::Value, key: &str) -> bool {
    match v.get(key) {
        None | Some(serde_json::Value::Null) => false,
        Some(_) => true,
    }
}

fn str_field(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

/// POST /api/public/validate — validate shape of an ACM ToolCallEvent-like JSON object.
#[post("/api/public/validate")]
pub async fn validate_record(body: web::Json<serde_json::Value>) -> HttpResponse {
    let v = body.into_inner();

    let mut missing_set: BTreeSet<String> = BTreeSet::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut articles: Vec<ArticleTriggered> = Vec::new();

    for key in ["agent_id", "session_id", "tool_id", "legal_basis", "purpose"] {
        if !non_empty_str(&v, key) {
            missing_set.insert(key.to_string());
        }
    }

    let valid = missing_set.is_empty();

    // EU AI Act Art. 12(1)(a) — tool_id, inputs, outputs
    let tool_ok = non_empty_str(&v, "tool_id");
    let inputs_ok = json_value_present(&v, "inputs");
    let outputs_ok = json_value_present(&v, "outputs");
    if tool_ok && inputs_ok && outputs_ok {
        articles.push(ArticleTriggered {
            article: "EU AI Act Art. 12(1)(a)".to_string(),
            status: "satisfied".to_string(),
            reason: "Tool call inputs and outputs are present and logged.".to_string(),
        });
    } else {
        if !inputs_ok {
            missing_set.insert("inputs".to_string());
        }
        if !outputs_ok {
            missing_set.insert("outputs".to_string());
        }
        let mut miss = Vec::new();
        if !tool_ok {
            miss.push("tool_id");
        }
        if !inputs_ok {
            miss.push("inputs");
        }
        if !outputs_ok {
            miss.push("outputs");
        }
        articles.push(ArticleTriggered {
            article: "EU AI Act Art. 12(1)(a)".to_string(),
            status: "violated".to_string(),
            reason: format!(
                "Missing required fields for logging: {}.",
                miss.join(", ")
            ),
        });
    }

    // human_review_required absent → warn
    if v.get("human_review_required").is_none() {
        warnings.push(
            "human_review_required is absent — EU AI Act Art. 14 oversight may need explicit flagging."
                .to_string(),
        );
    }

    let hr_true = v
        .get("human_review_required")
        .and_then(|x| x.as_bool())
        == Some(true);
    let risk = str_field(&v, "eu_ai_act_risk_level")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let high_risk = risk == "high_risk";

    // EU AI Act Art. 14
    if hr_true || high_risk {
        let reason = if hr_true && high_risk {
            "Human oversight is required: human_review_required is true and system is classified high-risk."
                .to_string()
        } else if high_risk {
            "High-risk AI classification implies human oversight obligations under Art. 14."
                .to_string()
        } else {
            "human_review_required is true — human oversight pathway should be available.".to_string()
        };
        articles.push(ArticleTriggered {
            article: "EU AI Act Art. 14".to_string(),
            status: "triggered".to_string(),
            reason,
        });
    }

    // EU AI Act Art. 9 — high-risk
    if high_risk {
        articles.push(ArticleTriggered {
            article: "EU AI Act Art. 9".to_string(),
            status: "triggered".to_string(),
            reason: "High-risk AI system classification requires conformity assessment and related obligations."
                .to_string(),
        });
    }

    // GDPR Art. 30
    let lb = non_empty_str(&v, "legal_basis");
    let pu = non_empty_str(&v, "purpose");
    if lb && pu {
        articles.push(ArticleTriggered {
            article: "GDPR Art. 30".to_string(),
            status: "satisfied".to_string(),
            reason: "Legal basis and purpose are present for records of processing.".to_string(),
        });
    } else {
        let mut m = Vec::new();
        if !lb {
            m.push("legal_basis");
        }
        if !pu {
            m.push("purpose");
        }
        articles.push(ArticleTriggered {
            article: "GDPR Art. 30".to_string(),
            status: "violated".to_string(),
            reason: format!(
                "Records of processing require legal basis and purpose (missing: {}).",
                m.join(", ")
            ),
        });
    }

    // GDPR Art. 5(1)(e) — storage limitation
    if v.get("retention_policy").is_none() {
        warnings.push(
            "No retention_policy in payload — consider storage limitation (GDPR Art. 5(1)(e))."
                .to_string(),
        );
    }

    let missing_fields: Vec<String> = missing_set.into_iter().collect();

    HttpResponse::Ok().json(ValidateResponse {
        valid,
        missing_fields,
        articles_triggered: articles,
        warnings,
        limitations: validate_limitations(),
    })
}

#[derive(Serialize)]
struct SandboxCreateResponse {
    sandbox_key: String,
    expires_in: &'static str,
    note: &'static str,
    example_validate: String,
    example_evaluate: String,
    /// Same as `example_validate` (legacy key for older frontends).
    example: String,
}

/// POST /api/public/sandbox/create — issue a sandbox API key (rate-limited per IP).
#[post("/api/public/sandbox/create")]
pub async fn create_sandbox_key(req: HttpRequest, pool: web::Data<PgPool>) -> HttpResponse {
    let ip = client_ip(&req);

    let count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*)::bigint FROM sandbox_keys
           WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '24 hours'"#,
    )
    .bind(&ip)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    if count >= 10 {
        return HttpResponse::TooManyRequests().json(serde_json::json!({
            "error": "rate_limit_exceeded",
            "message": "Maximum 10 sandbox keys per IP per 24 hours."
        }));
    }

    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    let hex_part: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    let raw_key = format!("sbx_{}", hex_part);

    let mut hasher = Sha256::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = format!("{:x}", hasher.finalize());

    let key_prefix: String = raw_key.chars().take(12).collect();

    let insert = sqlx::query(
        r#"INSERT INTO sandbox_keys (key_hash, key_prefix, ip_address)
           VALUES ($1, $2, $3)"#,
    )
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(&ip)
    .execute(pool.get_ref())
    .await;

    if let Err(e) = insert {
        log::error!("sandbox_keys insert: {}", e);
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "insert_failed",
            "message": "Could not create sandbox key"
        }));
    }

    let example_validate = format!(
        r#"curl -X POST https://api.veridion-nexus.eu/api/public/validate -H 'Content-Type: application/json' -d '{{"agent_id":"agt_test","session_id":"sess_001","tool_id":"evaluate_transfer","inputs":{{"destination":"US"}},"outputs":{{"decision":"REVIEW"}},"context_trust_level":"trusted","decision_made":true,"human_review_required":true,"legal_basis":"legitimate_interests","purpose":"transfer_evaluation","eu_ai_act_risk_level":"high_risk"}}'"#
    );
    let example_evaluate = "curl -X POST https://api.veridion-nexus.eu/api/public/sandbox/evaluate -H 'Authorization: Bearer <your_sbx_key>' -H 'Content-Type: application/json' -d '{\"destination_country\":\"US\",\"partner\":\"Salesforce\",\"data_categories\":[\"contact_info\"]}'".to_string();

    HttpResponse::Ok().json(SandboxCreateResponse {
        sandbox_key: raw_key,
        expires_in: "never",
        note: "This key is for testing the validator only. Register at app.veridion-nexus.eu for a production key.",
        example_validate: example_validate.clone(),
        example_evaluate,
        example: example_validate,
    })
}

/// POST /api/public/shield/evaluate — same logic as `/api/v1/shield/evaluate` for the seeded demo tenant.
/// No `Authorization` header. If `agent_id` / `agent_api_key` are omitted, the pre-seeded demo agent is used.
#[post("/api/public/shield/evaluate")]
pub async fn public_shield_evaluate(
    pool: web::Data<PgPool>,
    body: web::Json<EvaluateRequest>,
) -> HttpResponse {
    let tenant = match load_demo_tenant(pool.get_ref()).await {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut body = body.into_inner();
    if body.agent_id.as_ref().map_or(true, |s| s.trim().is_empty()) {
        body.agent_id = Some(DEMO_AGENT_ID.to_string());
    }
    if body.agent_api_key.as_ref().map_or(true, |s| s.trim().is_empty()) {
        body.agent_api_key = Some(DEMO_AGENT_API_KEY.to_string());
    }

    evaluate_with_tenant_context(pool.get_ref(), &tenant, body).await
}

/// POST /api/public/sandbox/evaluate — Bearer `sbx_*` key required; runs Shield evaluate for the demo tenant.
#[post("/api/public/sandbox/evaluate")]
pub async fn sandbox_evaluate_handler(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    body: web::Json<SandboxEvaluateBody>,
) -> HttpResponse {
    let raw_key = match bearer_sandbox_raw_key(&req) {
        Ok(k) => k,
        Err(r) => return r,
    };
    match sandbox_key_is_valid(pool.get_ref(), &raw_key).await {
        Ok(true) => {}
        Ok(false) => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "invalid_sandbox_key"
            }));
        }
        Err(r) => return r,
    }

    let tenant = match load_demo_tenant(pool.get_ref()).await {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut eval_req = body.into_inner().into_evaluate_request();
    if eval_req.agent_id.as_ref().map_or(true, |s| s.trim().is_empty()) {
        eval_req.agent_id = Some(DEMO_AGENT_ID.to_string());
    }
    if eval_req.agent_api_key.as_ref().map_or(true, |s| s.trim().is_empty()) {
        eval_req.agent_api_key = Some(DEMO_AGENT_API_KEY.to_string());
    }

    let res = evaluate_with_tenant_context(pool.get_ref(), &tenant, eval_req).await;
    append_sandbox_flag(res).await
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(validate_record)
        .service(create_sandbox_key)
        .service(public_shield_evaluate);
}
