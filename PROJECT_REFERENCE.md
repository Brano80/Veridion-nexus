# Project Reference — Veridion API / Sovereign Shield

**Version:** 3.6  
**Last updated:** 2026-04-12

*Whenever you change this file in a meaningful way, bump **Last updated** to that day’s calendar date (ISO `YYYY-MM-DD`).*

This is the **single project reference** for Veridion API: vision, scope, tech stack, configuration, and current behaviour (dashboard and API). Use it to onboard, scope work, and keep the codebase and docs aligned.

---

## 1. Vision

**Veridion API** is a **standalone HTTP API and database** for EU-focused compliance tooling. It is built to:

- Provide a **separate service and database** from any other Veridion product (e.g. veridion-nexus), with no shared code or migration path.
- Expose **health, auth, and compliance endpoints** that frontends and other services can call.
- Support **four compliance pillars** at the data layer:
  - **Sovereign Shield** — international transfer monitoring and blocking (GDPR Art. 44–49).
  - **Evidence Vault** — append-only, sealed evidence for audits and export.
  - **Human Oversight** — queue and status for human review (e.g. EU AI Act Art. 14).
  - **Accountability Ledger** — tamper-evident audit log for AI agent tool calls (EU AI Act Art. 12, GDPR Art. 30).

The vision is a **single, deployable API** that owns its schema and can grow from a minimal service into a full compliance API without depending on another codebase.

---

## 2. What This Project Is

| Aspect | Description |
|--------|-------------|
| **Product** | Standalone REST API plus Sovereign Shield dashboard (Next.js). Own PostgreSQL database. Own migrations. |
| **Boundary** | No shared migrations, shared DB, or shared Rust crates with veridion-nexus or other repos. |
| **Current scope** | Health, dev auth (JWT), CORS; Evidence Vault (events, verify-integrity, **canonical JSON payload hashing** for chain verification, `hash_version` column, admin recompute-hashes; PDF export); Sovereign Shield (ingest/evaluate with agent_id/agent_api_key; **per-agent policy** applies to non–SCC-required destinations; **SCC-required** destinations skip agent destination/partner allowlists — enforcement is **shield + SCC registry** → REVIEW / ALLOW / BLOCK for org-blocked countries only; evidence + review queue; **SovereignMap** colors EU/adequate vs SCC vs org-blocked correctly even in **Shadow Mode**); SCC registries (CRUD, PATCH tia_completed, dpa_id, scc_module; auto-approve on register; **auto-expiry background job**); Human Oversight (review queue with transfer_count burst grouping, pending/decided, approve/reject, decided-evidence-ids); **Auth** (login, logout, dev-reset-password); **Trial enforcement** — expired `free_trial` tenants get **402** on login and on authenticated `/api/v1/*` calls; dashboard **`checkTrialExpired`** opens **`TrialExpiredModal`** (CTA: **mailto** to book an upgrade until a live Cal.com page exists); Self-serve signup (POST /api/v1/auth/register, input validation, rate limiting 5/IP/hour, bcrypt password, async welcome email via SMTP); **Agent Registry** (POST/GET/DELETE agents, agent card, rotate key, per-agent policy where applicable); **Accountability Ledger** — **`mcp-server-gateway/`** npm package **`veridion-nexus-gateway`** (MCP Governance Gateway) with real upstream stdio/SSE (`UpstreamMcpClient`), tool call logging, SHA-256 hash-chained audit trail, **Phase 3 Ed25519** signatures on `tool_call_events` (canonical JSON via `src/signing.rs` + `evidence::canonical_json`), **`GET /api/acm/events/{id}/verify`** (service token), **`GET /api/public/keys/signing`** (public key + `key_id`), optional **`ED25519_PRIVATE_KEY`** or ephemeral key (warn); **`scripts/generate_ed25519_key.sh`** for operator keygen; context trust annotations, OAuth 2.1 / dev_bypass, ACM Rust API routes (`/api/acm/*`); **Public Compliance Registry** (cross-tenant search/detail/stats, dashboard opt-in); **Public validator & sandbox keys** — `POST /api/public/validate` (ACM-shaped JSON → article mapping), `POST /api/public/sandbox/create` (`sbx_` key, rate-limited per IP; **not** wired to Shield evaluate yet — see §9.14); landing **Get API Key** hero button; **ACM Dashboard** (Phase 2b: ACM Overview stats, Oversight Queue with approve/reject/escalate, Transfers table — **sidebar** lists ACM Overview under System; Oversight Queue and Transfers are not in the nav but routes remain). **MCP packages**: **`veridion-nexus-mcp`** (`mcp-server/`, Sovereign Shield tools only), **`veridion-nexus-gateway`** (`mcp-server-gateway/`, MCP Governance Gateway). Deprecated: **`mcp-server-shield/`**. Migrations 001–046. |
| **Planned scope** | Production auth hardening; **agent-native demo** — sandbox token → demo tenant **`/api/v1/shield/evaluate`** (§9.14). |

**What it is not:** Not a fork or subset of veridion-nexus. Not a monorepo member that shares `migrations/` or `src/` with another project.

### 2.1 Regulatory scope (GDPR Chapter V)

Canonical write-up: **`docs/REGULATORY_SCOPE.md`**. In short:

- **Art. 46**: Runtime automates **SCC** registry checks; **BCR** and other Art. 46 mechanisms are **manual / out of automated evaluation**.
- **Art. 49** (derogations): **Not automated**; documented as out of scope; possible future roadmap item.
- **Blocked tier**: **Organizational policy**, not “blocked by law” for a named country.
- **Unknown / unclassified**: **BLOCK** = **conservative product default**; other bases may exist outside the engine.
- **SCC registry match** ≠ full Schrems / TIA compliance — see public docs Limitations.
- **Country lists**: static in `src/shield.rs` and `dashboard/app/config/countries.ts`; **last reviewed March 2026**; **quarterly review** against Commission sources recommended.

---

## 3. Overview (runtime)

- **Backend**: Rust (Actix-web) API on `http://localhost:8080`.
- **Frontend**: Next.js 14 dashboard (Sovereign Shield) in `dashboard/`, on `http://localhost:3000`.
- **Landing page**: Next.js 14 in `veridion-landing/`, on `http://localhost:3001`. Contains marketing page and self-serve signup flow.
- **MCP packages**: **`veridion-nexus-mcp`** — from `mcp-server/` (Shield tools only; `npx -y veridion-nexus-mcp`, `VERIDION_NEXUS_API_KEY`). **`veridion-nexus-gateway`** — from **`mcp-server-gateway/`** (MCP Governance Gateway: forwards to an upstream MCP, records ACM events to the Rust API). Configure via **`mcp-server-gateway/.env`** (see `.env.example`): `AL_API_BASE_URL`, `AL_SERVICE_TOKEN`, `AL_AUTH_MODE`, `AL_DEV_CLIENT_ID`, `UPSTREAM_MCP_MODE`, `UPSTREAM_MCP_COMMAND` (e.g. `node …/mcp-server/dist/index.js` for Sovereign Shield upstream). Legacy **`mcp-server-shield/`** is deprecated. Optional duplicate AL sources under `mcp-server/src/al-proxy.ts` may exist for history; the **shipping** gateway package is **`mcp-server-gateway`**.
- **Theme**: Dark (slate-900/800/700), emerald accents. Icons: `lucide-react`. Fonts: Inter, JetBrains Mono.

---

## 4. Tech stack

### 4.1 Backend (Rust)

| Layer    | Technology        |
|----------|-------------------|
| Language | Rust 2021         |
| Async    | Tokio             |
| HTTP     | Actix-web 4       |
| Database | PostgreSQL + SQLx |
| Auth     | JWT, bcrypt       |
| Config   | `.env` / env vars |
| Logging  | log, env_logger   |

Dependencies: serde/serde_json, chrono, uuid, dotenv.

### 4.2 Dashboard (Next.js)

- **Next** 14.x (App Router), **React** 18, **Tailwind CSS** 3.x, **lucide-react**, **react-simple-maps** (TopoJSON from world-atlas@2).
- **Scripts**: `npm run dev` (port 3000), `build`, `start`, `lint`.

### 4.3 MCP — Sovereign Shield (`veridion-nexus-mcp`)

- **Package**: **`veridion-nexus-mcp`** — single binary `veridion-nexus-mcp` → `mcp-server/dist/index.js` (Sovereign Shield tools).
- **Language**: TypeScript 5.x · **Runtime**: Node.js ≥18 (ESM: `"type": "module"`)
- **Framework**: `@modelcontextprotocol/sdk` v1.27+, `zod`
- **Transport**: stdio (Claude Desktop, Cursor)
- **Auth**: `VERIDION_NEXUS_API_KEY` (required); optional `VERIDION_NEXUS_API_URL`
- **Scripts**: `npm run build` (`tsc` — only `src/index.ts` emitted), `npm start` → `node dist/index.js`
- **Deprecated**: standalone `veridion-shield-mcp` in `mcp-server-shield/` — use `veridion-nexus-mcp` instead.

### 4.4 MCP Governance Gateway (`veridion-nexus-gateway`)

- **Package**: **`veridion-nexus-gateway`** in **`mcp-server-gateway/`** (`package.json` name `veridion-nexus-gateway`, bin `veridion-nexus-gateway` → `dist/index.js`).
- **Stack**: `@modelcontextprotocol/sdk`, `jose` (OAuth/JWT); **Node** ≥18, ESM.
- **Scripts**: `npm run build` (`tsc`), `npm start` / `npm run dev` (loads `.env` via `--env-file .env` where configured).
- **Upstream**: `UPSTREAM_MCP_MODE=stdio` | `sse`; **`UPSTREAM_MCP_COMMAND`** launches the upstream MCP (e.g. Sovereign Shield **`mcp-server/dist/index.js`**).
- **Rust API**: `AlClient` posts to **`/api/acm/*`** using `AL_SERVICE_TOKEN` (see §5.2).
- **Legacy / duplicate**: `mcp-server/src/al-proxy.ts` and siblings are **not** the primary AL surface; use **`mcp-server-gateway`** for the MCP Governance Gateway.

---

## 5. Project structure and configuration

### 5.1 Directory layout

```
veridion-api/
├── Cargo.toml
├── src/                    # Rust API (main.rs, routes_*, evidence, shield, routes_acm, etc.)
├── migrations/             # Schema 001–046 (no external path)
├── scripts/                # e.g. generate_ed25519_key.sh (Ed25519 seed for ED25519_PRIVATE_KEY)
├── dashboard/              # Next.js Sovereign Shield dashboard (port 3000)
├── veridion-landing/       # Next.js landing page + signup flow (port 3001)
├── mcp-server/             # veridion-nexus-mcp: Sovereign Shield MCP (dist/index.js)
├── mcp-server-gateway/          # veridion-nexus-gateway: MCP Governance Gateway (dist/index.js); .env for AL + upstream
├── mcp-server-shield/      # Deprecated — legacy standalone veridion-shield-mcp; use veridion-nexus-mcp
├── docs/adr/              # Architecture Decision Records (ADR 001: AL architecture)
├── .env
├── PROJECT_REFERENCE.md    # This file
└── …
```

