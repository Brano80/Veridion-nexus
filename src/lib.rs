//! Veridion API — library for integration tests

pub mod models;
pub mod evidence;
pub mod shield;
pub mod review_queue;
pub mod routes_evidence;
pub mod routes_shield;
pub mod routes_review_queue;
pub mod routes_admin;
pub mod routes_auth;
pub mod routes_agents;
pub mod routes_acm;
pub mod routes_public_registry;
pub mod routes_public_validator;
pub mod email;
pub mod tenant;
pub mod middleware_tenant;
pub mod signing;
pub mod state;

pub use state::AppState;
