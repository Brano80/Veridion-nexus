//! Ed25519 signing for ACM `ToolCallEvent` records.
//!
//! See [`SigningKeys::load_from_env`] and [`tool_call_event_signing_canonical`].

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey as DalekSigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

/// Wraps [`ed25519_dalek::SigningKey`].
#[derive(Clone)]
pub struct SigningKey(DalekSigningKey);

impl SigningKey {
    pub fn from_bytes(bytes: &[u8; 32]) -> Self {
        Self(DalekSigningKey::from_bytes(bytes))
    }

    pub fn generate() -> Self {
        Self(DalekSigningKey::generate(&mut OsRng))
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.0.verifying_key()
    }

    pub fn sign(&self, msg: &[u8]) -> Signature {
        self.0.sign(msg)
    }
}

/// Active signing identity: secret key + stable `key_id` derived from the public key.
#[derive(Clone)]
pub struct SigningKeys {
    pub signing_key: SigningKey,
    /// First 16 hex chars of SHA-256(public key bytes).
    pub key_id: String,
}

impl SigningKeys {
    /// Load [`ED25519_PRIVATE_KEY`] (base64 → 32 bytes) or generate an ephemeral key and log a warning.
    pub fn load_from_env() -> Self {
        let secret_b64 = std::env::var("ED25519_PRIVATE_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let signing_key = match secret_b64 {
            Some(b64) => {
                let bytes = B64.decode(b64.trim()).unwrap_or_else(|e| {
                    panic!("ED25519_PRIVATE_KEY: invalid base64: {e}");
                });
                if bytes.len() != 32 {
                    panic!(
                        "ED25519_PRIVATE_KEY must decode to exactly 32 bytes, got {}",
                        bytes.len()
                    );
                }
                let arr: [u8; 32] = bytes.try_into().expect("length checked");
                SigningKey::from_bytes(&arr)
            }
            None => {
                log::warn!(
                    "ED25519_PRIVATE_KEY not set — using ephemeral key. Signatures will not survive restart."
                );
                SigningKey::generate()
            }
        };

        let key_id = key_id_from_verifying_key(&signing_key.verifying_key());
        Self { signing_key, key_id }
    }
}

fn key_id_from_verifying_key(vk: &VerifyingKey) -> String {
    let digest = Sha256::digest(vk.as_bytes());
    let hex64: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
    hex64.chars().take(16).collect()
}

/// Sign UTF-8 canonical JSON; returns `(base64_signature, key_id)`.
pub fn sign_event(keys: &SigningKeys, canonical_json: &str) -> (String, String) {
    let sig = keys.signing_key.sign(canonical_json.as_bytes());
    (B64.encode(sig.to_bytes()), keys.key_id.clone())
}

/// Verify a detached Ed25519 signature. Returns `false` on any decode or crypto error.
pub fn verify_signature(public_key_b64: &str, canonical_json: &str, signature_b64: &str) -> bool {
    let Ok(pk_bytes) = B64.decode(public_key_b64.trim()) else {
        return false;
    };
    if pk_bytes.len() != 32 {
        return false;
    }
    let Ok(pk_arr): Result<[u8; 32], _> = pk_bytes.try_into() else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&pk_arr) else {
        return false;
    };

    let Ok(sig_bytes) = B64.decode(signature_b64.trim()) else {
        return false;
    };
    if sig_bytes.len() != 64 {
        return false;
    }
    let sig = match Signature::from_slice(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };

    vk.verify(canonical_json.as_bytes(), &sig).is_ok()
}

/// Standard base64 encoding of the 32-byte Ed25519 public key.
pub fn public_key_b64(keys: &SigningKeys) -> String {
    B64.encode(keys.signing_key.verifying_key().as_bytes())
}

/// Canonical string for Ed25519 signing (uses [`crate::evidence::canonical_json`]).
pub fn tool_call_event_signing_canonical(
    event_id: &uuid::Uuid,
    agent_id: &str,
    tool_id: &str,
    session_id: &uuid::Uuid,
    event_hash: &str,
    created_at: chrono::DateTime<chrono::Utc>,
) -> String {
    let v = serde_json::json!({
        "agent_id": agent_id,
        "created_at": created_at.to_rfc3339(),
        "event_hash": event_hash,
        "event_id": event_id.to_string(),
        "session_id": session_id.to_string(),
        "tool_id": tool_id,
    });
    crate::evidence::canonical_json(&v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signing_canonical_deterministic() {
        let id = uuid::Uuid::nil();
        let sid = uuid::Uuid::nil();
        let t = chrono::DateTime::parse_from_rfc3339("2020-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let a = tool_call_event_signing_canonical(&id, "agent-1", "tool", &sid, "abc", t);
        let b = tool_call_event_signing_canonical(&id, "agent-1", "tool", &sid, "abc", t);
        assert_eq!(a, b);
    }

    #[test]
    fn sign_verify_round_trip() {
        let sk = SigningKey::generate();
        let kid = key_id_from_verifying_key(&sk.verifying_key());
        let keys = SigningKeys {
            signing_key: sk,
            key_id: kid,
        };
        let msg = r#"{"a":1}"#;
        let (sig, kid2) = sign_event(&keys, msg);
        assert_eq!(kid2, keys.key_id);
        let pk = public_key_b64(&keys);
        assert!(verify_signature(&pk, msg, &sig));
        assert!(!verify_signature(&pk, msg, "AAAA"));
        assert!(!verify_signature("AAAA", msg, &sig));
    }
}
