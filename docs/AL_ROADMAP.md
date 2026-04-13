# Accountability Ledger — Product Roadmap

**Last updated:** 2026-03-31
**Owner:** Brano (sole founder)
**Goal:** Ship `veridion-nexus-gateway` (MCP Governance Gateway) as an installable, testable, enterprise-ready MCP audit proxy.

---

## What the AL is

A **TypeScript MCP proxy** (`al-proxy.ts`) that sits between AI agents and upstream MCP servers. Every tool call is intercepted, identity-verified, and logged as a **tamper-evident compliance record** via the Rust ACM API (`/api/acm/*`). The Rust backend persists append-only `tool_call_events` with SHA-256 hash chaining, plus optional `DataTransferRecord` and `HumanOversightRecord` side-records.

Regulatory framing: EU AI Act Art. 12 (logging), Art. 14 (human oversight), GDPR Art. 30 (records of processing), GDPR Chapter V (transfer records).

Architecture: ADR 001 (`docs/adr/001-al-architecture.md`).

---

## Inventory — what exists today

### Proxy layer (`mcp-server/src/`, excluded from current `tsc` build)

| Component | File | Status |
|-----------|------|--------|
| AL MCP proxy | `al-proxy.ts` | ✅ Implemented (416 lines, v0.2) |
| Upstream MCP client (stdio + SSE) | `upstream-client.ts` | ✅ Implemented — both `stdio` and `sse` transport |
| Rust API HTTP client | `al-client.ts` | ✅ Implemented — all ACM endpoints wired |
| OAuth 2.1 token validation (JWKS) | `oauth.ts` | ✅ Implemented |
| Dev bypass auth (`AL_AUTH_MODE=dev_bypass`) | `oauth.ts` | ✅ Implemented — skips JWT, uses `AL_DEV_CLIENT_ID` |
| ACM spec v0.1 TypeScript types | `types/acm.ts` | ✅ Implemented — AgentRecord, ToolCallEvent, Trust, Transfer, Oversight |

**Critical note:** AL proxy sources live under `mcp-server/src/` but are in `tsconfig.json` → `exclude`, so the published **`veridion-nexus-mcp`** npm build contains **Sovereign Shield tools only** (AL sources are not compiled into that artifact). The **MCP Governance Gateway** is shipped separately as **`veridion-nexus-gateway`** from `mcp-server-gateway/` (standalone package; same proxy code path).

### Rust backend (`src/routes_acm.rs` + migrations 035–043)

| Component | Status |
|-----------|--------|
| `POST /api/acm/events` — ToolCallEvent with hash chain | ✅ Implemented |
| `POST /api/acm/trust-annotations` — monotonic trust degradation | ✅ Implemented |
| `GET /api/acm/trust-annotations/session/{id}/current` | ✅ Implemented |
| `POST /api/acm/transfers` — DataTransferRecord (GDPR Chapter V) | ✅ Implemented |
| `PATCH /api/acm/transfers/schrems-iii-review` — bulk DPF risk flagging | ✅ Implemented |
| `POST /api/acm/oversight` — HumanOversightRecord | ✅ Implemented |
| `PATCH /api/acm/oversight/{id}` — reviewer outcome | ✅ Implemented |
| `GET /api/acm/agents?oauth_client_id=` — agent resolution | ✅ Implemented |
| Auth: `AL_SERVICE_TOKEN` bearer for proxy routes | ✅ Implemented |
| `tool_call_events` table — append-only, DB rules block UPDATE/DELETE | ✅ Migration 035 |
| `context_trust_annotations` table | ✅ Migration 036 |
| `agents` table extended (OAuth, EU AI Act, retention, PII heuristics) | ✅ Migration 037 |
| `data_transfer_records` table + EEA reference data | ✅ Migration 039 |
| `human_oversight` extended for ACM | ✅ Migration 040 |
| Hash chain: `prev_event_hash` / `event_hash` computed server-side | ✅ Implemented |
| Retention policy required at agent registration | ✅ Enforced in API |

### Dashboard (ACM pages)

| Page | Route | Status |
|------|-------|--------|
| ACM Overview (stats) | `/acm` | ✅ Implemented |
| Oversight Queue (approve/reject/escalate) | `/acm/oversight` | ✅ Implemented |
| Transfers table | `/acm/transfers` | ✅ Implemented |
| Dashboard ACM API client | `dashboard/app/lib/acm-api.ts` | ✅ Implemented |

### Proxy features

