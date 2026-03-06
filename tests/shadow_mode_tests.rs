//! SENTINEL — Shadow Mode Integration Tests
//!
//! Run with: cargo test shadow_mode -- --ignored
//! (Use --ignored because tests require DATABASE_URL and a running PostgreSQL)
//!
//! Or: cargo test shadow_mode -- --include-ignored
//!
//! Tests:
//! 1. Shadow mode returns ALLOW for CN (blocked) transfer
//! 2. Evidence event has shadow_mode: true in payload and uses real event type (DATA_TRANSFER_BLOCKED)
//! 3. Switching to enforce mode without confirmation token is rejected
//! 4. After switching to enforce, CN transfer returns BLOCK

use actix_web::{web, test, App};
use serde_json::json;
use sqlx::PgPool;
use std::path::Path;

async fn setup_pool() -> PgPool {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for integration tests");
    let database_url = database_url.replace("localhost", "127.0.0.1");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");
    pool
}

async fn run_migrations(pool: &PgPool) {
    let migrations_dir = std::env::var("MIGRATIONS_PATH")
        .map(|p| Path::new(&p).to_path_buf())
        .unwrap_or_else(|_| Path::new("./migrations").to_path_buf());
    let migrator = sqlx::migrate::Migrator::new(migrations_dir)
        .await
        .expect("Failed to create migrator");
    migrator.run(pool).await.expect("Failed to run migrations");
}

#[tokio::test]
#[ignore] // Requires DATABASE_URL and PostgreSQL
async fn test_shadow_mode_returns_allow_for_cn_transfer() {
    let pool = setup_pool().await;
    run_migrations(&pool).await;

    // Ensure shadow mode
    sqlx::query("UPDATE system_settings SET value = 'shadow' WHERE key = 'enforcement_mode'")
        .execute(&pool)
        .await
        .expect("Failed to set shadow mode");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(veridion_api::routes_shield::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/v1/shield/evaluate")
        .set_payload(
            r#"{"destinationCountryCode":"CN","dataCategories":["email"],"partnerName":"TestPartner"}"#,
        )
        .insert_header(("Content-Type", "application/json"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success(), "Evaluate should succeed");

    let body: serde_json::Value = test::read_body_json(resp).await;
    let decision = body["decision"].as_str().unwrap();
    assert_eq!(decision, "ALLOW", "Shadow mode must return ALLOW for blocked country CN");
}

#[tokio::test]
#[ignore]
async fn test_shadow_evidence_has_shadow_mode_and_real_decision() {
    let pool = setup_pool().await;
    run_migrations(&pool).await;

    sqlx::query("UPDATE system_settings SET value = 'shadow' WHERE key = 'enforcement_mode'")
        .execute(&pool)
        .await
        .expect("Failed to set shadow mode");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(veridion_api::routes_shield::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/v1/shield/evaluate")
        .set_payload(
            r#"{"destinationCountryCode":"CN","dataCategories":["email"],"partnerName":"TestPartner"}"#,
        )
        .insert_header(("Content-Type", "application/json"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    let evidence_id = body["evidence_id"].as_str().expect("evidence_id should be present");

    let row: (String, serde_json::Value) = sqlx::query_as(
        "SELECT event_type, payload FROM evidence_events WHERE event_id = $1",
    )
    .bind(evidence_id)
    .fetch_one(&pool)
    .await
    .expect("Evidence event should exist");

    // Event type should be the real decision type, not DATA_TRANSFER_SHADOW
    assert_eq!(row.0, "DATA_TRANSFER_BLOCKED", "Event type should be DATA_TRANSFER_BLOCKED (real decision)");
    let payload = row.1;
    assert_eq!(
        payload.get("shadow_mode").and_then(|v| v.as_bool()),
        Some(true),
        "payload must have shadow_mode: true"
    );
    // Verify decision in payload reflects real decision
    assert_eq!(
        payload.get("decision").and_then(|v| v.as_str()),
        Some("BLOCK"),
        "payload decision should reflect real decision: BLOCK"
    );
}

#[tokio::test]
#[ignore]
async fn test_switch_to_enforce_without_token_rejected() {
    let pool = setup_pool().await;
    run_migrations(&pool).await;

    sqlx::query("UPDATE system_settings SET value = 'shadow' WHERE key = 'enforcement_mode'")
        .execute(&pool)
        .await
        .expect("Failed to set shadow mode");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(veridion_api::routes_shield::configure),
    )
    .await;

    let req = test::TestRequest::patch()
        .uri("/api/v1/settings")
        .set_payload(r#"{"enforcementMode":"enforce"}"#)
        .insert_header(("Content-Type", "application/json"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status().as_u16(), 403, "Must reject without confirmation token");

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["error"].as_str().unwrap().contains("CONFIRMATION"));
}

#[tokio::test]
#[ignore]
async fn test_after_enforce_cn_returns_block() {
    let pool = setup_pool().await;
    run_migrations(&pool).await;

    sqlx::query("UPDATE system_settings SET value = 'enforce' WHERE key = 'enforcement_mode'")
        .execute(&pool)
        .await
        .expect("Failed to set enforce mode");

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .configure(veridion_api::routes_shield::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/v1/shield/evaluate")
        .set_payload(
            r#"{"destinationCountryCode":"CN","dataCategories":["email"],"partnerName":"TestPartner"}"#,
        )
        .insert_header(("Content-Type", "application/json"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert!(resp.status().is_success());

    let body: serde_json::Value = test::read_body_json(resp).await;
    let decision = body["decision"].as_str().unwrap();
    assert_eq!(decision, "BLOCK", "Enforce mode must return BLOCK for CN");
}
