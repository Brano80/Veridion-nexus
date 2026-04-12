//! Shared application state (database pool, signing keys, …).

use crate::signing::SigningKeys;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub signing_keys: SigningKeys,
}
