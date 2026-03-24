# Accountability Ledger — Phase 0

**Status:** Implemented  
**Date:** 2026-03-24

## Summary

Phase 0 delivers the foundation for the EU AI Act Article 12 compliance proxy: ADR, migrations, MCP proxy skeleton, and env configuration.

## Delivered

### 1. Architecture (ADR)

- **docs/adr/001-al-architecture.md** — Architecture decision record: proxy sits between agents and MCP servers; fail-closed; OAuth 2.1 / PKCE identity; hash chain for tamper-evidence.

### 2. Database migrations

- **035_acm_tool_call_events.sql** — `tool_call_events` table (trace_id, agent_id, tool_name, input_hash, output_hash, event_hash, prev_hash, schema_version).
- **036_acm_context_trust_annotations.sql** — `context_trust_annotations` with `trust_level` check constraint.
- **037_acm_agent_identity.sql** — `oauth_client_id`, `retention_policy`, `identity_verified_at` on `agents`.

Migrations run automatically on API startup via `sqlx::migrate`.

### 3. MCP proxy (mcp-server)

- **src/types/acm.ts** — Types: `AgentRecord`, `ToolCallEventPayload`, `ContextTrustAnnotationPayload`.
- **src/oauth.ts** — JWKS-based JWT validation via `jose`.
- **src/al-client.ts** — HTTP client for `/api/acm/agents`, `/api/acm/events`, `/api/acm/trust-annotations`.
- **src/index.ts** — AL proxy: intercepts tool calls, logs (fail-closed), forwards to upstream stub.

### 4. Configuration

- **env.proxy.example** — AL proxy env template.
- **.env.example** — Includes AL vars.

## Phase 1 (not yet implemented)

- Rust API routes: `GET /api/acm/agents`, `POST /api/acm/events`, `POST /api/acm/trust-annotations`, `GET /api/acm/trust-annotations/session/{id}/current`
- Replace upstream MCP stub with real `Client` to upstream MCP server
- Configurable `inferDecisionMade` per tool
- Configurable `extractDataSubjects` via AgentRecord

## Local dev

```bash
# In .env
AL_AUTH_MODE=dev_bypass
AL_DEV_CLIENT_ID=test-agent-001
AL_API_BASE_URL=http://localhost:8080
AL_SERVICE_TOKEN=<openssl rand -hex 32>
```