**Migrations:** 46 (001–046). Key tables: `users`, `tenants`, `compliance_records`, `human_oversight`, `evidence_events`, `scc_registries`, `system_settings`, `agents`, `policy_versions`, `tool_call_events`, `context_trust_annotations`. Migration **022** adds `evidence_event_id` to `compliance_records`. **023** adds `tia_completed` (Transfer Impact Assessment) to `scc_registries`. **024** adds `dpa_id` and `scc_module` to `scc_registries`. **025** creates `system_settings` (key/value) with PRIMARY KEY on `key`. **026** creates `tenants` table and adds `tenant_id` columns to all data tables for multi-tenancy; updates `system_settings` to drop old PRIMARY KEY and add UNIQUE constraint on `(key, tenant_id)` for multi-tenant support. **027** adds FK constraint `users.company_id → tenants.id`. **028** links admin user to admin tenant. **029** seeds `system_settings` for admin tenant with `enforcement_mode='shadow'` using `ON CONFLICT (key, tenant_id)`. **030** adds `transfer_count` to `compliance_records` (burst grouping for review queue). **031** creates `agents` and `policy_versions` tables (agent registry, per-agent policy). **032** adds `api_key_hash` to `agents`. **033** adds `deleted_at` to `agents` (soft delete). **035** creates `tool_call_events` table (ACM ToolCallEvent — append-only, SHA-256 hash-chained, UUID FK to agents, JSONB inputs/outputs, OTel trace_id/parent_span_id, context_trust_level, legal_basis, purpose, eu_ai_act_risk_level; originally no row updates; `acm_tool_call_events` view). **036** creates `context_trust_annotations` table (ACM ContextTrustAnnotation — session-level trust tracking, monotonic degradation trusted→degraded→untrusted, sources_in_context JSONB, triggered_human_review; `acm_session_trust_summary` view for current trust level). **037** extends `agents` table with ACM AgentRecord fields (oauth_client_id, oauth_issuer, oauth_scope, eu_ai_act_risk_level, processes_personal_data, automated_decision_making, deployment_environment, deployment_region, data_residency, transfer_policies JSONB, tools_permitted JSONB, a2a_card_url, retention_policy JSONB; `acm_agent_records` view). **038** adds Public Compliance Registry fields on `agents` (`public_registry_listed`, `public_registry_description`, `public_registry_contact_email`, `public_registry_listed_at`) plus indexes for listing and full-text search. **039** creates `data_transfer_records` (ACM DataTransferRecord), `eea_countries`, view `acm_data_transfer_records`. **040** extends `human_oversight` for ACM (nullable `seal_id`, `agent_id`, `event_ref`, `review_trigger`, `reviewer_outcome`, etc.), views `acm_human_oversight_records` and `acm_oversight_pending`. **043** adds `hash_version` on `evidence_events` and supports recomputing stored `payload_hash` values using **canonical JSON** (recursive key sort) so on-chain verification stays consistent after PostgreSQL JSONB reordering; admin `POST /api/v1/admin/recompute-hashes` backfills legacy rows. **044** creates **`sandbox_keys`** (hashed `sbx_` API keys issued by `POST /api/public/sandbox/create`, IP + timestamp for rate limiting). **045** adds **`signature`** and **`signing_key_id`** (nullable) to **`tool_call_events`**; refreshes `acm_tool_call_events` view. **046** replaces the strict no-update rule with a **BEFORE UPDATE** trigger: only **`signature`** and **`signing_key_id`** may change (all other columns immutable), so the API can attach Ed25519 signatures after insert without allowing general row edits. Full list in `migrations/`.

### 5.2 Configuration

| Variable         | Required | Purpose |
|------------------|----------|---------|
| `DATABASE_URL`   | Yes      | PostgreSQL connection string |
| `SERVER_HOST`    | No       | Bind host (default `0.0.0.0`) |
| `SERVER_PORT`    | No       | Bind port (default `8080`) |
| `ALLOWED_ORIGINS`| No       | CORS origins (default: `http://localhost:3000,http://127.0.0.1:3000,https://app.veridion-nexus.eu`) |
| `RUST_ENV`       | No       | e.g. `development`; production disables dev-bypass |
| `JWT_SECRET`     | No       | JWT secret (dev default if unset) |
| `MIGRATIONS_PATH`| No       | Override migrations dir (default `./migrations`) |
| `RESET_MIGRATIONS` | No     | If set, re-run all migrations (one-time fix) |
| `SMTP_HOST`      | No       | SMTP server host (e.g. smtp.resend.com) |
| `SMTP_PORT`      | No       | SMTP port (default 587) |
| `SMTP_USER`      | No       | SMTP username |
| `SMTP_PASSWORD`  | No       | SMTP password or API key |
| `SMTP_FROM`      | No       | From address (default noreply@veridion-nexus.eu) |
| `AL_SERVICE_TOKEN` | No     | Service token for ACM API routes (`/api/acm/*`). If unset in dev, ACM routes are open. Required in production. |
| `ED25519_PRIVATE_KEY` | No | **Ed25519 signing (Phase 3).** Base64-encoded **32-byte** private key seed for ACM `tool_call_events` signatures. Generate locally: `bash scripts/generate_ed25519_key.sh` (append output to `.env`; never commit). If unset, the API uses an **ephemeral** key at startup (logged as a warning) — signatures do not survive restarts and verification across deploys will not match historical keys. If set but **invalid** (bad base64 or length ≠ 32 bytes decoded), the process **exits immediately** with **`FATAL: ED25519_PRIVATE_KEY: …`** on stderr (exit code **1**) — the API does not start. `signing_key_id` in DB is the first **16** hex chars of SHA-256(public key). |
| `AL_API_BASE_URL` | No      | Rust API base URL for AL proxy (default `http://127.0.0.1:8080`) |
| `AL_OAUTH_ISSUER` | No      | OAuth 2.1 issuer URL for AL proxy token validation |
| `AL_OAUTH_AUDIENCE` | No    | OAuth 2.1 audience for AL proxy token validation |
| `AL_JWKS_URI`    | No       | JWKS endpoint for AL proxy JWT verification |
| `AL_AUTH_MODE`    | No      | `jwks` (default) or `dev_bypass` — AL proxy token validation (never use `dev_bypass` in production) |
| `AL_DEV_CLIENT_ID` | No     | Required when `AL_AUTH_MODE=dev_bypass` |
| `AL_AGENT_TOKEN` | No       | Agent Bearer token (stdio: often set by launcher) |
| `UPSTREAM_MCP_MODE` | No   | `stdio` (default) or `sse` — how the AL proxy reaches the upstream MCP server |
| `UPSTREAM_MCP_COMMAND` | Yes (stdio) | Shell command to launch upstream (e.g. `node /path/to/upstream/dist/index.js`) |
| `UPSTREAM_MCP_ARGS` | No    | Optional JSON array of extra argv, e.g. `["--flag"]` |
| `UPSTREAM_MCP_URL` | Yes (sse) | SSE endpoint URL when `UPSTREAM_MCP_MODE=sse` |
| `UPSTREAM_MCP_RECONNECT_MS` | No | Reconnect delay after upstream disconnect (default `5000`) |
| `AL_ORIGIN_COUNTRY` | No | Default ISO country code for DataTransferRecord `origin_country` in AL proxy (default `DE`) |
| `AL_EEA_EXTRA_COUNTRIES` | No | Comma-separated extra codes treated as EEA in AL proxy (e.g. after adequacy changes) |

**Note:** If SMTP vars are not set, welcome email is skipped silently. Signup still succeeds.

---

## 6. How to run

1. Create a PostgreSQL database (e.g. `veridion_api`).
2. Set `DATABASE_URL` in `.env`.
3. **API:** From project root run `cargo run`. Migrations run on startup.
4. **Dashboard:** In `dashboard/` run `npm run dev` (port 3000).
5. Dev login: `GET /api/v1/auth/dev-bypass` (admin / password after seed).

---

## 7. Background jobs

- **SLA timeout** (every 5 min): Auto-blocks pending review items older than 24 hours.
- **SCC auto-expiry** (every 1 hour): Marks expired SCCs in `scc_registries` (status/archived).

---

## 8. Design principles

- **Single entrypoint** — One binary, one `main.rs`.
- **Own database** — All schema in `./migrations`; no references to other projects.
- **Pillar-ready schema** — Tables for all three pillars; API and logic added incrementally.
- **No nexus code** — Standalone; no shared paths or copy-paste from veridion-nexus.

---

## 9. Endpoints (summary)

### 9.1 Core endpoints

| Method + path | Purpose |
|---------------|--------|
| `GET /` | API info (name, version, docs) |
| `GET /health` | Liveness |
| `GET /api/v1/auth/dev-bypass` | Developer login (JWT) |
| `POST /api/v1/auth/login` | Email/password login; returns JWT with tenant_id, user, tenant; `remember_me` extends token to 30 days |
| `POST /api/v1/auth/logout` | Logout (client clears token; no server-side invalidation) |
| `POST /api/v1/auth/dev-reset-password` | Dev only: reset password by username |
| `GET /api/v1/auth/me` | Get current user from JWT token |
| `GET /api/v1/system/config` | System configuration (runtime mode, enforcement mode) |
| `GET /api/v1/settings` | Current enforcement mode (shadow \| enforce) |
| `PATCH /api/v1/settings` | Update enforcement mode. shadow→enforce requires confirmation_token: "ENABLE_ENFORCEMENT" |
| `GET /api/v1/my/enabled-modules` | Enabled modules (returns empty array) |
| `GET /api/v1/modules` | Available modules (returns empty array) |
| `GET /api/v1/audit/alerts` | Audit alerts (returns empty array) |

### 9.2 Evidence Vault

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/evidence/events` | List evidence events (with pagination, filters: severity, event_type, search, destination_country, source_system, limit, offset); returns `events`, `totalCount`, `merkleRoots` |
| `POST /api/v1/evidence/events` | Create evidence event |
| `POST /api/v1/evidence/verify-integrity` | Verify chain integrity (payload hashes use canonical JSON in `src/evidence.rs`) |
| `POST /api/v1/admin/recompute-hashes` | Admin: recompute legacy `payload_hash` / `hash_version` after canonical-hash upgrade |

### 9.3 Sovereign Shield

| Method + path | Purpose |
|---------------|--------|
| `POST /api/v1/shield/evaluate` | Evaluate transfer (synchronous runtime enforcement). **Shadow Mode**: Returns `ALLOW` decision to caller but records real decision (BLOCK/REVIEW/ALLOW) in evidence with `payload.shadow_mode: true`. Response reason includes "SHADOW MODE — would have been {decision}: {reason}". |
| `POST /api/v1/shield/ingest-logs` | Batch ingest transfer logs. **Shadow Mode**: Same behavior as evaluate — returns ALLOW but records real decisions with `shadow_mode: true`. |
| `GET /api/v1/lenses/sovereign-shield/stats` | Shield statistics |
| `GET /api/v1/lenses/sovereign-shield/countries` | Country classifications |
| `GET /api/v1/lenses/sovereign-shield/requires-attention` | Items requiring attention |
| `GET /api/v1/lenses/sovereign-shield/transfers/by-destination` | Transfers grouped by destination |

### 9.4 SCC Registries

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/scc-registries` | List SCC registries |
| `POST /api/v1/scc-registries` | Register SCC (partnerName, destinationCountryCode, expiresAt, tiaCompleted, dpaId, sccModule); **auto-approves** matching pending reviews |
| `PATCH /api/v1/scc-registries/{id}` | Update SCC (e.g. `tiaCompleted`) |
| `DELETE /api/v1/scc-registries/{id}` | Revoke SCC |

