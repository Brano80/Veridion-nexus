/**
 * Accountability Ledger — MCP Proxy
 * Phase 1 skeleton: intercepts MCP tool calls, records ACM ToolCallEvents.
 *
 * Architecture (from ADR 001):
 *   AI Agent → [this proxy] → Upstream MCP Server
 *                    ↓
 *             Rust API (ACM records)
 *
 * The proxy:
 *   1. Validates the OAuth 2.1 Bearer token on session init → resolves agent_id
 *   2. Creates a ContextTrustAnnotation for the session (trusted by default)
 *   3. For each tool call:
 *      a. Checks tools_permitted list from AgentRecord
 *      b. Forwards to upstream MCP server
 *      c. Records a ToolCallEvent (async, does not block the response)
 *   4. On session end: finalises the annotation
 *
 * Environment variables (see .env.example):
 *   AL_API_BASE_URL        - Rust API base URL (default: http://localhost:8080)
 *   AL_SERVICE_TOKEN       - Internal service JWT for proxy→API auth
 *   AL_OAUTH_ISSUER        - OAuth 2.1 issuer URL
 *   AL_OAUTH_AUDIENCE      - Expected audience claim (default: veridion-nexus-al)
 *   AL_JWKS_URI            - JWKS endpoint (default: {issuer}/.well-known/jwks.json)
 *   AL_AUTH_MODE           - 'jwks' (default) or 'dev_bypass' (never in production)
 *   AL_DEV_CLIENT_ID       - Required when AL_AUTH_MODE=dev_bypass
 *   UPSTREAM_MCP_COMMAND   - Command to launch upstream MCP server (stdio mode)
 *                            e.g. 'node /path/to/upstream/dist/index.js'
 */
export {};
