/**
 * OAuth 2.1 token validation for the AL proxy.
 *
 * The proxy accepts Bearer tokens in the MCP session initialisation request
 * (Authorization header or _meta.authorization field in the MCP JSON-RPC params).
 *
 * Validation strategy:
 *   1. Decode the JWT header to get `kid` (key ID)
 *   2. Fetch the JWKS from the configured issuer (cached, TTL 5 min)
 *   3. Verify signature + expiry + audience
 *   4. Extract `client_id` claim — this is the agent's OAuth identity
 *
 * The extracted `client_id` is then used by al-client.ts to resolve the full
 * AgentRecord from the Rust API.
 *
 * For local development without a real auth server, set:
 *   AL_AUTH_MODE=dev_bypass
 *   AL_DEV_CLIENT_ID=<your test agent client_id>
 * This bypasses JWT validation entirely. NEVER use in production.
 */

import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

export interface ValidatedToken {
  client_id: string;
  scope: string;
  issuer: string;
  subject: string;
  expires_at: Date;
  // W3C Trace Context — passed through from inbound request if present
  trace_id?: string;
  parent_span_id?: string;
}

interface OAuthConfig {
  issuer: string;           // e.g. 'https://auth.veridion-nexus.eu'
  audience: string;         // e.g. 'veridion-nexus-al'
  jwks_uri?: string;        // defaults to {issuer}/.well-known/jwks.json
  auth_mode: 'jwks' | 'dev_bypass';
  dev_client_id?: string;   // only for auth_mode=dev_bypass
}

// JWKS cache: keyed by jwks_uri, value is the JWKS function + expiry
const jwksCache = new Map<string, { fn: ReturnType<typeof createRemoteJWKSet>; expires: number }>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getConfig(): OAuthConfig {
  const auth_mode = (process.env.AL_AUTH_MODE ?? 'jwks') as 'jwks' | 'dev_bypass';
  const issuer = process.env.AL_OAUTH_ISSUER ?? '';
  const audience = process.env.AL_OAUTH_AUDIENCE ?? 'veridion-nexus-al';

  if (auth_mode === 'dev_bypass') {
    const dev_client_id = process.env.AL_DEV_CLIENT_ID;
    if (!dev_client_id) {
      throw new Error('AL_DEV_CLIENT_ID must be set when AL_AUTH_MODE=dev_bypass');
    }
    return { issuer, audience, auth_mode, dev_client_id };
  }

  if (!issuer) {
    throw new Error('AL_OAUTH_ISSUER must be set');
  }

  return {
    issuer,
    audience,
    jwks_uri: process.env.AL_JWKS_URI ?? `${issuer}/.well-known/jwks.json`,
    auth_mode,
  };
}

function getJwks(jwks_uri: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = jwksCache.get(jwks_uri);
  if (cached && cached.expires > Date.now()) {
    return cached.fn;
  }
  const fn = createRemoteJWKSet(new URL(jwks_uri));
  jwksCache.set(jwks_uri, { fn, expires: Date.now() + JWKS_CACHE_TTL_MS });
  return fn;
}

/**
 * Extract the Bearer token from an Authorization header value.
 * Returns null if not present or malformed.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] ?? null;
}

/**
 * Validate a JWT Bearer token and extract the agent's client_id.
 *
 * @param rawToken - The raw JWT string (without 'Bearer ' prefix)
 * @param traceparent - W3C traceparent header value if present (for delegation chain)
 * @throws Error if the token is invalid, expired, or missing required claims
 */
export async function validateToken(
  rawToken: string,
  traceparent?: string,
): Promise<ValidatedToken> {
  const config = getConfig();

  // Dev bypass must run before any JWT / JWKS work (no Bearer token in dev).
  // ── Dev bypass ──────────────────────────────────────────────────────────
  if (config.auth_mode === 'dev_bypass') {
    console.warn('[AL OAuth] DEV BYPASS ACTIVE — not validating token. Never use in production.');
    return {
      client_id: config.dev_client_id!,
      scope: '*',
      issuer: 'dev',
      subject: config.dev_client_id!,
      expires_at: new Date(Date.now() + 3600 * 1000),
      ...parseTraceparent(traceparent),
    };
  }

  // ── JWKS validation ─────────────────────────────────────────────────────
  const jwks = getJwks(config.jwks_uri!);

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(rawToken, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });
    payload = result.payload;
  } catch (err) {
    throw new Error(`Token validation failed: ${(err as Error).message}`);
  }

  // Extract client_id — required claim
  // OAuth 2.1 client credentials tokens carry client_id in the `sub` or `client_id` claim
  const client_id =
    (payload['client_id'] as string | undefined) ??
    (payload.sub as string | undefined);

  if (!client_id) {
    throw new Error('Token missing client_id claim');
  }

  const scope = (payload['scope'] as string | undefined) ?? '';

  return {
    client_id,
    scope,
    issuer: payload.iss ?? config.issuer,
    subject: payload.sub ?? client_id,
    expires_at: new Date((payload.exp ?? 0) * 1000),
    ...parseTraceparent(traceparent),
  };
}

/**
 * Parse W3C traceparent header into trace_id and parent_span_id.
 * Format: 00-{trace_id}-{parent_span_id}-{flags}
 * Returns empty object if invalid or absent.
 */
function parseTraceparent(traceparent?: string): { trace_id?: string; parent_span_id?: string } {
  if (!traceparent) return {};
  const parts = traceparent.split('-');
  if (parts.length < 4 || parts[0] !== '00') return {};

  // Convert hex trace-id (32 chars) to UUID format (8-4-4-4-12)
  const rawTrace = parts[1];
  const rawSpan = parts[2];

  if (!rawTrace || rawTrace.length !== 32) return {};
  if (!rawSpan || rawSpan.length !== 16) return {};

  const trace_id = [
    rawTrace.slice(0, 8),
    rawTrace.slice(8, 12),
    rawTrace.slice(12, 16),
    rawTrace.slice(16, 20),
    rawTrace.slice(20),
  ].join('-');

  // parent_span_id is 16 hex chars — pad to UUID by prefixing zeros
  const parent_span_id = [
    '00000000',
    '0000',
    '0000',
    rawSpan.slice(0, 4),
    rawSpan.slice(4),
  ].join('-');

  return { trace_id, parent_span_id };
}