### 9.5 Human Oversight / Review Queue

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/review-queue` | List all review items (with status filter) |
| `GET /api/v1/human_oversight/pending` | List pending review items |
| `GET /api/v1/human_oversight/decided-evidence-ids` | Evidence IDs already decided (exclude from Requires Attention) |
| `POST /api/v1/review-queue` | Create review item (with `evidence_event_id`, optional `agent_id`; default `sovereign-shield`) |
| `POST /api/v1/action/{seal_id}/approve` | Approve review |
| `POST /api/v1/action/{seal_id}/reject` | Reject review → `HUMAN_OVERSIGHT_REJECTED` (counted in BLOCKED 24H) |

**Note:** Dashboard calls `/api/v1/shield/evaluate` via `evaluateTransfer()`. Full route list in `src/main.rs` startup log. Evidence API returns `merkleRoots` for chain integrity display. **Evaluate** accepts `agent_id` and `agent_api_key` — when provided and valid, applies per-agent **`allowed_data_categories`** for all destinations, **`allowed_destination_countries`** only when the destination is **not** SCC-required (`classify_country` ≠ `scc_required`), and **does not** apply **`allowed_partners`** to SCC-required destinations (partner/SCC posture is **shield + SCC registry**: no SCC → REVIEW, valid SCC → ALLOW, org-blocked countries → BLOCK). Unregistered agents cannot evaluate (see handler).

### 9.8 Agent Registry

| Method + path | Purpose |
|---------------|--------|
| `POST /api/v1/agents` | Register agent (name, description, version, url, provider_org, provider_url, allowed_data_categories, allowed_destination_countries, allowed_partners). Returns agent card with `agent_api_key` (shown once only). |
| `GET /api/v1/agents` | List agents (tenant-scoped) |
| `GET /api/v1/agents/{id}` | Get agent with policy history |
| `GET /api/v1/agents/{id}/card` | Public agent card (A2A-compatible; no auth required) |
| `POST /api/v1/agents/{id}/rotate-key` | Rotate agent API key; returns new key (shown once) |
| `DELETE /api/v1/agents/{id}` | Soft delete agent |

**Agent format**: `agt_{12hex}` IDs; `agt_key_{32hex}` API keys. Policy stored in `policy_versions`; `policy_hash` = SHA-256 of allowed categories/countries/partners.

### 9.9 ACM Routes (Accountability Ledger)

Internal API routes called by the MCP Governance Gateway (npm: `veridion-nexus-gateway`). Authenticated via `AL_SERVICE_TOKEN` (not tenant auth). Routes live at `/api/acm/` to bypass tenant middleware.

| Method + path | Purpose |
|---------------|--------|
| `GET /api/acm/agents?oauth_client_id={id}` | Resolve agent by OAuth client ID. Returns ACM-relevant fields: tools_permitted, EU AI Act classification, transfer policies, deployment info, retention policy. |
| `POST /api/acm/events` | Create a tool call event with SHA-256 hash chaining. Fetches previous `event_hash` for the agent and links via `prev_event_hash`. Fields: agent_id, session_id, tool_id, inputs/outputs (JSONB), context_trust_level, decision_made, human_review_required, legal_basis, purpose, eu_ai_act_risk_level, trace_id, parent_span_id. **`session_id`:** empty or whitespace-only → server generates a **new UUID**; non-empty values **must** be a valid UUID or the API returns **400** `{"error":"invalid_session_id","message":"session_id must be a valid UUID"}`. **Phase 3 (Ed25519):** After insert, the API builds **canonical JSON** from `event_id`, `agent_id`, `tool_id`, `session_id`, `event_hash`, and `created_at` (deterministic string via `src/signing.rs` → `evidence::canonical_json`), signs with the server’s Ed25519 private key (`ED25519_PRIVATE_KEY` or ephemeral), then **UPDATE**s **`signature`** and **`signing_key_id`** only (migration **046**). Response includes `signature` and `signing_key_id` when signing succeeds. On insert or signature-persist failure, the JSON body uses **generic** `error` strings (`Failed to create event`, `Failed to persist signature`); details are **logged** server-side only. |
| `GET /api/acm/events/{id}/verify` | **Phase 3.** Verify a stored event’s Ed25519 signature (same **`AL_SERVICE_TOKEN`** auth as other `/api/acm/*` routes). **`{id}`** = `event_id` (UUID). Loads the row from **`tool_call_events`**. If **`signature`** is null → **`200`** `{"verified":false,"reason":"unsigned"}`. Else rebuilds the same canonical JSON from stored columns and checks **`verify_signature`** against the **current** process public key. **Success:** `{"verified":true,"event_id","key_id","algorithm":"Ed25519"}`. **Bad signature:** `{"verified":false,"reason":"invalid_signature"}`. **Not found:** **404** if no row for that `event_id`. **Note:** Verification uses the key loaded at **this** process startup; if `ED25519_PRIVATE_KEY` changed since the event was signed, verification fails until multi-key lookup by `signing_key_id` exists. |
| `POST /api/acm/trust-annotations` | Create a context trust annotation. Enforces monotonic degradation (trusted → degraded → untrusted; never back up within a session). Fields: trust_level, sources_in_context, degradation_trigger, triggered_human_review. On failure, response uses generic **`error`: `Failed to create annotation`** (details logged only). |
| `GET /api/acm/trust-annotations/session/{id}/current` | Get the current (lowest) trust level for a session. Returns the most degraded annotation. |
| `POST /api/acm/transfers` | Create a **DataTransferRecord** (GDPR Chapter V). Optional `event_ref` links to `tool_call_events`. Sets `schrems_iii_risk` when DPF is relied on without backup. |
| `PATCH /api/acm/transfers/schrems-iii-review` | Bulk-flag DPF transfers without backup as Schrems III risk. |
| `POST /api/acm/oversight` | Create **HumanOversightRecord** on `human_oversight` (ACM fields). `seal_id` nullable for ACM-only rows (migration 040). Back-fills `tool_call_events.oversight_record_ref` when `event_ref` is set. |
| `GET /api/acm/oversight/pending` | List pending oversight (`?tenant_id=` optional). |
| `PATCH /api/acm/oversight/{id}` | Set reviewer outcome (`approved` / `rejected` / `escalated` / `pending`), optional notes, EU AI Act compliance flag. |

**Auth**: Service token via `Authorization: Bearer {AL_SERVICE_TOKEN}`. In development mode with no token configured, routes are open. **`agent_id`** on create routes is the **`agents.id` TEXT** value (e.g. `agt_…`), resolved per-tenant — not required to be a UUID.

**Migrations 039–040**: `039` — `data_transfer_records`, `eea_countries` reference data, `acm_data_transfer_records` view. `040` — extend `human_oversight` with ACM columns; `seal_id` nullable; views `acm_human_oversight_records`, `acm_oversight_pending`.

**Migrations 045–046 (Ed25519):** **`045`** — nullable **`signature`** / **`signing_key_id`** on **`tool_call_events`**; view updated. **`046`** — append-only semantics preserved: **UPDATE** allowed only when changing **`signature`** or **`signing_key_id`** (trigger rejects any other column change).

### 9.12 ACM Dashboard Routes

Dashboard-facing endpoints authenticated via JWT (tenant-scoped via `get_tenant_context`). Used by the ACM dashboard pages.

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/acm/stats` | Aggregate ACM stats for the tenant: oversight_pending, oversight_decided, transfers_total, transfers_schrems_risk, tool_call_events_total, trust_degraded_sessions. |
| `GET /api/v1/acm/oversight?status=pending\|decided\|all` | List oversight records with agent name join. Tenant-scoped. Returns `{ data: [...], total }`. |
| `PATCH /api/v1/acm/oversight/{id}` | Resolve oversight record (approved/rejected/escalated). Tenant-scoped — only updates records belonging to the logged-in tenant. |
| `GET /api/v1/acm/transfers` | List data transfer records with agent name join. Tenant-scoped. Returns `{ data: [...], total }`. |

**Auth**: Standard JWT Bearer token (same as all `/api/v1/*` dashboard routes). These are separate from the service-token-authenticated `/api/acm/*` routes used by the MCP proxy.

### 9.10 Admin Routes

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/admin/tenants` | List all tenants (cross-tenant query, no tenant_id filter) |
| `GET /api/v1/admin/stats` | Admin KPI stats (total_tenants, active_trials, pro_tenants, total_evaluations_month) — cross-tenant |
| `POST /api/v1/admin/tenants` | Create tenant |
| `PATCH /api/v1/admin/tenants/{id}` | Update tenant (plan, mode, trial_expires_at, rate_limit_per_minute) |
| `DELETE /api/v1/admin/tenants/{id}` | Soft delete tenant (sets deleted_at) |
| `POST /api/v1/admin/tenants/{id}/rotate-api-key` | Rotate tenant API key |

**Auth**: Admin routes verify admin access via `verify_admin()` function which checks JWT `is_admin` claim or API key `is_admin` flag. Admin routes are **cross-tenant by design** — all queries operate across all tenants without `tenant_id` filtering. Only admin context permits cross-tenant queries.

### 9.11 Public Compliance Registry

| Method + path | Purpose |
|---------------|--------|
| `GET /api/public/registry/agents` | Search public registry (query params: `q`, `eu_ai_act_risk_level`, `deployment_region`, `data_residency`, `processes_personal_data`, `page`, `limit`). Cross-tenant, no auth. Returns paginated agent list with compliance profiles. |
| `GET /api/public/registry/agents/{agent_id}` | Public agent profile with EU AI Act classification, deployment info, accountability ledger status. No auth. |
| `GET /api/public/registry/stats` | Aggregate stats: total listed, by risk level, by region, by data residency. No auth. |
| `PATCH /api/v1/agents/{agent_id}` | Update agent registry fields (`public_registry_listed`, `public_registry_description`, `public_registry_contact_email`). Tenant-scoped, JWT auth. |

**Auth**: Public endpoints (`/api/public/registry/*`) require no authentication — they are designed for DPOs and compliance officers to discover agents. The PATCH endpoint is tenant-scoped (standard JWT auth).

**Migration 038**: Adds `public_registry_listed`, `public_registry_description`, `public_registry_contact_email`, `public_registry_listed_at` to `agents` table with GIN full-text search index.

### 9.13 Public validator and sandbox API keys (shipped)

No tenant middleware — routes under `/api/public/` (same exemption pattern as §9.11: paths do not start with `/api/v1/`, so **`TenantAuthMiddleware` passes them through** without API key/JWT).

| Method + path | Purpose |
|---------------|--------|
| `POST /api/public/validate` | Accepts JSON body shaped like an ACM ToolCallEvent. Returns **`valid`**, **`missing_fields`**, **`articles_triggered`** (EU AI Act Art. 12(1)(a), 14, 9; GDPR Art. 30, 5(1)(e) warnings), **`warnings`**. No auth. |
| `GET /api/public/keys/signing` | **Phase 3.** Returns the API’s **Ed25519 public key** (base64) and **`key_id`** (stable id derived from the public key) for offline or third-party verification of **`tool_call_events.signature`**. No auth. Same key material the verify endpoint uses **at this runtime** (see caveat in §9.9 for key rotation). |
| `POST /api/public/sandbox/create` | Issues a **`sbx_`** + 32 hex char key; stores **SHA-256** hash, **key_prefix**, client **IP** (from `X-Forwarded-For` / peer). **Rate limit:** max **3 keys per IP per 24 hours** (429 if exceeded). Returns **`sandbox_key`**, **`expires_in`**, **`note`**, **`example`** (example **`curl`** for the validator). No auth. **Migration 044:** table **`sandbox_keys`**. |

**Landing (`veridion-landing/app/page.tsx`)**: Hero **“Get API Key”** calls **`POST …/api/public/sandbox/create`** (`NEXT_PUBLIC_API_URL`), opens a dark modal with the key, copy button, example command, link to **`/signup`**. Key is not persisted client-side after close.

### 9.14 Agent-native demo flow (planned)

**Goal:** Allow an AI agent with web browsing capability to **autonomously** discover Veridion, obtain a sandbox key, run a **real** compliance evaluation, and return a meaningful assessment to the user — **no human in the loop** and **no signup required**.

**Why:** In an agentic world, a potential customer may instruct their agent: *“find me GDPR compliance software with an MCP gateway, test it, report back.”* If Veridion can be discovered, tested, and assessed autonomously, it shows up in that result with a **real evaluation** rather than only a marketing page.

**Current state (partially built):**

- `POST /api/public/sandbox/create` — returns an **`sbx_` key**, no auth (migration **044**, rate-limited **3/IP/24h**).
- `POST /api/public/validate` — schema validation + EU AI Act / GDPR article mapping, no auth.
- Landing **“Get API Key”** button calls **`sandbox/create`** and shows the key + example **`curl`** (validator).

**Gap:** **`sbx_` keys are not wired to Shield evaluation.** An agent can validate a schema but **cannot** run a real **GDPR Chapter V** transfer evaluation via **`POST /api/v1/shield/evaluate`** without a **full registered account** (tenant API key + registered agent).

**Planned build — demo tenant:**

- Pre-seed a **demo tenant** in the database with a fixed **demo API key**.
- `POST /api/public/sandbox/create` returns a **short-lived token** that **proxies** to the demo tenant’s **`POST /api/v1/shield/evaluate`** — read-only, rate-limited, **no durable tenant data** beyond the session design goal.
- The **`example`** field in the sandbox response includes a **real `evaluate_transfer` / evaluate curl** (not only the validator).
- An agent that calls **evaluate** via the sandbox gets back **ALLOW / REVIEW / BLOCK** with a **cryptographic seal** — a result it can report to the user as meaningful.

**UX distinction vs Public Compliance Registry:**

| Entry point | Audience | Moment |
|-------------|----------|--------|
| **`/api/public/registry/agents`** | DPOs, auditors | *“I already exist — find me.”* |
| **`/api/public/validate`** + **`/api/public/sandbox/create`** | Developers, agents | *“I’m building something — test it now.”* |

These are **different moments in the journey** and should stay **distinct** on the landing site (registry vs developer/sandbox flows).

**Not yet built.** Prerequisites: **demo tenant seed script** + **sandbox proxy layer** to Shield evaluate.

### 9.6 MCP — Sovereign Shield vs MCP Governance Gateway

**Active npm packages** (verified against repo `package.json` `name` fields): only **`veridion-nexus-mcp`** and **`veridion-nexus-gateway`** are maintained as product packages.

| npm `name` | Status | Directory |
|------------|--------|-----------|
| **`veridion-nexus-mcp`** | ✅ Active | `mcp-server/` |
| **`veridion-nexus-gateway`** | ✅ Active | `mcp-server-gateway/` |
| `veridion-shield-mcp` | Deprecated (superseded) | `mcp-server-shield/` |

**npm (legacy package name):** `nexus-al-mcp@0.1.2` on npm is **deprecated** — use **`veridion-nexus-gateway`** instead.

**npm (maintainers):** Packages are published under the **`veridion-nexus`** npm account. **Two-factor authentication** is enabled in **`auth-and-writes`** mode: **`npm publish`**, **`npm deprecate`**, and other registry writes require a one-time password — pass **`--otp=<code>`** from your authenticator when the CLI requests it.

**Note:** `mcp-server/package.json` also registers a **`bin`** named `veridion-nexus-gateway` → `./dist/al-proxy.js` alongside `veridion-nexus-mcp` → `./dist/index.js`. Prefer the **standalone** **`mcp-server-gateway/`** package (`veridion-nexus-gateway`) for gateway deployments; the bin inside `veridion-nexus-mcp` is optional/legacy wiring.

| Package | Purpose | Install | Required env |
|---------|---------|---------|--------------|
| **`veridion-nexus-mcp`** | **Sovereign Shield** tools (`evaluate_transfer`, `check_scc_coverage`, `get_compliance_status`, `list_adequate_countries`) | `npx -y veridion-nexus-mcp` | `VERIDION_NEXUS_API_KEY`; optional `VERIDION_NEXUS_API_URL` |
| **`veridion-shield-mcp`** | *Deprecated* — same tools historically; use **`veridion-nexus-mcp`** | *(deprecated)* | — |
| **`veridion-nexus-gateway`** | **MCP Governance Gateway** (upstream forwarding + ACM audit) | `cd mcp-server-gateway && npm run build`; run `veridion-nexus-gateway` or `node dist/index.js` | `AL_API_BASE_URL`, `AL_SERVICE_TOKEN`, `UPSTREAM_MCP_COMMAND`, plus `AL_AUTH_MODE` / OAuth vars — see §5.2 and `mcp-server-gateway/.env.example` |

**Repo layout**:
- **`mcp-server/`** — **`veridion-nexus-mcp`**: `src/index.ts` → `dist/index.js` (Shield only).
- **`mcp-server-gateway/`** — **`veridion-nexus-gateway`**: gateway entry `src/index.ts` → `dist/index.js`; **`al-client.ts`**, **`upstream-client.ts`**, **`oauth.ts`**, **`types/acm.ts`**.
- **`mcp-server-shield/`** — **Deprecated** standalone package; README points to `veridion-nexus-mcp`.

**Agent parameters**: Tool `evaluate_transfer` takes **`agent_id`** and **`agent_api_key`** on each call (registered in dashboard Agents). Optional env vars `VERIDION_NEXUS_AGENT_ID` / `VERIDION_NEXUS_AGENT_API_KEY` in some setups are not required for the MCP tools when parameters are passed per call.

**Versions (reference)**: `veridion-nexus-mcp@1.0.12` — confirm with `npm show veridion-nexus-mcp`. **`veridion-nexus-gateway`** — repo `mcp-server-gateway/package.json` is **`0.1.0`**; confirm the published package with `npm show veridion-nexus-gateway`.

**MCP registry** (umbrella listing): `io.github.Brano80/Veridion-nexus` on https://registry.modelcontextprotocol.io. Publishing uses `mcp-publisher` where applicable; keep tokens outside the repo.

**Tools (Sovereign Shield)**:

| Tool | Description |
|---|---|
| `evaluate_transfer` | Evaluate a cross-border transfer before it happens. Returns ALLOW, BLOCK, or REVIEW with cryptographic evidence seal. |
| `check_scc_coverage` | Check SCC registry for a specific partner/country combination. |
| `get_compliance_status` | Account compliance overview (enforcement mode, stats, pending, SCCs). |
| `list_adequate_countries` | Countries by GDPR transfer status; optional filter. |

**Setup (Shield)**: Claude Desktop — `claude_desktop_config.json`; Cursor — `.cursor/mcp.json`. Use **`veridion-nexus-mcp`** in `args` (e.g. `["-y", "veridion-nexus-mcp"]`) with `VERIDION_NEXUS_API_KEY`. See `mcp-server/README.md`. The **docs** page (`veridion-landing/app/docs/page.tsx`) may still show older package names in places — align copy with **`veridion-nexus-mcp`** when editing the landing site.

**Error handling**: 401/402/500 and network errors surface as formatted MCP text; trial **402** behaviour matches API.

**Shadow Mode**: When API response reason starts with `"SHADOW MODE"`, tools append a note that enforcement is not active.

#### MCP Governance Gateway (`veridion-nexus-gateway`)

The **MCP Governance Gateway** is shipped as **`mcp-server-gateway`** (**`veridion-nexus-gateway`**). The main **`veridion-nexus-mcp`** binary is Shield-only (`dist/index.js`); the same package optionally exposes `veridion-nexus-gateway` → `dist/al-proxy.js` — see the table above; **canonical gateway** is still **`mcp-server-gateway`**.

**Architecture**: See `docs/adr/001-al-architecture.md` (ADR).

**Key files** (**`mcp-server-gateway/src/`** — primary):
- `mcp-server-gateway/src/index.ts` — `AccountabilityLedgerProxy`: upstream via `UpstreamMcpClient`, ACM logging via `AlClient`, session trust, tool forwarding.
- `mcp-server-gateway/src/upstream-client.ts` — `UpstreamMcpClient`: MCP SDK **stdio** or **SSE** to upstream.
- `mcp-server-gateway/src/al-client.ts` — `AlClient`: HTTP to Rust **`/api/acm/*`**.
- `mcp-server-gateway/src/oauth.ts` — OAuth 2.1 / dev_bypass token handling (`jose` when JWKS).
- `mcp-server-gateway/src/types/acm.ts` — ACM record types.

**Optional legacy copy** under `mcp-server/src/` (e.g. `al-proxy.ts`) may exist; prefer **`mcp-server-gateway`** for builds and docs.

**Design principles**:
- **Fail-closed**: No log, no call. If event recording fails, the proxy does not forward the tool call.
- **Hash chain**: Each `ToolCallEvent` includes `event_hash` (SHA-256 of canonical fields) and `prev_event_hash` (link to previous event for the same agent).
- **Monotonic trust degradation**: Session trust can only go down (trusted → degraded → untrusted), never back up.
- **OAuth 2.1 agent identity**: Agent identity derived from Bearer token `client_id` claim, resolved via `GET /api/acm/agents?oauth_client_id={id}`. Self-reported identity is rejected.
- **tools_permitted allowlist**: Agents can only call tools listed in their `AgentRecord.tools_permitted` array.

**Environment variables**: Primary copy for local runs: **`mcp-server-gateway/.env`** (from **`mcp-server-gateway/.env.example`**). Also documented in `env.proxy.example` and root `.env.example` — AL vars (`AL_API_BASE_URL`, `AL_SERVICE_TOKEN`, `AL_OAUTH_ISSUER`, `AL_OAUTH_AUDIENCE`, `AL_JWKS_URI`, `AL_AUTH_MODE`, `AL_DEV_CLIENT_ID`, `AL_AGENT_TOKEN`, `AL_ORIGIN_COUNTRY`) and upstream vars (`UPSTREAM_MCP_MODE`, `UPSTREAM_MCP_COMMAND`, `UPSTREAM_MCP_ARGS`, `UPSTREAM_MCP_URL`, `UPSTREAM_MCP_RECONNECT_MS`).

**Phase 1 status (upstream)**: **Done.** The proxy uses `@modelcontextprotocol/sdk` `Client` with stdio or SSE transport; `listTools` and `callTool` forward to the configured upstream server; blocked paths (not in `tools_permitted`, upstream disconnected, upstream error) still emit `ToolCallEvent` records where applicable.

**Phase 2 (backend) status**: Data transfer records, oversight API, proxy wiring for transfers + oversight after tool events — **implemented** (migrations 039–040).

**Phase 2b (dashboard) status**: **Implemented** — ACM Overview (`/acm`), Oversight Queue (`/acm/oversight`) with approve/reject/escalate, Transfers table (`/acm/transfers`). Dashboard-facing JWT-authenticated API endpoints at `/api/v1/acm/*`. Separate ACM API client at `dashboard/app/lib/acm-api.ts`. **Sidebar**: System group shows **AI System Registry** and **ACM Overview** only; Oversight and Transfers are not in the nav (direct URLs/bookmarks still work).

**Phase 3 status**: **Implemented** — Ed25519 signing on `tool_call_events`. Migration **045** adds `signature` + `signing_key_id` columns. Migration **046** replaces the no-update rule with a selective trigger (only `signature` / `signing_key_id` may be updated). `src/signing.rs` handles key loading, signing, and verification. `POST /api/acm/events` signs each event after insert using canonical JSON of 6 fields. `GET /api/public/keys/signing` exposes the public key (no auth). `GET /api/acm/events/{id}/verify` verifies a stored signature. `ED25519_PRIVATE_KEY` (base64, 32-byte seed) must be set in production `.env` — generate with `scripts/generate_ed25519_key.sh`. **Hardening:** invalid `ED25519_PRIVATE_KEY` → process exit with `FATAL` on stderr; **`session_id`** validation and **generic** ACM error responses — see §9.9.

**Phase 3 TODOs** (other): Per-tool `inferDecisionMade` / PII heuristics configurable via `AgentRecord` metadata.

### 9.7 Shadow Mode

**Shadow Mode** is a pre-enforcement observation mode where the system records real policy decisions (BLOCK/REVIEW/ALLOW) but always returns `ALLOW` to the caller. This allows organizations to observe policy behavior before enabling enforcement.

- **Enforcement Mode Storage**: Stored in `system_settings` table (`key='enforcement_mode'`, value: `'shadow'` or `'enforce'`). Default: `'shadow'`.
- **API Behavior**: 
  - `POST /api/v1/shield/evaluate` and `POST /api/v1/shield/ingest-logs` return `{ decision: "ALLOW", ... }` to the caller in shadow mode, regardless of the real policy decision.
  - Real decision (BLOCK/REVIEW/ALLOW) is recorded in evidence events with `payload.shadow_mode: true`.
  - Response reason includes prefix: `"SHADOW MODE — would have been {decision}: {reason}"`.
- **Evidence Recording**: Normal event types are used (`DATA_TRANSFER`, `DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`). Only `payload.shadow_mode: true` distinguishes shadow mode events. No `real_decision` or `would_have_been` fields.
- **Human Oversight**: When creating `HUMAN_OVERSIGHT_REJECTED` or `HUMAN_OVERSIGHT_APPROVED` evidence events (manual approve/reject, auto-approve, SLA timeout), `shadow_mode: true` is added to payload if current enforcement mode is shadow.
- **Mode Switching**: 
  - `shadow` → `enforce`: Requires `confirmationToken: "ENABLE_ENFORCEMENT"` in `PATCH /api/v1/settings` request body.
  - `enforce` → `shadow`: No confirmation required.
- **Dashboard Display**: 
  - Banner shows current mode (SHADOW MODE yellow / ENFORCING green).
  - Transfer Log: Separate "Mode" column shows SHADOW badge when `payload.shadow_mode === true`.
  - Evidence Vault: SHADOW badge in EVENT column for shadow mode events.
  - Recent Activity: SHADOW badge shown alongside decision badge when `payload.shadow_mode === true`.

---

## 10. Dashboard structure

### 10.1 Layout and shell

- **`dashboard/app/layout.tsx`**: Root layout; title "Sovereign Shield Dashboard"; fonts Inter, JetBrains Mono.
- **`dashboard/app/globals.css`**: Tailwind; `:root` background `#0f172a`; custom scrollbar.
- **`dashboard/app/components/DashboardLayout.tsx`**: Sidebar + main content (`ml-64`, `p-8`).
- **`dashboard/app/components/Sidebar.tsx`**: Fixed left nav; branding "VERIDION" / "nexus" / "Compliance Dashboard v1.0.0". **Primary links** (emerald active style): Sovereign Shield → `/`, Review Queue → `/review-queue`, SCC Registry → `/scc-registry`, Adequate Countries → `/adequate-countries`, Transfer Log → `/transfer-log`, Evidence Vault → `/evidence-vault`. **Between two horizontal dividers**: empty spacer (former ACM block — "ACM" heading and nav links to Oversight Queue / Transfers were removed; visual gap preserved). **System** section: **AI System Registry** → `/agents`, **ACM Overview** → `/acm`, **Admin Panel** → `/admin` (admin only). Routes `/acm/oversight` and `/acm/transfers` remain valid (pages unchanged); they are not linked from the sidebar. **Sign Out** (footer). Active link: emerald highlight on primary nav; slate highlight on System links.

---

## 11. Pages (routes and behaviour)

### 11.1 Sovereign Shield (home) — `dashboard/app/page.tsx`

- **Route**: `/`
- **Enforcement Mode**: Banner at top: SHADOW MODE (yellow) — "All transfers are passing through. Decisions shown are not being enforced." or ENFORCING (green) — "ENFORCING — Blocking transfers". Toggle: "Enable Enforcement" (opens confirmation modal; type ENABLE_ENFORCEMENT to proceed) or "Switch to Shadow Mode". Mode persisted in `system_settings` table.
- **Data**: `fetchEvidenceEvents()`, `fetchSCCRegistries()`, `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`, `fetchSettings()`; auto-refresh 5s; Refresh button. **ensureEventsInReviewQueue** runs on load: finds SCC-required (REVIEW) events without a valid SCC (partner-specific check) and creates a review queue item via `createReviewQueueItem({ action, context, evidenceEventId })` for each not already in queue. Decided evidence IDs excluded from "Requires Attention".
- **Header**: "SOVEREIGN SHIELD", "GDPR Chapter V (Art. 44-49) • International Data Transfers". Refresh.
- **Status bar**: Status (ACTIVE when API is reachable and settings load successfully, OFFLINE only when API health check fails or settings cannot be fetched), Last scan. Zero transfers = active but idle, not offline.
- **KPI cards (8)**: Row 1 — TRANSFERS (24H), ADEQUATE COUNTRIES (24H) — grey when 0, green when >= 1, HIGH RISK DESTINATIONS (24H) — grey when 0, red when >= 1, **BLOCK (24H)** — grey when 0, red when >= 1 (policy blocks + `HUMAN_OVERSIGHT_REJECTED`). Row 2 — SCC COVERAGE (coverage only decreases for PENDING (unresolved) reviews; once a review is REJECTED, APPROVED, or SLA-expired, that destination no longer counts against coverage), EXPIRING SCCs — grey when 0, yellow when >= 1, **PENDING APPROVALS** — grey when 0, yellow when >= 1 (SCC-required without valid SCC), ACTIVE AGENTS.
- **Main**: **Left** — TRANSFER MAP (SovereignMap/WorldMap); EU/EEA adequate. **Right** — REQUIRES ATTENTION: only SCC-required without valid SCC, pending and not decided; click → Transfer Detail; up to 5; "View All →". **Below** — RECENT ACTIVITY (last 10 events, BLOCK/REVIEW/ALLOW badges; SHADOW badge shown when `payload.shadow_mode === true`).

### 11.2 Transfer Log — `dashboard/app/transfer-log/page.tsx`

- **Route**: `/transfer-log`. Data: `fetchEvidenceEventsPaginated()` (50 per page); filters ALL | ALLOW | BLOCK | PENDING; includes all transfer event types (sovereign-shield and agent-named). Table: Timestamp, Destination, Partner, Data Category, **Agent** (from `payload.agent_id`, `payload.agentId`, or `source_system`), Purpose (if present), Legal Basis, Mode (SHADOW badge or —), Status (BLOCK/REVIEW/ALLOW). **Shadow events** (`payload.shadow_mode === true`) show SHADOW badge in Mode column and real decision (BLOCK/REVIEW/ALLOW) in Status column. CSV export includes Mode column. Pagination controls.

### 11.3 Review Queue — `dashboard/app/review-queue/page.tsx`

- **Route**: `/review-queue`. Data: `fetchReviewQueuePending()`. Approve/Reject via `approveReviewQueueItem(sealId)` / `rejectReviewQueueItem(sealId)`. Table: Transfer Details (click → Transfer Detail), Reason, Suggested Decision, Source (module/agentId), Actions. Auto-refresh 5s.

### 11.4 SCC Registry — `dashboard/app/scc-registry/page.tsx`

- **Route**: `/scc-registry`. Data: `fetchSCCRegistries()`, `createSCCRegistry()`, `patchSCCRegistry()`. Wizard (Partner, Country; SCC Module C2C/C2P/P2P/P2C, DPA ID, dates, TIA completed; Submit). Pre-fill from `?country=` and `?partner=` query params. Filters (status, search) and KPI cards (Total Active, Expiring Soon, Expired, Archived). **KPI cards**: Grey icon and number when count is 0, colored (green/amber/red) when >= 1. Registry cards show Partner, Country, Module, DPA ID, expiry, TIA status; **Mark TIA Complete** button calls PATCH. Renew flow for expiring SCCs. Active/History tabs.

### 11.5 Login — `dashboard/app/login/page.tsx`

- **Route**: `/login`. Full-page login form with email/password authentication.
- **Auth**: Calls `POST {NEXT_PUBLIC_API_URL}/api/v1/auth/login` (uses `process.env.NEXT_PUBLIC_API_URL` environment variable, falls back to empty string for relative path). Stores JWT token in `localStorage` (`ss_token`, `ss_user`).
- **Redirect**: On success, redirects to `/` (Sovereign Shield home). On error, displays error message.
- **Remember me**: Optional checkbox; extends JWT expiry to 30 days when checked.
- **Layout**: Does not use `DashboardLayout` — standalone full-page form.

### 11.6 Adequate Countries — `dashboard/app/adequate-countries/page.tsx`

- **Route**: `/adequate-countries`. Static page (no API calls). 
- **KPI Summary Bar**: Four cards showing counts — ADEQUATE (green Shield icon), SCC REQUIRED (amber Globe icon), DPF CERTIFIED (US) — "Partial" (blue Shield icon), BLOCKED (red Shield icon).
- **Brazil Adequacy Callout**: Prominent blue callout card announcing Brazil adequacy decision (January 2026, Art. 45 GDPR). Brazil moved to Adequate Countries list.
- **Country Cards**: Each card shows GDPR article basis below badge:
  - Adequate countries: `Art. 45` (green)
  - SCC Required countries: `Art. 46(2)(c)` (orange)
  - Blocked countries: `Organizational policy` (red)
- **SCC Required Cards**: Include "Register SCC →" link button (`/scc-registry?country={code}`).
- **DPF Section**: Full-width section below three columns explaining EU-US Data Privacy Framework:
  - Left column: "What is DPF?" — adoption, self-certification, Art. 45 adequacy for certified companies
  - Right column: "Schrems III Risk" warning box — NOYB/Max Schrems challenges, ECJ review, recommendation to maintain SCCs
  - Footer note: Sovereign Shield evaluates US transfers as SCC-required by default; DPF-certified partners can override in SCC registry
- **Data**: India in SCC Required list, Venezuela in Blocked list. Last reviewed: March 2026.
- **Footer**: Includes BCR footnote about Binding Corporate Rules and approved codes of conduct.

### 11.7 Evidence Vault — `dashboard/app/evidence-vault/page.tsx`

- **Route**: `/evidence-vault`. Data: `fetchEvidenceEventsWithMeta()` (events, merkleRoots, totalCount), `verifyIntegrity()`. Query `?eventId=` highlights row. Auto-run chain integrity on load. KPI cards, status bar, filters (Risk Level, Destination Country, Search, Event Type). Filters exclude only `HUMAN_OVERSIGHT_REVIEW`; keep `HUMAN_OVERSIGHT_REJECTED` and `HUMAN_OVERSIGHT_APPROVED`. Severity: `HUMAN_OVERSIGHT_REJECTED` → CRITICAL, `HUMAN_OVERSIGHT_APPROVED` → LOW. Labels: "Human Decision — Blocked", "Human Decision — Approved". **Shadow events** (`payload.shadow_mode === true`): yellow "SHADOW" badge in EVENT column; uses normal event types (`DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`, `DATA_TRANSFER`). Evidence Events Archive: paginated (10/page). Table: EVENT and GDPR BASIS columns. **GDPR basis for human oversight:** when `sourceSystem === 'human-oversight'` or `eventType` includes `HUMAN_OVERSIGHT`, show **Art. 22** (right not to be subject to automated decision-making). Drawer: event details, Transfer sections, Cryptographic Evidence. Export JSON; **PDF export** (jsPDF-generated PDF report; includes Art. 22 for human oversight events). **CHAIN STATUS KPI card shows VALID/TAMPERED status + LAST HASH (first 8...last 8 chars of last event's payload_hash, full hash on hover, hidden when no events exist).** **Run Verification**: button label "Run Verification"; shows spinner while `verifyIntegrity()` runs; success / tampered / error banners under the status bar; **LAST VERIFIED** KPI flashes on successful manual verify.

### 11.8 Transfer Detail — `dashboard/app/transfer-detail/[id]/page.tsx`

- **Route**: `/transfer-detail/[id]` (id = seal_id or evidence id). Data: `fetchReviewQueueItem(id)`, `fetchEvidenceEvents()` for linked event.
- **Actions**: **Reject** (red), **Approve** (green, only when **not** missing SCC), **Add SCC** (orange when SCC required). When missing SCC, Approve hidden; user registers SCC and backend auto-approves matching pending reviews. Reject → sealed `HUMAN_OVERSIGHT_REJECTED`, counted in BLOCKED (24H).
- **Sections**: Status banner; Regulatory Context (GDPR Art. 44–49, 22, 46, EU AI Act 14); Transfer Details (Partner, Destination, Action, Data categories, Records); Technical Details (IPs, path, protocol, User-Agent); Reason Flagged; Evidence Chain (Seal ID, Evidence ID, etc.); Evidence Event (when linked).

### 11.9 Admin Panel — `dashboard/app/admin/page.tsx`

- **Route**: `/admin`. Internal admin-only tenant management.
- **Features**: 
  - KPI cards: Total Tenants, Active Trials, Pro Tenants, Evaluations (24H)
  - Tenant table with filters (plan, mode, search)
  - Create tenant (name, plan, mode, trial days)
  - Extend trial (+30 days), upgrade plan, rotate API key, delete tenant
  - **Trial expiry warning**: Amber "Expiring soon" badge on tenant names within 7 days of expiry
- **Auth**: Admin-only access; redirects non-admin users to home page.
- **Backend**: Admin routes (`/api/v1/admin/*`) are cross-tenant by design — queries do not filter by `tenant_id`. Admin routes verify admin access via JWT `is_admin` claim or API key `is_admin` flag, then query across all tenants.

### 11.10 ACM Overview — `dashboard/app/acm/page.tsx`

- **Route**: `/acm`. ACM (Agent Compliance Manager) overview dashboard. Listed in sidebar under **System** as **ACM Overview** (after **AI System Registry**).
- **Data**: `fetchAcmStats()` from `@/app/lib/acm-api` (calls `GET /api/v1/acm/stats`). Auto-refresh 30s.
- **KPI cards (6)**: Pending Oversight (amber when > 0), Decided Reviews, Total Transfers, Schrems III Risk (red when > 0), Tool Call Events, Degraded Sessions (amber when > 0). Cards link to `/acm/oversight` or `/acm/transfers`.
- **Quick actions**: Review Pending Oversight (with count), View All Transfers.
- **Regulatory mapping**: EU AI Act Art. 12 (logging), Art. 14 (oversight), GDPR Art. 44–49 (transfers), Schrems III (DPF risk).

### 11.11 Oversight Queue — `dashboard/app/acm/oversight/page.tsx`

- **Route**: `/acm/oversight`. EU AI Act Art. 14 human oversight of AI tool-call decisions. **Not** linked from the sidebar; reachable from ACM Overview KPIs / bookmarks / direct URL.
- **Data**: `fetchOversightRecords(status)`, `resolveOversight(id, payload)` from `@/app/lib/acm-api`. Auto-refresh 10s.
- **Filter tabs**: Pending | Decided | All. Initial filter from `?status=` query param.
- **Records**: Expandable rows showing agent name, trigger type, flagged date, outcome badge (PENDING/APPROVED/REJECTED/ESCALATED).
- **Detail panel**: Oversight ID, agent, trigger, outcome, flagged/decided timestamps, EU AI Act compliance, reviewer, event ref, comments.
- **Actions** (pending only): Approve (green), Reject (red), Escalate (blue). Calls `PATCH /api/v1/acm/oversight/{id}`.
- **Trigger labels**: degraded_context_trust, high_impact_decision, anomaly_detected, manual_request, periodic_audit.
- **Separate from `/review-queue`**: Review Queue handles GDPR Art. 22 data-transfer decisions with 24h SLA timer. Oversight Queue handles EU AI Act Art. 14 tool-call reviews triggered by the ACM proxy.

### 11.12 ACM Transfers — `dashboard/app/acm/transfers/page.tsx`

- **Route**: `/acm/transfers`. GDPR Art. 44–49 cross-border data transfer records created by the ACM proxy. **Not** linked from the sidebar; reachable from ACM Overview KPIs / bookmarks / direct URL.
- **Data**: `fetchTransferRecords()` from `@/app/lib/acm-api` (calls `GET /api/v1/acm/transfers`). Auto-refresh 30s.
- **Table columns**: Route (origin → destination with country flags), Mechanism (adequacy/SCC/BCR/DPF/derogation/blocked badges), Agent, Data Categories, Risk (Schrems III indicator), Timestamp.
- **Search**: Filter by country name, agent, mechanism.
- **Schrems III risk**: Red AlertTriangle for flagged transfers; green CheckCircle for OK.

### 11.13 AI System Registry (Agents) — `dashboard/app/agents/page.tsx` + `dashboard/app/components/AgentDetailPanel.tsx`

- **Route**: `/agents`. Sidebar label: **AI System Registry**. Page heading: **AI System Registry** (full-width layout: outer wrapper is `space-y-6` only — no `max-w-*` / `mx-auto` / extra horizontal padding; `DashboardLayout` supplies padding, consistent with ACM Overview).

- **Data**: `fetchEvidenceEventsWithMeta({ limit: 5000 })`, `fetchAgents()` — `mergeAgents()` merges registered agent cards with stats from evidence events (`source_system`, `payload.agent_id` / `agentId`), excluding internal sources `['human-oversight', 'sovereign-shield']`. Event-type rollups use substring checks (e.g. BLOCKED/REVIEW) as implemented in `buildStatsFromEvents`.

- **KPI row (4)**: **Total Agents**, **Active (24h)**, **Registered**, **Pending Reviews** (sum of per-agent review counts). Grid: `grid-cols-2 md:grid-cols-4`, ACM-style stat cards.

- **Agent list cards (front)**: Minimal tiles — agent name, short agent id when registered, badges for Registered/Unregistered, Active/Inactive, numeric **Trust {n}** from `x-veridion.trust_level`, and a muted slate **“{n} pending”** chip when `reviewCount > 0` (no warning icon; card border stays `border-slate-700`). Click opens detail.

- **AgentDetailPanel** (slide-over): Imports `export interface AgentInfo` from `@/app/agents/page` (type-only). Shows last activity, full agent id + copy, transfer mini-stats (Total / Allow / Review / Block), quiet `text-slate-500` line for pending reviews when applicable, collapsible Agent Card JSON, **Rotate Key** / **Delete** for registered agents, new-key copy flow with “I have saved this key”. **RegisterAgentModal** (`open`, `agentName=""`, `onClose`, `onSuccess`) wraps **RegisterAgentWizard** — multi-step wizard; on success shows API key once.

- **Agent authentication**: Two-layer auth — tenant API key (Authorization header) identifies the company; agent API key (`agent_api_key` in request body) identifies the specific agent. Each registered agent has its own `agt_key_` prefixed API key, stored as SHA-256 hash. Lost keys can be rotated from the detail panel.

- **A2A Agent Card**: Registration produces an A2A-compatible Agent Card JSON with standard fields plus Veridion GDPR extension fields under `x-veridion` (agent_id, policy_version, policy_version_hash, numeric `trust_level`, allowed_data_categories, etc.).

- **Soft delete**: Deleted agents set `deleted_at` (soft delete). Evidence events keep `agent_id` for audit trail.

- **Public registry** fields on agents (`patchAgent` / listing) exist in API and `api.ts`; the Agents page UI does not expose registry toggles or profile editing (those were removed from this view in favour of the detail panel).

---

## 12. Landing page (`veridion-landing/`)

### 12.0 Home — `veridion-landing/app/page.tsx`

- **Route**: `/` (marketing hero on Vercel / server port 3001 in Docker).
- **CTAs**: Sign Up, **Get API Key** (calls **`POST /api/public/sandbox/create`** via `NEXT_PUBLIC_API_URL`, modal with `sbx_` key + example curl — see §9.13), **See How It Works** (in-page anchor).
- **Distinction**: Hero / sandbox = *build & test*; **`/registry`** (§12.2) = *discover listed agents* — present as separate journeys (see §9.14).

### 12.1 Documentation page — `veridion-landing/app/docs/page.tsx`

- **Route**: `/docs`. Comprehensive API documentation with sidebar navigation.
- **Sections**: Quick Start, Authentication, **Agent Registration** (link to dashboard login; users sign in and open Agents section), Evaluate Transfer, Response Reference, Error Codes, Shadow Mode, Code Examples (curl/Python/Node.js tabs), **MCP Server**, Limitations.
- **MCP Server Section**: 
  - **Sovereign Shield** → `npx -y veridion-nexus-mcp` + `VERIDION_NEXUS_API_KEY` (package **`veridion-nexus-mcp@1.0.12+`**). **Accountability Ledger** → separate npm package **`veridion-nexus-gateway`** from **`mcp-server-gateway/`** (see §9.6). Landing copy may lag §9.6 — refresh when editing the docs page.
  - Comparison cards: REST API (manual integration) vs MCP Server (zero-code integration)
  - Claude Desktop / Cursor JSON examples should use **`veridion-nexus-mcp`** for Sovereign Shield tools
  - Available tools table (`evaluate_transfer`, `check_scc_coverage`, `get_compliance_status`, `list_adequate_countries`)
- **Features**: Sticky sidebar, mobile dropdown, code examples with copy buttons, responsive design.

### 12.2 Public Compliance Registry — `veridion-landing/app/registry/`

- **Route**: `/registry`. Public, searchable AI agent compliance registry.
- **Search page** (`page.tsx`): Full-text search, filters (risk level, region), paginated grid of agent cards with EU AI Act risk badges, stats dashboard (total agents, personal data processors, regions, high-risk count).
- **Agent profile** (`[agent_id]/page.tsx`): Detailed public compliance profile — EU AI Act classification, deployment & data residency, accountability ledger status, DPO contact, permitted tools.
- **No auth required**: Public-facing pages for DPOs and compliance officers.
- **API**: Calls `/api/public/registry/agents` and `/api/public/registry/stats`.

### 12.3 Signup page — `veridion-landing/app/signup/page.tsx`

- **Route**: `/signup`. Self-serve tenant registration form.
- **Styling**: Matches `dashboard/app/login/page.tsx` exactly (same card size, form elements, branding).
- **Success state**: In-page success view with heading **“Welcome {company_name} to Veridion Nexus”** (uses trimmed company name from the form), trial started copy, and link to the dashboard.

---

## 13. Shared components

- **SovereignMap.tsx**: Maps `EvidenceEvent[]` to country status (adequate/SCC/blocked) and transfer counts; outputs for WorldMap. **Shadow Mode:** EU/EEA and **adequate** countries stay **green** (evidence may still store BLOCK); **SCC-required** destinations map to **orange** (SCC border/fill by registry); only **org-blocked / non-adequate non-SCC** BLOCK decisions go **red**. Markers type: `{ lat: number; lng: number; code: string; name: string; color: string }[]`.
- **WorldMap.tsx**: react-simple-maps; 400px map, legend, tooltips; fill by status. Accepts `markers` prop for small country markers.
- **TrialExpiredModal.tsx**: Full-screen modal for trial expiry. Wired via `onTrialExpired` / `DashboardLayout`. **CTA:** **“Book a call to upgrade”** → **`mailto:hello@veridion-nexus.eu`** with prefilled subject/body (swap to a live **`https://cal.com/<handle>`** when published). **Enforcement:** Expired **`free_trial`** → **402** on login (`routes_auth`) and on **`/api/v1/*`** (`middleware_tenant`); `api.ts` **`checkTrialExpired`** opens this modal.
- **DashboardLayout.tsx**: Registers trial-expiry callback and renders `TrialExpiredModal` when triggered. All dashboard pages use this layout.

---

## 14. API client — `dashboard/app/utils/api.ts`

- **Base**: Uses relative URL (`API_BASE = ''`) so Next.js rewrites proxy to backend (avoids CORS). Types: `EvidenceEvent`, `SCCRegistry`, `ReviewQueueItem`.
- **Trial Expiry Detection**: Helpers `onTrialExpired`, `triggerTrialExpired`, `checkTrialExpired(res)` — on **402** response, **`triggerTrialExpired()`** runs and an error is thrown (modal via `DashboardLayout`).
- **401 Unauthorized Handling**: Global 401 handler:
  - `checkUnauthorized(res)` — helper checks response status 401 (expired/invalid JWT token)
  - Clears expired token and user data from localStorage (`ss_token`, `ss_user`)
  - Redirects to `/login?expired=true` with session expired message
  - Applied to main API functions: `fetchSettings()`, `fetchEvidenceEvents()`, `fetchSCCRegistries()`, `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`
- **Calls**: 
  - Auth: `getCurrentUser()`, `isAdmin()`, `getAuthHeaders()`, `clearAuthState()` — for login flow and 401 handling
  - Agents: `fetchAgents()`, `registerAgent(data)`, `fetchAgentCard(agentId)`, `rotateAgentKey(agentId)`, `deleteAgent(agentId)`
  - Settings: `fetchSettings()`, `patchSettings({ enforcementMode, confirmationToken? })` — uses camelCase keys
  - Evidence: `fetchEvidenceEvents()`, `fetchEvidenceEventsPaginated(page, limit, eventType?, sourceSystem?)`, `fetchEvidenceEventsWithMeta(params?)` (events, totalCount, merkleRoots), `verifyIntegrity()`
  - SCC: `fetchSCCRegistries()`, `createSCCRegistry(data)`, `patchSCCRegistry(id, data)`, `revokeSCCRegistry(id)`
  - Review Queue: `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`, `fetchReviewQueueItem(id)`, `createReviewQueueItem(data)`, `approveReviewQueueItem(sealId, reason?)`, `rejectReviewQueueItem(sealId, reason?)`
  - Shield: `evaluateTransfer(data)` → `POST /api/v1/shield/evaluate`
- **Note**: `createReviewQueueItem` sends `evidenceEventId`, optional `agentId`; `rejectReviewQueueItem` creates `HUMAN_OVERSIGHT_REJECTED` event. See §9 for endpoint mapping.

### 14.1 ACM API client — `dashboard/app/lib/acm-api.ts`

- **Separate** from `dashboard/app/utils/api.ts` — handles ACM-specific endpoints only.
- **Auth**: Reuses `getAuthHeaders()` from `api.ts` for JWT Bearer token.
- **Types**: `OversightRecord`, `TransferRecord`, `AcmStats`, `ResolveOversightPayload`.
- **Calls**:
  - `fetchAcmStats()` → `GET /api/v1/acm/stats`
  - `fetchOversightRecords(status)` → `GET /api/v1/acm/oversight?status=`
  - `resolveOversight(id, payload)` → `PATCH /api/v1/acm/oversight/{id}`
  - `fetchTransferRecords()` → `GET /api/v1/acm/transfers`
- **401 handling**: Same pattern as `api.ts` — clears token, redirects to `/login?expired=true`.

### 14.2 Auth utilities — `dashboard/app/utils/auth.ts`

- **Placeholder implementations** for Phase 0.4 login:
  - `getAuthToken()` — returns token from storage (placeholder)
  - `setAuthToken(token)` — stores token (placeholder)
  - `removeAuthToken()` — clears token (placeholder)
  - `getAuthHeaders()` — returns Authorization header if token exists

---

## 15. Backend (Rust) — relevant for dashboard

- **Evidence**: `src/routes_evidence.rs` — list events (with pagination, filters; returns events, totalCount, merkleRoots), create event, verify-integrity. `src/evidence.rs` — `canonical_json()` + `compute_payload_hash()` for deterministic hashing; `hash_version` on rows (migration 043).
- **Shield**: `src/routes_shield.rs` — evaluate (synchronous), ingest-logs (batch), stats, countries, requires-attention, transfers-by-destination, SCC CRUD (list, register, PATCH, delete). **SCC-required** destinations: agent **`allowed_destination_countries`** / **`allowed_partners`** do not block; core decision from `src/shield.rs` + SCC registry. On register, `review_queue::approve_pending_reviews_for_scc()` auto-approves pending reviews whose evidence event matches the new SCC destination.
- **Review queue**: `src/routes_review_queue.rs`, `src/review_queue.rs` — list (with status filter), pending, decided-evidence-ids, create (with `evidence_event_id`), approve, reject. Reject creates `HUMAN_OVERSIGHT_REJECTED` evidence event. **Shadow mode propagation**: When creating `HUMAN_OVERSIGHT_REJECTED` or `HUMAN_OVERSIGHT_APPROVED` evidence events, `shadow_mode: true` is added to payload if current enforcement mode is shadow. Applies to manual approve/reject, auto-approve (SCC registration), and SLA timeout auto-block paths.
- **Auth**: `src/routes_auth.rs`, `src/email.rs` — `POST /api/v1/auth/register`: validates inputs, rate-limits 5/IP/hour, checks email uniqueness, creates tenant + user atomically, sends async welcome email (skipped if SMTP not configured). Returns `tenant_id`, `api_key_raw` (once only), `api_key_prefix`, `trial_expires_at`. `POST /api/v1/auth/login`: email/password, bcrypt verify, returns JWT with tenant_id; **`free_trial` + past `trial_expires_at`** → **402** `trial_expired`. `POST /api/v1/auth/dev-reset-password`: dev only, resets password by username. **Trial enforcement:** `src/middleware_tenant.rs` returns **402** for expired **`free_trial`** on **`/api/v1/*`** (after JWT/API key resolution).
- **Agents**: `src/routes_agents.rs` — Agent registry (register, list, get, card, rotate-key, patch, delete). Per-agent policy enforcement in shield evaluate when `agent_id` + `agent_api_key` provided. PATCH supports `public_registry_listed`, `public_registry_description`, `public_registry_contact_email`.
- **ACM (Accountability Ledger)**: `src/routes_acm.rs` — Internal API consumed by the **MCP Governance Gateway** (`veridion-nexus-gateway`; authenticated via `AL_SERVICE_TOKEN`) plus dashboard-facing endpoints (authenticated via JWT/tenant context). Proxy routes: agent lookup by `oauth_client_id`, tool call event creation with hash chaining, **`session_id`** rules (empty → new UUID; invalid non-empty → **400** `invalid_session_id`), **Ed25519 signing** after insert (`src/signing.rs`, migrations **045–046**), **`GET /api/acm/events/{id}/verify`**, trust annotations with monotonic degradation, data transfer records, oversight records. Create-path errors return **generic** messages to clients; details in logs. Dashboard routes: `GET /api/v1/acm/stats`, `GET /api/v1/acm/oversight`, `PATCH /api/v1/acm/oversight/{id}`, `GET /api/v1/acm/transfers` — all tenant-scoped with agent name joins.
- **Signing (Ed25519)**: `src/signing.rs` — `SigningKeys::load_from_env`, `tool_call_event_signing_canonical`, `sign_event`, `verify_signature`, `public_key_b64`. Invalid `ED25519_PRIVATE_KEY` → **`eprintln!` + `std::process::exit(1)`** (no panic). Wired in `AppState` (`src/state.rs`) and `main.rs`.
- **Public Registry**: `src/routes_public_registry.rs` — Public, cross-tenant search/detail/stats endpoints for the compliance registry. No auth required. Full-text search with GIN index, filterable by risk level, region, data residency.
- **Public validator / sandbox / signing key**: `src/routes_public_validator.rs` — `POST /api/public/validate`, `POST /api/public/sandbox/create`, **`GET /api/public/keys/signing`** (see §9.13). **`sandbox_keys`** table (migration **044**).

---

## 16. File map (dashboard)

| Path | Purpose |
|------|--------|
| `app/layout.tsx` | Root layout, fonts, metadata |
| `app/globals.css` | Tailwind, theme, scrollbar |
| `app/page.tsx` | Sovereign Shield home |
| `app/transfer-log/page.tsx` | Transfer Log |
| `app/transfer-detail/[id]/page.tsx` | Transfer Detail |
| `app/review-queue/page.tsx` | Review Queue |
| `app/scc-registry/page.tsx` | SCC Registry |
| `app/adequate-countries/page.tsx` | Adequate / SCC / Blocked countries |
| `app/acm/page.tsx` | ACM Overview (stats dashboard) |
| `app/acm/oversight/page.tsx` | ACM Oversight Queue (EU AI Act Art. 14) |
| `app/acm/transfers/page.tsx` | ACM Transfers (GDPR Art. 44–49 records) |
| `app/agents/page.tsx` | AI System Registry — KPI row, agent grid, merges evidence + registered agents; exports `AgentInfo` type |
| `app/components/AgentDetailPanel.tsx` | Slide-over: agent detail, stats, JSON, rotate/delete |
| `app/agents/RegisterAgentModal.tsx` | Register agent modal (wraps RegisterAgentWizard) |
| `app/evidence-vault/page.tsx` | Evidence Vault |
| `app/components/DashboardLayout.tsx` | Sidebar + main wrapper |
| `app/components/Sidebar.tsx` | Nav links (primary list + System: AI System Registry, ACM Overview, Admin; spacer between dividers where ACM heading/Oversight/Transfers were removed) |
| `app/components/SovereignMap.tsx` | Map data from events |
| `app/components/WorldMap.tsx` | World map |
| `app/components/TrialExpiredModal.tsx` | Trial expiry modal overlay |
| `app/config/countries.ts` | EU/EEA, Adequate, SCC-required, Blocked; getLegalBasis, getLegalBasisFullText, getCountryCodeFromName; ADEQUATE_COUNTRY_LIST, SCC_REQUIRED_COUNTRY_LIST, BLOCKED_COUNTRY_LIST |
| `app/lib/acm-api.ts` | ACM API client (oversight, transfers, stats) |
| `app/utils/api.ts` | API client, types, trial expiry detection |
| `app/utils/auth.ts` | Auth token utilities (placeholder for Phase 0.4) |

### 16.1 File map (MCP — Sovereign Shield)

| Path | Purpose |
|------|--------|
| `mcp-server/src/index.ts` | **veridion-nexus-mcp** — Sovereign Shield tools only (`dist/index.js`) |
| `mcp-server/package.json` | npm `veridion-nexus-mcp` metadata (`bin`: `veridion-nexus-mcp`, optional `veridion-nexus-gateway` → `al-proxy.js`) |
| `mcp-server-shield/README.md` | **Deprecated** — points to `veridion-nexus-mcp` |

See §16.2 for **`mcp-server-gateway`** (MCP Governance Gateway).

### 16.2 File map (MCP Governance Gateway — `veridion-nexus-gateway`)

| Path | Purpose |
|------|--------|
| `docs/adr/001-al-architecture.md` | ADR: Accountability Ledger architecture decisions |
| `mcp-server-gateway/package.json` | **`veridion-nexus-gateway`** npm package metadata |
| `mcp-server-gateway/src/index.ts` | MCP Governance Gateway (`AccountabilityLedgerProxy`); main entry |
| `mcp-server-gateway/src/upstream-client.ts` | `UpstreamMcpClient` — upstream MCP (stdio / SSE) |
| `mcp-server-gateway/src/al-client.ts` | HTTP client for Rust **`/api/acm/*`** |
| `mcp-server-gateway/src/oauth.ts` | OAuth 2.1 / dev_bypass token validation (`jose`) |
| `mcp-server-gateway/src/types/acm.ts` | TypeScript interfaces for ACM spec v0.1 |
| `mcp-server-gateway/.env.example` | Example env for local runs |
| `src/routes_acm.rs` | Rust ACM API routes (agent lookup, events + Ed25519 sign/update, **`GET …/events/{id}/verify`**, trust annotations, transfers, oversight) |
| `migrations/035_acm_tool_call_events.sql` | tool_call_events table (append-only, hash-chained) |
| `migrations/036_acm_context_trust_annotations.sql` | context_trust_annotations table (session trust) |
| `migrations/037_acm_agent_identity.sql` | Extends agents table with OAuth/EU AI Act/ACM fields |
| `migrations/039_acm_data_transfer_records.sql` | `data_transfer_records`, `eea_countries`, ACM view |
| `migrations/040_acm_human_oversight_extend.sql` | ACM fields on `human_oversight`, views |
| `migrations/045_acm_ed25519_signing.sql` | `signature`, `signing_key_id` on `tool_call_events` |
| `migrations/046_tool_call_events_signature_update.sql` | Trigger: only `signature` / `signing_key_id` may UPDATE |
| `src/signing.rs` | Ed25519 keys, canonical payload, sign/verify for ACM events |
| `scripts/generate_ed25519_key.sh` | Prints `ED25519_PRIVATE_KEY=` line (32 random bytes, base64) — run once, store in `.env` |
| `env.proxy.example` | Root example env (AL vars; mirror into `mcp-server-gateway/.env` as needed) |

### 16.3 File map (Public Compliance Registry)

| Path | Purpose |
|------|--------|
| `src/routes_public_registry.rs` | Rust public registry API (search, detail, stats) |
| `migrations/038_public_registry.sql` | Adds public_registry fields + GIN search index to agents |
| `veridion-landing/app/registry/page.tsx` | Public registry search page (landing site) |
| `veridion-landing/app/registry/[agent_id]/page.tsx` | Public agent compliance profile page |
| `dashboard/app/utils/api.ts` | Includes `patchAgent()` for public registry fields (used where applicable) |

### 16.4 File map (Public validator, sandbox keys, signing key)

| Path | Purpose |
|------|--------|
| `src/routes_public_validator.rs` | `POST /api/public/validate`, `POST /api/public/sandbox/create`, **`GET /api/public/keys/signing`** |
| `migrations/044_sandbox_keys.sql` | `sandbox_keys` table (hashed keys, IP, rate-limit support) |
| `veridion-landing/app/page.tsx` | Hero **Get API Key** + sandbox modal |

---

## 17. Build and deployment

### 17.1 Dynamic rendering

All dashboard pages that fetch backend data use `export const dynamic = 'force-dynamic'` to disable static prerendering:
- `/` (Sovereign Shield home)
- `/transfer-log`
- `/review-queue`
- `/scc-registry`
- `/evidence-vault`
- `/agents`
- `/admin`
- `/acm` (ACM Overview)
- `/acm/oversight` (Oversight Queue)
- `/acm/transfers` (ACM Transfers)

Pages using `useSearchParams()` are wrapped in Suspense boundaries to satisfy Next.js 14 requirements.

### 17.2 Trial expiry handling

- **Backend:** `free_trial` + `trial_expires_at` in the past → **402** `trial_expired` on **`POST /api/v1/auth/login`** and on authenticated **`/api/v1/*`** (`middleware_tenant`).
- **Frontend:** `checkTrialExpired(res)` in `dashboard/app/utils/api.ts` triggers **`TrialExpiredModal`** (mailto CTA — see §13).

### 17.3 Production deployment

**Location**: `/opt/veridion-nexus` on Hetzner Ubuntu 24.04 server

**Files**:
- `deploy.sh` — Production deployment script that: (1) changes to `/opt/veridion-nexus`, (2) runs `git pull`, (3) smart rebuilds API only if Rust/migration files changed, (4) always rebuilds **dashboard** and **landing** images with `--no-cache`, (5) uses `--env-file .env` for all docker compose commands, (6) verifies health with `curl http://localhost:8080/health`. Idempotent — safe to run multiple times.
- `Dockerfile` — Multi-stage Rust API build (rust:1.88 builder → debian:bookworm-slim runtime)
- `Dockerfile.dashboard` — Next.js dashboard build (node:20-alpine) with `ARG NEXT_PUBLIC_API_URL` and `ENV NEXT_PUBLIC_API_URL` set before `npm run build` to embed the API URL at build time
- `Dockerfile.landing` — Next.js marketing site (`veridion-landing/`) build (node:20-alpine)
- `docker-compose.prod.yml` — Production compose with postgres, api, dashboard, and landing services. Uses `--env-file .env` for environment variables.

**Services**:
- **postgres**: postgres:16-alpine, named volume `veridion_api_data`
- **api**: Built from `Dockerfile`, env from `.env`: `DATABASE_URL`, `JWT_SECRET`, `RUST_ENV=production`, `SERVER_HOST=0.0.0.0`, `SERVER_PORT=8080`, `ALLOWED_ORIGINS` (includes `https://app.veridion-nexus.eu`)
- **dashboard**: Built from `Dockerfile.dashboard` with `NEXT_PUBLIC_API_URL` build arg. Runtime env: `NEXT_PUBLIC_API_URL=https://api.veridion-nexus.eu`. Login page uses `process.env.NEXT_PUBLIC_API_URL` for API calls.
- **landing**: Built from `Dockerfile.landing` — marketing site on port **3001** on the server (primary public URL is **Vercel**; see below).

**Deployment**:
```bash
cd /opt/veridion-nexus
chmod +x deploy.sh
./deploy.sh
```

The script automatically pulls latest code, intelligently rebuilds only changed services, and verifies deployment success with health checks.

**Migration Notes**:
- Migration **026** fixes `system_settings` constraint: drops old PRIMARY KEY on `key`, adds UNIQUE constraint on `(key, tenant_id)` to support `ON CONFLICT (key, tenant_id)` in migration **029**.
- All migrations run automatically on API startup via `sqlx::migrate`.

**Reverse Proxy**: Production uses **Caddy** (not Nginx) for automatic HTTPS/SSL via Let's Encrypt. See `DEPLOYMENT.md` for Caddy setup, SSL/TLS (automatic), backup procedures, and admin password reset instructions.

**From a dev machine (Windows)**: `deploy.ps1` at repo root runs `git push origin main` then `ssh $env:DEPLOY_HOST 'cd /opt/veridion-nexus && ./deploy.sh'`. Set `DEPLOY_HOST` (e.g. `root@<server-ip>`) before running. Marketing site (`veridion-landing/`) deploys separately to **Vercel** (`npx vercel --prod --yes` from repo root; linked project `.vercel/project.json` — production alias `https://www.veridion-nexus.eu`). GitHub Actions (`.github/workflows/vercel-deploy.yml`) can also deploy when `VERCEL_*` secrets are set. See `README-VERCEL-DEPLOYMENT.md`.

---

When changing behaviour or routes, update this file to keep it accurate.
