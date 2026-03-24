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
export interface ValidatedToken {
    client_id: string;
    scope: string;
    issuer: string;
    subject: string;
    expires_at: Date;
    trace_id?: string;
    parent_span_id?: string;
}
/**
 * Extract the Bearer token from an Authorization header value.
 * Returns null if not present or malformed.
 */
export declare function extractBearerToken(authHeader: string | undefined): string | null;
/**
 * Validate a JWT Bearer token and extract the agent's client_id.
 *
 * @param rawToken - The raw JWT string (without 'Bearer ' prefix)
 * @param traceparent - W3C traceparent header value if present (for delegation chain)
 * @throws Error if the token is invalid, expired, or missing required claims
 */
export declare function validateToken(rawToken: string, traceparent?: string): Promise<ValidatedToken>;
