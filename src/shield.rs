use serde::{Deserialize, Serialize};
use sqlx::PgPool;

// Country classification per GDPR Art. 44-49
const EU_EEA: &[&str] = &[
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
    "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO",
];

const ADEQUATE: &[&str] = &[
    "AD","AR","BR","CA","FO","GG","IL","IM","JP","JE","NZ","KR","GB","UY","CH",
];

const SCC_REQUIRED: &[&str] = &[
    "US","AU","IN","MX","SG","ZA",
    "ID","TR","PH","VN","EG","NG","PK","BD","TH","MY"
];

const BLOCKED: &[&str] = &["CN","RU","KP","IR","SY","BY"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Decision {
    ALLOW,
    BLOCK,
    REVIEW,
}

impl std::fmt::Display for Decision {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Decision::ALLOW => write!(f, "ALLOW"),
            Decision::BLOCK => write!(f, "BLOCK"),
            Decision::REVIEW => write!(f, "REVIEW"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferContext {
    pub destination_country_code: Option<String>,
    pub destination_country: Option<String>,
    pub data_categories: Option<Vec<String>>,
    pub partner_name: Option<String>,
    pub source_ip: Option<String>,
    pub dest_ip: Option<String>,
    pub data_size: Option<u64>,
    pub protocol: Option<String>,
    pub user_agent: Option<String>,
    pub request_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TransferDecision {
    pub decision: Decision,
    pub reason: String,
    pub severity: String,
    pub articles: Vec<String>,
    pub event_type: String,
    pub country_status: String,
}

pub fn country_name(code: &str) -> String {
    match code.to_uppercase().as_str() {
        "US" => "United States".into(),
        "CN" => "China".into(),
        "RU" => "Russia".into(),
        "KP" => "North Korea".into(),
        "IR" => "Iran".into(),
        "SY" => "Syria".into(),
        "VE" => "Venezuela".into(),
        "BY" => "Belarus".into(),
        "GB" => "United Kingdom".into(),
        "JP" => "Japan".into(),
        "KR" => "South Korea".into(),
        "AU" => "Australia".into(),
        "BR" => "Brazil".into(),
        "MX" => "Mexico".into(),
        "SG" => "Singapore".into(),
        "ZA" => "South Africa".into(),
        "CA" => "Canada".into(),
        "IL" => "Israel".into(),
        "IN" => "India".into(),
        "NZ" => "New Zealand".into(),
        "ID" => "Indonesia".into(),
        "TR" => "Turkey".into(),
        "PH" => "Philippines".into(),
        "VN" => "Vietnam".into(),
        "EG" => "Egypt".into(),
        "NG" => "Nigeria".into(),
        "PK" => "Pakistan".into(),
        "BD" => "Bangladesh".into(),
        "TH" => "Thailand".into(),
        "MY" => "Malaysia".into(),
        "DE" => "Germany".into(),
        "FR" => "France".into(),
        "NL" => "Netherlands".into(),
        "BE" => "Belgium".into(),
        "AT" => "Austria".into(),
        "IT" => "Italy".into(),
        "ES" => "Spain".into(),
        "PT" => "Portugal".into(),
        "SE" => "Sweden".into(),
        "NO" => "Norway".into(),
        "DK" => "Denmark".into(),
        "FI" => "Finland".into(),
        "PL" => "Poland".into(),
        "CZ" => "Czech Republic".into(),
        "IE" => "Ireland".into(),
        "CH" => "Switzerland".into(),
        "GR" => "Greece".into(),
        "RO" => "Romania".into(),
        "HU" => "Hungary".into(),
        "BG" => "Bulgaria".into(),
        "HR" => "Croatia".into(),
        "SK" => "Slovakia".into(),
        "SI" => "Slovenia".into(),
        "LT" => "Lithuania".into(),
        "LV" => "Latvia".into(),
        "EE" => "Estonia".into(),
        "LU" => "Luxembourg".into(),
        "MT" => "Malta".into(),
        "CY" => "Cyprus".into(),
        "IS" => "Iceland".into(),
        "LI" => "Liechtenstein".into(),
        "AD" => "Andorra".into(),
        "AR" => "Argentina".into(),
        "FO" => "Faroe Islands".into(),
        "GG" => "Guernsey".into(),
        "IM" => "Isle of Man".into(),
        "JE" => "Jersey".into(),
        "UY" => "Uruguay".into(),
        other => other.to_string(),
    }
}

pub fn classify_country(code: &str) -> &'static str {
    let upper = code.to_uppercase();
    let u = upper.as_str();
    if EU_EEA.contains(&u) {
        "eu_eea"
    } else if ADEQUATE.contains(&u) {
        "adequate_protection"
    } else if SCC_REQUIRED.contains(&u) {
        "scc_required"
    } else if BLOCKED.contains(&u) {
        "blocked"
    } else {
        "unknown"
    }
}

pub fn evaluate_transfer(ctx: &TransferContext) -> TransferDecision {
    let code = match &ctx.destination_country_code {
        Some(c) if !c.is_empty() => c.to_uppercase(),
        _ => {
            return TransferDecision {
                decision: Decision::REVIEW,
                reason: "Missing destination country — cannot evaluate transfer".into(),
                severity: "L2".into(),
                articles: vec!["GDPR Art. 44".into()],
                event_type: "DATA_TRANSFER_REVIEW".into(),
                country_status: "unknown".into(),
            };
        }
    };

    let has_personal_data = ctx.data_categories
        .as_ref()
        .map(|cats| !cats.is_empty())
        .unwrap_or(false);

    if ctx.data_categories.is_none() {
        return TransferDecision {
            decision: Decision::REVIEW,
            reason: "Missing data categories — cannot determine if personal data is involved".into(),
            severity: "L2".into(),
            articles: vec!["GDPR Art. 44".into()],
            event_type: "DATA_TRANSFER_REVIEW".into(),
            country_status: classify_country(&code).into(),
        };
    }

    let classification = classify_country(&code);

    match classification {
        "eu_eea" => TransferDecision {
            decision: Decision::ALLOW,
            reason: format!("{} is EU/EEA — no transfer restrictions", country_name(&code)),
            severity: "L1".into(),
            articles: vec![],
            event_type: "DATA_TRANSFER".into(),
            country_status: "eu_eea".into(),
        },

        "adequate_protection" => TransferDecision {
            decision: Decision::ALLOW,
            reason: format!("{} has EU adequacy decision", country_name(&code)),
            severity: "L1".into(),
            articles: vec!["GDPR Art. 45".into()],
            event_type: "DATA_TRANSFER".into(),
            country_status: "adequate_protection".into(),
        },

        "blocked" => TransferDecision {
            decision: Decision::BLOCK,
            reason: format!("{} is blocked — no legal transfer mechanism available", country_name(&code)),
            severity: "L3".into(),
            articles: vec!["GDPR Art. 44".into(), "GDPR Art. 46".into()],
            event_type: "DATA_TRANSFER_BLOCKED".into(),
            country_status: "blocked".into(),
        },

        "scc_required" => {
            if !has_personal_data {
                return TransferDecision {
                    decision: Decision::ALLOW,
                    reason: format!("Transfer to {} — no personal data involved", country_name(&code)),
                    severity: "L1".into(),
                    articles: vec![],
                    event_type: "DATA_TRANSFER".into(),
                    country_status: "scc_required".into(),
                };
            }
            // SCC check requires database lookup - use evaluate_transfer_with_db instead
            TransferDecision {
                decision: Decision::REVIEW,
                reason: format!("{} requires SCC — human review needed to verify safeguards", country_name(&code)),
                severity: "L2".into(),
                articles: vec!["GDPR Art. 46".into()],
                event_type: "DATA_TRANSFER_REVIEW".into(),
                country_status: "scc_required".into(),
            }
        },

        _ => {
            if !has_personal_data {
                return TransferDecision {
                    decision: Decision::ALLOW,
                    reason: format!("Transfer to {} — no personal data involved", country_name(&code)),
                    severity: "L1".into(),
                    articles: vec![],
                    event_type: "DATA_TRANSFER".into(),
                    country_status: "unknown".into(),
                };
            }
            TransferDecision {
                decision: Decision::BLOCK,
                reason: "No adequacy decision or SCC framework for this country — transfer blocked per GDPR Art. 44".into(),
                severity: "L3".into(),
                articles: vec!["GDPR Art. 44".into()],
                event_type: "DATA_TRANSFER_BLOCKED".into(),
                country_status: "unknown".into(),
            }
        }
    }
}

pub async fn check_scc_exists(
    pool: &PgPool,
    partner_name: &str,
    destination_country_code: &str,
) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM scc_registries 
           WHERE partner_name = $1 
             AND destination_country_code = $2 
             AND status = 'active' 
             AND (expires_at IS NULL OR expires_at > NOW())"#
    )
    .bind(partner_name)
    .bind(destination_country_code.to_uppercase())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to check SCC: {}", e))?;

    Ok(count > 0)
}

pub async fn evaluate_transfer_with_db(
    pool: &PgPool,
    ctx: &TransferContext,
) -> Result<TransferDecision, String> {
    let code = match &ctx.destination_country_code {
        Some(c) if !c.is_empty() => c.to_uppercase(),
        _ => {
            return Ok(TransferDecision {
                decision: Decision::REVIEW,
                reason: "Missing destination country — cannot evaluate transfer".into(),
                severity: "L2".into(),
                articles: vec!["GDPR Art. 44".into()],
                event_type: "DATA_TRANSFER_REVIEW".into(),
                country_status: "unknown".into(),
            });
        }
    };

    let has_personal_data = ctx.data_categories
        .as_ref()
        .map(|cats| !cats.is_empty())
        .unwrap_or(false);

    if ctx.data_categories.is_none() {
        return Ok(TransferDecision {
            decision: Decision::REVIEW,
            reason: "Missing data categories — cannot determine if personal data is involved".into(),
            severity: "L2".into(),
            articles: vec!["GDPR Art. 44".into()],
            event_type: "DATA_TRANSFER_REVIEW".into(),
            country_status: classify_country(&code).into(),
        });
    }

    let classification = classify_country(&code);

    match classification {
        "eu_eea" => Ok(TransferDecision {
            decision: Decision::ALLOW,
            reason: format!("{} is EU/EEA — no transfer restrictions", country_name(&code)),
            severity: "L1".into(),
            articles: vec![],
            event_type: "DATA_TRANSFER".into(),
            country_status: "eu_eea".into(),
        }),

        "adequate_protection" => Ok(TransferDecision {
            decision: Decision::ALLOW,
            reason: format!("{} has EU adequacy decision", country_name(&code)),
            severity: "L1".into(),
            articles: vec!["GDPR Art. 45".into()],
            event_type: "DATA_TRANSFER".into(),
            country_status: "adequate_protection".into(),
        }),

        "blocked" => Ok(TransferDecision {
            decision: Decision::BLOCK,
            reason: format!("{} is blocked — no legal transfer mechanism available", country_name(&code)),
            severity: "L3".into(),
            articles: vec!["GDPR Art. 44".into(), "GDPR Art. 46".into()],
            event_type: "DATA_TRANSFER_BLOCKED".into(),
            country_status: "blocked".into(),
        }),

        "scc_required" => {
            if !has_personal_data {
                return Ok(TransferDecision {
                    decision: Decision::ALLOW,
                    reason: format!("Transfer to {} — no personal data involved", country_name(&code)),
                    severity: "L1".into(),
                    articles: vec![],
                    event_type: "DATA_TRANSFER".into(),
                    country_status: "scc_required".into(),
                });
            }
            // Check SCC in database
            let partner = ctx.partner_name.as_deref().unwrap_or("");
            if partner.is_empty() {
                return Ok(TransferDecision {
                    decision: Decision::REVIEW,
                    reason: format!("{} requires SCC — partner name required to verify SCC", country_name(&code)),
                    severity: "L2".into(),
                    articles: vec!["GDPR Art. 46".into()],
                    event_type: "DATA_TRANSFER_REVIEW".into(),
                    country_status: "scc_required".into(),
                });
            }
            match check_scc_exists(pool, partner, &code).await {
                Ok(true) => Ok(TransferDecision {
                    decision: Decision::ALLOW,
                    reason: format!("Transfer to {} — valid SCC in place for {}", country_name(&code), partner),
                    severity: "L1".into(),
                    articles: vec!["GDPR Art. 46".into()],
                    event_type: "DATA_TRANSFER".into(),
                    country_status: "scc_required".into(),
                }),
                Ok(false) => Ok(TransferDecision {
                    decision: Decision::REVIEW,
                    reason: format!("{} requires SCC — no active SCC found for {}", country_name(&code), partner),
                    severity: "L2".into(),
                    articles: vec!["GDPR Art. 46".into()],
                    event_type: "DATA_TRANSFER_REVIEW".into(),
                    country_status: "scc_required".into(),
                }),
                Err(e) => {
                    log::error!("SCC lookup error: {}", e);
                    Ok(TransferDecision {
                        decision: Decision::REVIEW,
                        reason: format!("{} requires SCC — unable to verify SCC status", country_name(&code)),
                        severity: "L2".into(),
                        articles: vec!["GDPR Art. 46".into()],
                        event_type: "DATA_TRANSFER_REVIEW".into(),
                        country_status: "scc_required".into(),
                    })
                }
            }
        },

        _ => {
            if !has_personal_data {
                return Ok(TransferDecision {
                    decision: Decision::ALLOW,
                    reason: format!("Transfer to {} — no personal data involved", country_name(&code)),
                    severity: "L1".into(),
                    articles: vec![],
                    event_type: "DATA_TRANSFER".into(),
                    country_status: "unknown".into(),
                });
            }
            Ok(TransferDecision {
                decision: Decision::BLOCK,
                reason: "No adequacy decision or SCC framework for this country — transfer blocked per GDPR Art. 44".into(),
                severity: "L3".into(),
                articles: vec!["GDPR Art. 44".into()],
                event_type: "DATA_TRANSFER_BLOCKED".into(),
                country_status: "unknown".into(),
            })
        }
    }
}

pub fn all_country_classifications() -> Vec<serde_json::Value> {
    let mut countries = Vec::new();
    for &code in EU_EEA {
        countries.push(serde_json::json!({
            "code": code,
            "name": country_name(code),
            "status": "eu_eea",
        }));
    }
    for &code in ADEQUATE {
        countries.push(serde_json::json!({
            "code": code,
            "name": country_name(code),
            "status": "adequate_protection",
        }));
    }
    for &code in SCC_REQUIRED {
        countries.push(serde_json::json!({
            "code": code,
            "name": country_name(code),
            "status": "scc_required",
        }));
    }
    for &code in BLOCKED {
        countries.push(serde_json::json!({
            "code": code,
            "name": country_name(code),
            "status": "blocked",
        }));
    }
    countries
}
