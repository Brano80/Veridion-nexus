//! Public ACM record validator and sandbox API keys — no authentication.

use actix_web::{web, HttpRequest, HttpResponse, post};
use rand::Rng;
use std::collections::BTreeSet;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

#[derive(Serialize)]
struct ArticleTriggered {
    article: String,
    status: String,
    reason: String,
}

#[derive(Serialize)]
struct ValidateResponse {
    valid: bool,
    missing_fields: Vec<String>,
    articles_triggered: Vec<ArticleTriggered>,
    warnings: Vec<String>,
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
    })
}

#[derive(Serialize)]
struct SandboxCreateResponse {
    sandbox_key: String,
    expires_in: &'static str,
    note: &'static str,
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

    if count >= 3 {
        return HttpResponse::TooManyRequests().json(serde_json::json!({
            "error": "rate_limit_exceeded",
            "message": "Maximum 3 sandbox keys per IP per 24 hours."
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

    let example = format!(
        r#"curl -X POST https://api.veridion-nexus.eu/api/public/validate -H 'Content-Type: application/json' -d '{{"agent_id":"agt_test","session_id":"sess_001","tool_id":"evaluate_transfer","inputs":{{"destination":"US"}},"outputs":{{"decision":"REVIEW"}},"context_trust_level":"trusted","decision_made":true,"human_review_required":true,"legal_basis":"legitimate_interests","purpose":"transfer_evaluation","eu_ai_act_risk_level":"high_risk"}}'"#
    );

    HttpResponse::Ok().json(SandboxCreateResponse {
        sandbox_key: raw_key,
        expires_in: "never",
        note: "This key is for testing the validator only. Register at app.veridion-nexus.eu for a production key.",
        example,
    })
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(validate_record).service(create_sandbox_key);
}