| Feature | Status |
|---------|--------|
| Fail-closed: no log → no call | ✅ Implemented (errors block forwarding) |
| `tools_permitted` allowlist | ✅ Implemented |
| PII heuristics (built-in defaults + per-agent `pii_heuristics`) | ✅ v1 implemented |
| `inferDecisionMade` (keyword-based) | ✅ v1 implemented |
| Automatic DataTransferRecord for non-EEA `transfer_policies` | ✅ Implemented |
| Automatic HumanOversightRecord on degraded trust + high-risk | ✅ Implemented |
| OTel trace_id / parent_span_id from W3C traceparent header | ✅ Schema + proxy wiring |
| Graceful shutdown (SIGINT/SIGTERM) | ✅ Implemented |
| Upstream reconnect on disconnect | ✅ Implemented |

---

## Phase 0 — Make it installable

**Goal:** A developer (or design partner) can `npx veridion-nexus-gateway` and have a working proxy.
**Estimate:** 2–3 weeks.

| Task | Status | Notes |
|------|--------|-------|
| Separate `veridion-nexus-gateway` package (`mcp-server-gateway/`) | ✅ Done | Standalone package, own `tsconfig.json`, all gateway source included |
| Create `veridion-nexus-gateway` entrypoint (`bin` in `package.json`) | ✅ Done | `#!/usr/bin/env node` shebang, `bin.veridion-nexus-gateway` in `package.json` |
| Compile AL proxy with `tsc` and verify it builds clean | ✅ Done | Zero errors, `dist/` contains all `.js` + `.d.ts` |
| Env template: `.env.example` with all required vars | ✅ Done | `mcp-server-gateway/.env.example` — auth, upstream, optional vars |
| Quickstart guide: install → configure → point at upstream → see logs | ✅ Done | `mcp-server-gateway/README.md` — Claude Desktop config, env table |
| Publish to npm (or private registry for design partners) | ❌ Not done | Package is ready; `npm publish` when registry access is set up |
| Test with real upstream MCP server (e.g. Claude tools, n8n) | ❌ Not done | First live validation |

---

## Phase 1 — Developer experience

**Goal:** A developer can set up AL in 30 minutes and understand what they see.
**Estimate:** 3–4 weeks (overlaps with Phase 0 completion).

| Task | Status | Notes |
|------|--------|-------|
| `AL_AUTH_MODE=dev_bypass` documented in quickstart | ✅ Done | Documented in `mcp-server-gateway/README.md` and `.env.example` |
| Simple API-key auth mode (alternative to OAuth for small teams) | ❌ Not built | `dev_bypass` requires fixed `AL_DEV_CLIENT_ID` — fine for dev, not for multi-agent prod without OAuth |
| Agent registration walkthrough (create agent with `retention_policy`, `tools_permitted`, etc.) | ❌ Not written | API exists; DX guide missing |
| Dashboard: dedicated "Tool Call Audit" view (DPO-friendly, not just ACM Overview) | ❌ Not built | Current ACM Overview shows stats; no searchable tool-call log view |
| Dashboard: tool call detail drawer/page (inputs, trust, hash, linked transfer/oversight) | ❌ Not built | |
| Error messages: actionable errors when proxy can't reach Rust API, token invalid, agent not found | ⚠️ Partial | Errors exist but not DX-polished |

---

## Phase 2 — Compliance reporting & partner readiness

**Goal:** A DPO or compliance officer can generate evidence from AL data.
**Estimate:** 4–6 weeks after Phase 1.

| Task | Status | Notes |
|------|--------|-------|
| PDF compliance report for tool call events (Art. 12 framing) | ❌ Not built | Evidence Vault has PDF export; AL needs equivalent |
| Hash chain verification endpoint for `tool_call_events` | ❌ Not built | `evidence_events` has `verify-integrity`; same pattern needed for AL |
| JSON export of tool call audit trail (for external GRC tools) | ❌ Not built | |
| Host→proxy transport: HTTP/SSE for server-side agents (not just stdio) | ❌ Not built | Upstream SSE works; but the **agent→proxy** hop is currently stdio-only (`StdioServerTransport` in `al-proxy.ts` line 379) |
| Configurable `inferDecisionMade` per agent (not just keyword list) | ⚠️ Partial | v1 uses hardcoded keywords; `PROJECT_REFERENCE` flags this as Phase 3 TODO |
| Configurable PII heuristics: richer rules, per-tool overrides | ⚠️ Partial | Per-agent `pii_heuristics` exists; per-tool granularity not yet |
| Design partner feedback loop (structured: emit → validate → iterate) | ❌ Not defined | Process, not code |

---

## Phase 3 — Enterprise readiness

**Goal:** Production-grade for regulated enterprises.
**Estimate:** 8–12 weeks after Phase 2.

