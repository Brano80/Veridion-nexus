# ADR 001 — Accountability Ledger Architecture

**Status:** Accepted
**Date:** 2026-03-25
**Authors:** Veridion Nexus
**Deciders:** Brano (sole founder)

---

## Context

The Accountability Ledger (AL) must intercept every MCP tool call made by AI agents
and write tamper-evident compliance records conforming to the ACM open specification
(https://www.veridion-nexus.eu/spec). It must satisfy:

- EU AI Act Art. 12 — tamper-evident logging of all high-risk AI agent operations
- EU AI Act Art. 14 — documented human review for Annex III systems
- GDPR Art. 30 — records of processing activities

The existing codebase is a Rust + Actix-web + PostgreSQL backend with:
- An `agents` table (031–034 migrations) — partial AgentRecord
- `compliance_records` + `human_oversight` (005) — not ACM-compatible
- `scc_registries` + `adequacy_decisions` — partial DataTransferRecord
- `mcp-server/` — TypeScript/Node MCP SDK scaffold, `src/` empty

---

## Decision

### 1. Proxy layer: TypeScript MCP proxy in `mcp-server/src/`

The AL proxy is an MCP server (using `@modelcontextprotocol/sdk`) that sits
between an AI agent and its upstream MCP tools. It:

1. Validates the inbound OAuth 2.1 Bearer token on every connection
2. Resolves `client_id` from the token → `agent_id` in the `agents` table
3. Forwards tool calls to the configured upstream MCP server
4. Records a `ToolCallEvent` (POST to Rust API) before returning the result
5. Triggers `ContextTrustAnnotation` updates and `HumanOversightRecord` creation
   via the Rust API when required

**Why TypeScript (not Rust)?**
The MCP SDK has a mature TypeScript implementation. The proxy is I/O-bound and
latency-sensitive; TypeScript async/await with the SDK is the lowest-friction path.
The Rust backend handles all persistence and business logic.

**Why proxy pattern (not in-process middleware)?**
Agents connect to MCP over stdio or HTTP. A proxy requires no changes to the
upstream MCP server or the agent. It is deployment-transparent.

### 2. Agent identity: OAuth 2.1 client credentials

Every agent is registered in the `agents` table with a unique `oauth_client_id`.
The proxy validates the Bearer token against the configured authorization server
and extracts `client_id`. This is the **sole source of agent identity** — agents
cannot self-report their identity.

**Rejected alternative:** API key per agent (simpler but no standard, no expiry
semantics, no scope-based access control).

**Rejected alternative:** mTLS client certificates (stronger but significantly
higher operational burden for v0.1).

Token validation flow:
```
Agent → Bearer token → Proxy → introspect/JWKS verify → client_id
client_id → GET /api/agents?oauth_client_id={id} → agent_id (UUID)
agent_id used in all ACM records for this session
```

### 3. Storage: existing PostgreSQL via Rust API

The proxy does **not** connect to the database directly. All persistence goes
through the Rust API (`POST /api/acm/events`, etc.). This keeps auth, validation,
and multi-tenancy logic in one place.

**New tables required (see migrations 035–037):**
- `tool_call_events` — ACM ToolCallEvent (replaces compliance_records for ACM)
- `context_trust_annotations` — ACM ContextTrustAnnotation (new, no existing equivalent)
- Alter `agents` — add OAuth 2.1 fields, EU AI Act classification, retention_policy

**Existing tables kept as-is:**
- `scc_registries` — used for DataTransferRecord (extended later in Phase 2)
- `adequacy_decisions` — used for DataTransferRecord transfer mechanism lookup
- `human_oversight` / `human_review_queue` — extended in Phase 2 to full HumanOversightRecord
- `compliance_records` — kept for backward compatibility; new ACM work uses `tool_call_events`

### 4. Append-only + hash-chain integrity

`tool_call_events` is append-only: no UPDATE or DELETE is permitted by the API.
Each record stores:
- `prev_event_hash` — SHA-256 of the previous record for the same `agent_id`
- `event_hash` — SHA-256 of this record's canonical fields

The Rust API computes hashes at write time. The proxy never computes hashes.
Chain integrity is verifiable without a separate audit service.

### 5. OTel delegation chain (v0.2 prep — implemented now)

`tool_call_events` includes `trace_id` (UUID) and `parent_span_id` (UUID) columns
from day one, stored as NULLable. The proxy populates them from the inbound
`traceparent` header (W3C Trace Context) when present. This makes v0.2 delegation
chain support a schema-free migration.

### 6. Retention policy: required at agent registration

`agents.retention_policy` (JSONB) is a **required field** at registration time.
The Rust API rejects any `POST /api/agents` request with no `retention_policy`.
Minimum fields: `minimum_retention_days` (integer), `legal_basis_for_retention`
(string), `deletion_scheduled_at` (ISO 8601 or null).

---

## Consequences

**Positive:**
- No changes required to upstream MCP servers or AI agent clients
- Agent identity is cryptographically verifiable (OAuth 2.1 JWT)
- Hash-chain integrity is audit-ready for Art. 12 without additional tooling
- Delegation chains work from day one (no schema migration when v0.2 ships)
- Multi-tenant isolation inherited from existing Rust middleware

**Negative / risks:**
- Proxy adds one network hop. Target: < 5ms overhead synchronous.
  If exceeded, shift to async write-behind queue (compliance does not require
  synchronous writes — records must be written, not necessarily before the
  tool call returns).
- OAuth 2.1 requires an authorization server. For local dev, use a lightweight
  JWKS endpoint (e.g. a static JSON file served by the Rust API). For prod,
  support any RFC 7517-compliant JWKS URI.

---

## File locations

| Component | Path |
|---|---|
| MCP proxy entry point | `mcp-server/src/index.ts` |
| AL API client | `mcp-server/src/al-client.ts` |
| OAuth token validator | `mcp-server/src/oauth.ts` |
| ACM type definitions | `mcp-server/src/types/acm.ts` |
| ToolCallEvent migration | `migrations/035_acm_tool_call_events.sql` |
| ContextTrustAnnotation migration | `migrations/036_acm_context_trust_annotations.sql` |
| Agent identity migration | `migrations/037_acm_agent_identity.sql` |
| Rust ACM routes (Phase 1) | `src/routes/acm.rs` |

---

## References

- ACM Spec v0.1: https://www.veridion-nexus.eu/spec
- OAuth 2.1 draft: https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- OpenTelemetry span model: https://opentelemetry.io/docs/concepts/signals/traces/
- EU AI Act Art. 12: https://artificialintelligenceact.eu/article/12/
- EU AI Act Art. 14: https://artificialintelligenceact.eu/article/14/