| Task | Status | Notes |
|------|--------|-------|
| OAuth 2.1 integration guide (Azure AD, Auth0, Keycloak) | ❌ Not written | JWKS validation code exists; customer setup docs do not |
| Multi-tenant isolation verification (AL data is tenant-scoped) | ⚠️ Partial | `tenant_id` on all tables; needs explicit security review / test suite |
| Retention enforcement: scheduled deletion per `retention_policy` | ❌ Not built | Schema stores policy; no background job executes deletion |
| Annex III category-aware retention (3 years biometric, etc.) | ❌ Not built | `retention_policy` is free-form JSONB; Annex III mapping not enforced |
| Combined config: single MCP setup gives agent both Shield + AL | ❌ Not built | Currently two separate server concepts |
| Rate limiting / back-pressure on proxy | ❌ Not built | |
| Horizontal scaling story (multiple proxy instances, same backend) | ❌ Not built | Hash chain is per-agent so theoretically safe; not tested |
| Security review of proxy surface (token handling, upstream forwarding, log leakage) | ❌ Not done | |
| SOC 2 / penetration test readiness | ❌ Not done | |

---

## Phase 4 — Ecosystem

**Goal:** AL works in real agent orchestration ecosystems.
**Estimate:** Ongoing.

| Task | Status | Notes |
|------|--------|-------|
| A2A (Agent-to-Agent) card integration (`a2a_card_url` on AgentRecord) | ⚠️ Schema ready | Field exists; no consumer logic |
| OTel delegation chain: full trace propagation across agent hops | ⚠️ Schema ready | `trace_id` / `parent_span_id` stored; no trace visualization |
| Upstream tool schema validation (verify agent called tool with correct args) | ❌ Not built | |
| Plugin / webhook on tool call events (notify external systems) | ❌ Not built | |
| Public compliance registry: AL events visible in cross-tenant search | ❌ Not built | Shield has public registry concept; AL does not |

---

## Important notes

### 1. Where the AL proxy ships

AL proxy TypeScript remains **excluded from the `veridion-nexus-mcp` `tsc` build** in `mcp-server` (`tsconfig.json` → `exclude`), so that npm package’s published artifact is **Shield tools only**. Customers who need the Accountability Ledger MCP proxy install **`veridion-nexus-gateway`** (see `mcp-server-gateway/`). The monorepo also exposes the same gateway binary via `veridion-nexus-mcp`’s optional `bin` entry (`veridion-nexus-gateway` → `al-proxy.js`) for users who install the umbrella package.

### 2. "Upstream SSE" ≠ "agent→proxy SSE"

The **upstream** MCP client (`upstream-client.ts`) supports both **stdio** and **SSE** transport — this is the **proxy→real MCP server** hop. The **agent→proxy** connection (`al-proxy.ts` line 379) uses `StdioServerTransport` only. For server-side orchestrators (n8n, custom backends), the proxy would need an **HTTP/SSE server transport** for the inbound agent connection.

### 3. Dev bypass exists — document it

`AL_AUTH_MODE=dev_bypass` + `AL_DEV_CLIENT_ID` skips JWT entirely. This is the **intended** quick-start path for local development and design partner testing. It is **not** documented outside inline code comments.

### 4. PII heuristics are v1

Built-in keyword matching + per-agent `pii_heuristics` (custom `arg_keys` / `tool_names`). `PROJECT_REFERENCE` calls out Phase 3 TODOs for richer per-tool `inferDecisionMade` and PII detection. Current version is functional but not configurable enough for enterprise customers who need precision.

### 5. Retention policy: stored, not enforced

`retention_policy` is **required** at agent registration (migration 037, API validation). The policy is **stored** as JSONB. There is **no background job** that actually deletes records when `deletion_scheduled_at` passes or `minimum_retention_days` expires. This is a compliance gap — the system records intent but does not act on it.

### 6. Hash chain is real but not independently verifiable (yet)

`tool_call_events` has `event_hash` + `prev_event_hash` computed by the Rust API. DB rules block UPDATE/DELETE. But there is **no public verification endpoint** for `tool_call_events` (unlike `evidence_events` which has `verify-integrity`). A customer cannot currently prove chain integrity without direct DB access.

### 7. Dashboard ACM pages exist but are not DPO-ready

ACM Overview shows aggregate stats. Oversight Queue allows approve/reject/escalate. Transfers table lists records. But there is **no searchable tool-call log**, **no detail view per event**, and **no PDF report** — the things a DPO or auditor would expect for Art. 12 evidence.

### 8. This is a solo-founder project

Timeline estimates assume **one developer**. Design partner commitments should be scoped to what's achievable without parallel engineering capacity. Phase 0 is the critical gate — nothing else matters until the proxy is installable.
