# Project Reference — Veridion API / Sovereign Shield

**Version:** 1.7  
**Last updated:** 2026-03-08

This is the **single project reference** for Veridion API: vision, scope, tech stack, configuration, and current behaviour (dashboard and API). Use it to onboard, scope work, and keep the codebase and docs aligned.

---

## 1. Vision

**Veridion API** is a **standalone HTTP API and database** for EU-focused compliance tooling. It is built to:

- Provide a **separate service and database** from any other Veridion product (e.g. veridion-nexus), with no shared code or migration path.
- Expose **health, auth, and compliance endpoints** that frontends and other services can call.
- Support **three compliance pillars** at the data layer:
  - **Sovereign Shield** — international transfer monitoring and blocking (GDPR Art. 44–49).
  - **Evidence Vault** — append-only, sealed evidence for audits and export.
  - **Human Oversight** — queue and status for human review (e.g. EU AI Act Art. 14).

The vision is a **single, deployable API** that owns its schema and can grow from a minimal service into a full compliance API without depending on another codebase.

---

## 2. What This Project Is

| Aspect | Description |
|--------|-------------|
| **Product** | Standalone REST API plus Sovereign Shield dashboard (Next.js). Own PostgreSQL database. Own migrations. |
| **Boundary** | No shared migrations, shared DB, or shared Rust crates with veridion-nexus or other repos. |
| **Current scope** | Health, dev auth (JWT), CORS; Evidence Vault (events, verify-integrity, PDF export); Sovereign Shield (ingest/evaluate, evidence + review queue); SCC registries (CRUD, PATCH tia_completed, dpa_id, scc_module; auto-approve on register); Human Oversight (review queue, pending/decided, approve/reject, decided-evidence-ids); Self-serve signup (POST /api/v1/auth/register, input validation, rate limiting 5/IP/hour, bcrypt password, async welcome email via SMTP). Migrations 001–029. |
| **Planned scope** | Further dashboard features, production auth. |

**What it is not:** Not a fork or subset of veridion-nexus. Not a monorepo member that shares `migrations/` or `src/` with another project.

---

## 3. Overview (runtime)

- **Backend**: Rust (Actix-web) API on `http://localhost:8080`.
- **Frontend**: Next.js 14 dashboard (Sovereign Shield) in `dashboard/`, on `http://localhost:3000`.
- **Landing page**: Next.js 14 in `veridion-landing/`, on `http://localhost:3001`. Contains marketing page and self-serve signup flow.
- **MCP Server**: Node.js/TypeScript MCP server in `mcp-server/`. Provides GDPR compliance tools for AI agents (Claude, Cursor, etc.).
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

### 4.3 MCP Server (Node.js/TypeScript)

- **Language**: TypeScript 5.x
- **Runtime**: Node.js (ESM modules)
- **Framework**: `@modelcontextprotocol/sdk` v1.27+
- **Transport**: stdio (for Claude Desktop, Cursor)
- **Dependencies**: `zod` (schema validation), `node-fetch` (HTTP client)
- **Scripts**: `npm run build` (TypeScript compilation), `npm run dev` (ts-node), `npm start` (run compiled dist)

---

## 5. Project structure and configuration

### 5.1 Directory layout

```
veridion-api/
├── Cargo.toml
├── src/                    # Rust API (main.rs, routes_*, evidence, shield, etc.)
├── migrations/             # Schema 001–027 (no external path)
├── dashboard/              # Next.js Sovereign Shield dashboard (port 3000)
├── veridion-landing/       # Next.js landing page + signup flow (port 3001)
├── mcp-server/            # MCP server (Node.js/TypeScript) for AI agent integration
├── .env
├── PROJECT_REFERENCE.md    # This file
└── …
```

**Migrations:** 29 (001–029). Key tables: `users`, `tenants`, `compliance_records`, `human_oversight`, `evidence_events`, `scc_registries`, `system_settings`. Migration **022** adds `evidence_event_id` to `compliance_records`. **023** adds `tia_completed` (Transfer Impact Assessment) to `scc_registries`. **024** adds `dpa_id` and `scc_module` to `scc_registries`. **025** creates `system_settings` (key/value) with PRIMARY KEY on `key`. **026** creates `tenants` table and adds `tenant_id` columns to all data tables for multi-tenancy; updates `system_settings` to drop old PRIMARY KEY and add UNIQUE constraint on `(key, tenant_id)` for multi-tenant support. **027** adds FK constraint `users.company_id → tenants.id`. **028** links admin user to admin tenant. **029** seeds `system_settings` for admin tenant with `enforcement_mode='shadow'` using `ON CONFLICT (key, tenant_id)`. Full list in `migrations/`.

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

**Note:** If SMTP vars are not set, welcome email is skipped silently. Signup still succeeds.

---

## 6. How to run

1. Create a PostgreSQL database (e.g. `veridion_api`).
2. Set `DATABASE_URL` in `.env`.
3. **API:** From project root run `cargo run`. Migrations run on startup.
4. **Dashboard:** In `dashboard/` run `npm run dev` (port 3000).
5. Dev login: `GET /api/v1/auth/dev-bypass` (admin / password after seed).

---

## 7. Design principles

- **Single entrypoint** — One binary, one `main.rs`.
- **Own database** — All schema in `./migrations`; no references to other projects.
- **Pillar-ready schema** — Tables for all three pillars; API and logic added incrementally.
- **No nexus code** — Standalone; no shared paths or copy-paste from veridion-nexus.

---

## 8. Endpoints (summary)

### 8.1 Core endpoints

| Method + path | Purpose |
|---------------|--------|
| `GET /` | API info (name, version, docs) |
| `GET /health` | Liveness |
| `GET /api/v1/auth/dev-bypass` | Developer login (JWT) |
| `GET /api/v1/auth/me` | Get current user from JWT token |
| `GET /api/v1/system/config` | System configuration (runtime mode, enforcement mode) |
| `GET /api/v1/settings` | Current enforcement mode (shadow \| enforce) |
| `PATCH /api/v1/settings` | Update enforcement mode. shadow→enforce requires confirmation_token: "ENABLE_ENFORCEMENT" |
| `GET /api/v1/my/enabled-modules` | Enabled modules (returns empty array) |
| `GET /api/v1/modules` | Available modules (returns empty array) |
| `GET /api/v1/audit/alerts` | Audit alerts (returns empty array) |

### 8.2 Evidence Vault

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/evidence/events` | List evidence events (with pagination, filters: severity, event_type, search, destination_country, source_system, limit, offset); returns `events`, `totalCount`, `merkleRoots` |
| `POST /api/v1/evidence/events` | Create evidence event |
| `POST /api/v1/evidence/verify-integrity` | Verify chain integrity |

### 8.3 Sovereign Shield

| Method + path | Purpose |
|---------------|--------|
| `POST /api/v1/shield/evaluate` | Evaluate transfer (synchronous runtime enforcement). **Shadow Mode**: Returns `ALLOW` decision to caller but records real decision (BLOCK/REVIEW/ALLOW) in evidence with `payload.shadow_mode: true`. Response reason includes "SHADOW MODE — would have been {decision}: {reason}". |
| `POST /api/v1/shield/ingest-logs` | Batch ingest transfer logs. **Shadow Mode**: Same behavior as evaluate — returns ALLOW but records real decisions with `shadow_mode: true`. |
| `GET /api/v1/lenses/sovereign-shield/stats` | Shield statistics |
| `GET /api/v1/lenses/sovereign-shield/countries` | Country classifications |
| `GET /api/v1/lenses/sovereign-shield/requires-attention` | Items requiring attention |
| `GET /api/v1/lenses/sovereign-shield/transfers/by-destination` | Transfers grouped by destination |

### 8.4 SCC Registries

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/scc-registries` | List SCC registries |
| `POST /api/v1/scc-registries` | Register SCC (partnerName, destinationCountryCode, expiresAt, tiaCompleted, dpaId, sccModule); **auto-approves** matching pending reviews |
| `PATCH /api/v1/scc-registries/{id}` | Update SCC (e.g. `tiaCompleted`) |
| `DELETE /api/v1/scc-registries/{id}` | Revoke SCC |

### 8.5 Human Oversight / Review Queue

| Method + path | Purpose |
|---------------|--------|
| `GET /api/v1/review-queue` | List all review items (with status filter) |
| `GET /api/v1/human_oversight/pending` | List pending review items |
| `GET /api/v1/human_oversight/decided-evidence-ids` | Evidence IDs already decided (exclude from Requires Attention) |
| `POST /api/v1/review-queue` | Create review item (with `evidence_event_id`) |
| `POST /api/v1/action/{seal_id}/approve` | Approve review |
| `POST /api/v1/action/{seal_id}/reject` | Reject review → `HUMAN_OVERSIGHT_REJECTED` (counted in BLOCKED 24H) |

**Note:** Dashboard calls `/api/v1/shield/evaluate` via `evaluateTransfer()`. Full route list in `src/main.rs` startup log. Evidence API returns `merkleRoots` for chain integrity display.

### 8.6 MCP Server

The MCP (Model Context Protocol) server provides GDPR compliance tools for AI agents (Claude Desktop, Cursor, etc.). It runs as a standalone Node.js process with stdio transport.

**Location**: `mcp-server/`

**Environment Variables**:
- `SOVEREIGN_SHIELD_API_KEY` (required) — Tenant API key (`ss_test_...` or `ss_live_...`)
- `SOVEREIGN_SHIELD_API_URL` (optional) — Defaults to `https://api.veridion-nexus.eu`

**Tools Provided**:

| Tool | Description |
|---|---|
| `evaluate_transfer` | Evaluate a cross-border transfer before it happens. Returns ALLOW, BLOCK, or REVIEW with cryptographic evidence seal. |
| `check_scc_coverage` | Check SCC registry for a specific partner/country combination. |
| `get_compliance_status` | Get account compliance overview (enforcement mode, transfer stats, pending reviews, expiring SCCs). |
| `list_adequate_countries` | List countries by GDPR transfer status (EU/EEA, adequate, SCC required, blocked). Optional filter parameter. |

**Setup**:
- **Claude Desktop**: Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`)
- **Cursor**: Add to `.cursor/mcp.json` in project root
- **Manual**: Run `npm run build` then `node dist/index.js`

**Error Handling**: Returns formatted error messages for 401 (auth failed), 402 (trial expired), 500 (server error), and network errors.

**Shadow Mode**: When API response reason starts with "SHADOW MODE", appends warning that decision is recorded but not enforced.

**Documentation**: See `mcp-server/README.md` and `veridion-landing/app/docs/page.tsx` (MCP Server section).

### 8.7 Shadow Mode

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

## 9. Dashboard structure

### 9.1 Layout and shell

- **`dashboard/app/layout.tsx`**: Root layout; title "Sovereign Shield Dashboard"; fonts Inter, JetBrains Mono.
- **`dashboard/app/globals.css`**: Tailwind; `:root` background `#0f172a`; custom scrollbar.
- **`dashboard/app/components/DashboardLayout.tsx`**: Sidebar + main content (`ml-64`, `p-8`).
- **`dashboard/app/components/Sidebar.tsx`**: Fixed left nav; branding "VERIDION NEXUS" / "Compliance Dashboard v1.0.0". Nav: Sovereign Shield → `/`, Transfer Log → `/transfer-log`, Review Queue → `/review-queue`, SCC Registry → `/scc-registry`, Adequate Countries → `/adequate-countries`, Evidence Vault → `/evidence-vault`. Active link: emerald highlight.

---

## 10. Pages (routes and behaviour)

### 10.1 Sovereign Shield (home) — `dashboard/app/page.tsx`

- **Route**: `/`
- **Enforcement Mode**: Banner at top: SHADOW MODE (yellow) — "All transfers are passing through. Decisions shown are not being enforced." or ENFORCING (green) — "ENFORCING — Blocking transfers". Toggle: "Enable Enforcement" (opens confirmation modal; type ENABLE_ENFORCEMENT to proceed) or "Switch to Shadow Mode". Mode persisted in `system_settings` table.
- **Data**: `fetchEvidenceEvents()`, `fetchSCCRegistries()`, `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`, `fetchSettings()`; auto-refresh 5s; Refresh button. **ensureEventsInReviewQueue** runs on load: finds SCC-required (REVIEW) events without a valid SCC (partner-specific check) and creates a review queue item via `createReviewQueueItem({ action, context, evidenceEventId })` for each not already in queue. Decided evidence IDs excluded from "Requires Attention".
- **Header**: "SOVEREIGN SHIELD", "GDPR Chapter V (Art. 44-49) • International Data Transfers". Refresh.
- **Status bar**: Status (PROTECTED, ATTENTION), Last scan.
- **KPI cards (8)**: Row 1 — TRANSFERS (24H), ADEQUATE COUNTRIES (24H) — grey when 0, green when >= 1, HIGH RISK DESTINATIONS (24H) — grey when 0, red when >= 1, **BLOCK (24H)** — grey when 0, red when >= 1 (policy blocks + `HUMAN_OVERSIGHT_REJECTED`). Row 2 — SCC COVERAGE, EXPIRING SCCs — grey when 0, yellow when >= 1, **PENDING APPROVALS** — grey when 0, yellow when >= 1 (SCC-required without valid SCC), ACTIVE AGENTS.
- **Main**: **Left** — TRANSFER MAP (SovereignMap/WorldMap); EU/EEA adequate. **Right** — REQUIRES ATTENTION: only SCC-required without valid SCC, pending and not decided; click → Transfer Detail; up to 5; "View All →". **Below** — RECENT ACTIVITY (last 10 events, BLOCK/REVIEW/ALLOW badges; SHADOW badge shown when `payload.shadow_mode === true`).

### 10.2 Transfer Log — `dashboard/app/transfer-log/page.tsx`

- **Route**: `/transfer-log`. Data: `fetchEvidenceEventsPaginated()` (50 per page); filters ALL | ALLOW | BLOCK | PENDING; filters by `source_system='sovereign-shield'` and transfer event types (`DATA_TRANSFER`, `DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`). Table: Timestamp, Destination, Partner, Data Category, Agent/Endpoint, Purpose (if present), Legal Basis, Mode (SHADOW badge or —), Status (BLOCK/REVIEW/ALLOW). **Shadow events** (`payload.shadow_mode === true`) show SHADOW badge in Mode column and real decision (BLOCK/REVIEW/ALLOW) in Status column. CSV export includes Mode column. Pagination controls.

### 10.3 Review Queue — `dashboard/app/review-queue/page.tsx`

- **Route**: `/review-queue`. Data: `fetchReviewQueuePending()`. Approve/Reject via `approveReviewQueueItem(sealId)` / `rejectReviewQueueItem(sealId)`. Table: Transfer Details (click → Transfer Detail), Reason, Suggested Decision, Actions. Auto-refresh 5s.

### 10.4 SCC Registry — `dashboard/app/scc-registry/page.tsx`

- **Route**: `/scc-registry`. Data: `fetchSCCRegistries()`, `createSCCRegistry()`, `patchSCCRegistry()`. Wizard (Partner, Country; SCC Module C2C/C2P/P2P/P2C, DPA ID, dates, TIA completed; Submit). Pre-fill from `?country=` and `?partner=` query params. Filters (status, search) and KPI cards (Total Active, Expiring Soon, Expired, Archived). **KPI cards**: Grey icon and number when count is 0, colored (green/amber/red) when >= 1. Registry cards show Partner, Country, Module, DPA ID, expiry, TIA status; **Mark TIA Complete** button calls PATCH. Renew flow for expiring SCCs. Active/History tabs.

### 10.5 Login — `dashboard/app/login/page.tsx`

- **Route**: `/login`. Full-page login form with email/password authentication.
- **Auth**: Calls `POST {NEXT_PUBLIC_API_URL}/api/v1/auth/login` (uses `process.env.NEXT_PUBLIC_API_URL` environment variable, falls back to empty string for relative path). Stores JWT token in `localStorage` (`ss_token`, `ss_user`).
- **Redirect**: On success, redirects to `/` (Sovereign Shield home). On error, displays error message.
- **Remember me**: Optional checkbox (not yet implemented in backend).
- **Layout**: Does not use `DashboardLayout` — standalone full-page form.

### 10.6 Adequate Countries — `dashboard/app/adequate-countries/page.tsx`

- **Route**: `/adequate-countries`. Static page (no API calls). 
- **KPI Summary Bar**: Four cards showing counts — ADEQUATE (green Shield icon), SCC REQUIRED (amber Globe icon), DPF CERTIFIED (US) — "Partial" (blue Shield icon), BLOCKED (red Shield icon).
- **Brazil Adequacy Callout**: Prominent blue callout card announcing Brazil adequacy decision (January 2026, Art. 45 GDPR). Brazil moved to Adequate Countries list.
- **Country Cards**: Each card shows GDPR article basis below badge:
  - Adequate countries: `Art. 45` (green)
  - SCC Required countries: `Art. 46(2)(c)` (orange)
  - Blocked countries: `Art. 49 — No standard basis` (red)
- **SCC Required Cards**: Include "Register SCC →" link button (`/scc-registry?country={code}`).
- **DPF Section**: Full-width section below three columns explaining EU-US Data Privacy Framework:
  - Left column: "What is DPF?" — adoption, self-certification, Art. 45 adequacy for certified companies
  - Right column: "Schrems III Risk" warning box — NOYB/Max Schrems challenges, ECJ review, recommendation to maintain SCCs
  - Footer note: Sovereign Shield evaluates US transfers as SCC-required by default; DPF-certified partners can override in SCC registry
- **Data**: India in SCC Required list, Venezuela in Blocked list. Last reviewed: March 2026.
- **Footer**: Includes BCR footnote about Binding Corporate Rules and approved codes of conduct.

### 10.7 Evidence Vault — `dashboard/app/evidence-vault/page.tsx`

- **Route**: `/evidence-vault`. Data: `fetchEvidenceEventsWithMeta()` (events, merkleRoots, totalCount), `verifyIntegrity()`. Query `?eventId=` highlights row. Auto-run chain integrity on load. KPI cards, status bar, filters (Risk Level, Destination Country, Search, Event Type). Filters exclude only `HUMAN_OVERSIGHT_REVIEW`; keep `HUMAN_OVERSIGHT_REJECTED` and `HUMAN_OVERSIGHT_APPROVED`. Severity: `HUMAN_OVERSIGHT_REJECTED` → CRITICAL, `HUMAN_OVERSIGHT_APPROVED` → LOW. Labels: "Human Decision — Blocked", "Human Decision — Approved". **Shadow events** (`payload.shadow_mode === true`): yellow "SHADOW" badge in EVENT column; uses normal event types (`DATA_TRANSFER_BLOCKED`, `DATA_TRANSFER_REVIEW`, `DATA_TRANSFER`). Evidence Events Archive: paginated (10/page). Table: EVENT and GDPR BASIS columns. **GDPR basis for human oversight:** when `sourceSystem === 'human-oversight'` or `eventType` includes `HUMAN_OVERSIGHT`, show **Art. 22** (right not to be subject to automated decision-making). Drawer: event details, Transfer sections, Cryptographic Evidence. Export JSON; **PDF export** (jsPDF-generated PDF report; includes Art. 22 for human oversight events). **CHAIN STATUS KPI card shows VALID/TAMPERED status + LAST HASH (first 8...last 8 chars of last event's payload_hash, full hash on hover, hidden when no events exist).**

### 10.8 Transfer Detail — `dashboard/app/transfer-detail/[id]/page.tsx`

- **Route**: `/transfer-detail/[id]` (id = seal_id or evidence id). Data: `fetchReviewQueueItem(id)`, `fetchEvidenceEvents()` for linked event.
- **Actions**: **Reject** (red), **Approve** (green, only when **not** missing SCC), **Add SCC** (orange when SCC required). When missing SCC, Approve hidden; user registers SCC and backend auto-approves matching pending reviews. Reject → sealed `HUMAN_OVERSIGHT_REJECTED`, counted in BLOCKED (24H).
- **Sections**: Status banner; Regulatory Context (GDPR Art. 44–49, 22, 46, EU AI Act 14); Transfer Details (Partner, Destination, Action, Data categories, Records); Technical Details (IPs, path, protocol, User-Agent); Reason Flagged; Evidence Chain (Seal ID, Evidence ID, etc.); Evidence Event (when linked).

### 10.9 Admin Panel — `dashboard/app/admin/page.tsx`

- **Route**: `/admin`. Internal admin-only tenant management.
- **Features**: 
  - KPI cards: Total Tenants, Active Trials, Pro Tenants, Evaluations (24H)
  - Tenant table with filters (plan, mode, search)
  - Create tenant (name, plan, mode, trial days)
  - Extend trial (+30 days), upgrade plan, rotate API key, delete tenant
  - **Trial expiry warning**: Amber "Expiring soon" badge on tenant names within 7 days of expiry
- **Auth**: Admin-only access; redirects non-admin users to home page.

---

## 11. Landing page (`veridion-landing/`)

### 11.1 Documentation page — `veridion-landing/app/docs/page.tsx`

- **Route**: `/docs`. Comprehensive API documentation with sidebar navigation.
- **Sections**: Quick Start, Authentication, Evaluate Transfer, Response Reference, Error Codes, Shadow Mode, Code Examples (curl/Python/Node.js tabs), **MCP Server**, Limitations.
- **MCP Server Section**: 
  - Comparison cards: REST API (manual integration) vs MCP Server (zero-code integration)
  - Setup instructions for Claude Desktop and Cursor with JSON config examples
  - Available tools table (`evaluate_transfer`, `check_scc_coverage`, `get_compliance_status`, `list_adequate_countries`)
- **Features**: Sticky sidebar, mobile dropdown, code examples with copy buttons, responsive design.

### 11.2 Signup page — `veridion-landing/app/signup/page.tsx`

- **Route**: `/signup`. Self-serve tenant registration form.
- **Styling**: Matches `dashboard/app/login/page.tsx` exactly (same card size, form elements, branding).
- **Success page**: Redirects to success page with dashboard link after registration.

---

## 12. Shared components

- **SovereignMap.tsx**: Maps `EvidenceEvent[]` to country status (adequate/SCC/blocked) and transfer counts; outputs for WorldMap. Markers type: `{ lat: number; lng: number; code: string; name: string; color: string }[]`.
- **WorldMap.tsx**: react-simple-maps; 400px map, legend, tooltips; fill by status. Accepts `markers` prop for small country markers.
- **TrialExpiredModal.tsx**: Full-screen non-dismissable modal triggered on 402 responses. Shows trial expiry message, Pro features list (€199/month), mailto CTA to hello@veridion-nexus.eu, GDPR data retention note. Wired into `DashboardLayout` via global callback system.
- **DashboardLayout.tsx**: Client component that registers trial expiry callback and renders `TrialExpiredModal` when trial expires. All dashboard pages wrapped in this layout.

---

## 13. API client — `dashboard/app/utils/api.ts`

- **Base**: Uses relative URL (`API_BASE = ''`) so Next.js rewrites proxy to backend (avoids CORS). Types: `EvidenceEvent`, `SCCRegistry`, `ReviewQueueItem`.
- **Trial Expiry Detection**: Global 402 (Payment Required) handler:
  - `onTrialExpired(callback)` — register callback for trial expiry
  - `triggerTrialExpired()` — trigger registered callback
  - `checkTrialExpired(res)` — helper checks response status 402 and triggers modal
  - All fetch functions check for 402 status and trigger trial expired modal
- **Calls**: 
  - Settings: `fetchSettings()`, `patchSettings({ enforcementMode, confirmationToken? })` — uses camelCase keys
  - Evidence: `fetchEvidenceEvents()`, `fetchEvidenceEventsPaginated(page, limit, eventType?, sourceSystem?)`, `fetchEvidenceEventsWithMeta(params?)` (events, totalCount, merkleRoots), `verifyIntegrity()`
  - SCC: `fetchSCCRegistries()`, `createSCCRegistry(data)`, `patchSCCRegistry(id, data)`, `revokeSCCRegistry(id)`
  - Review Queue: `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`, `fetchReviewQueueItem(id)`, `createReviewQueueItem(data)`, `approveReviewQueueItem(sealId, reason?)`, `rejectReviewQueueItem(sealId, reason?)`
  - Shield: `evaluateTransfer(data)` → `POST /api/v1/shield/evaluate`
- **Note**: `createReviewQueueItem` sends `evidenceEventId`; `rejectReviewQueueItem` creates `HUMAN_OVERSIGHT_REJECTED` event. See §8 for endpoint mapping.

### 13.1 Auth utilities — `dashboard/app/utils/auth.ts`

- **Placeholder implementations** for Phase 0.4 login:
  - `getAuthToken()` — returns token from storage (placeholder)
  - `setAuthToken(token)` — stores token (placeholder)
  - `removeAuthToken()` — clears token (placeholder)
  - `getAuthHeaders()` — returns Authorization header if token exists

---

## 14. Backend (Rust) — relevant for dashboard

- **Evidence**: `src/routes_evidence.rs` — list events (with pagination, filters; returns events, totalCount, merkleRoots), create event, verify-integrity.
- **Shield**: `src/routes_shield.rs` — evaluate (synchronous), ingest-logs (batch), stats, countries, requires-attention, transfers-by-destination, SCC CRUD (list, register, PATCH, delete). On register, `review_queue::approve_pending_reviews_for_scc()` auto-approves pending reviews whose evidence event matches the new SCC destination.
- **Review queue**: `src/routes_review_queue.rs`, `src/review_queue.rs` — list (with status filter), pending, decided-evidence-ids, create (with `evidence_event_id`), approve, reject. Reject creates `HUMAN_OVERSIGHT_REJECTED` evidence event. **Shadow mode propagation**: When creating `HUMAN_OVERSIGHT_REJECTED` or `HUMAN_OVERSIGHT_APPROVED` evidence events, `shadow_mode: true` is added to payload if current enforcement mode is shadow. Applies to manual approve/reject, auto-approve (SCC registration), and SLA timeout auto-block paths.
- **Auth**: `src/routes_auth.rs`, `src/email.rs` — `POST /api/v1/auth/register`: validates inputs, rate-limits 5/IP/hour, checks email uniqueness, creates tenant + user atomically, sends async welcome email (skipped if SMTP not configured). Returns `tenant_id`, `api_key_raw` (once only), `api_key_prefix`, `trial_expires_at`.

---

## 15. File map (dashboard)

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
| `app/evidence-vault/page.tsx` | Evidence Vault |
| `app/components/DashboardLayout.tsx` | Sidebar + main wrapper |
| `app/components/Sidebar.tsx` | Nav links |
| `app/components/SovereignMap.tsx` | Map data from events |
| `app/components/WorldMap.tsx` | World map |
| `app/components/TrialExpiredModal.tsx` | Trial expiry modal overlay |
| `app/config/countries.ts` | EU/EEA, Adequate, SCC-required, Blocked; getLegalBasis, getLegalBasisFullText, getCountryCodeFromName; ADEQUATE_COUNTRY_LIST, SCC_REQUIRED_COUNTRY_LIST, BLOCKED_COUNTRY_LIST |
| `app/utils/api.ts` | API client, types, trial expiry detection |
| `app/utils/auth.ts` | Auth token utilities (placeholder for Phase 0.4) |

---

## 16. Build and deployment

### 16.1 Dynamic rendering

All dashboard pages that fetch backend data use `export const dynamic = 'force-dynamic'` to disable static prerendering:
- `/` (Sovereign Shield home)
- `/transfer-log`
- `/review-queue`
- `/scc-registry`
- `/evidence-vault`
- `/admin`

Pages using `useSearchParams()` are wrapped in Suspense boundaries to satisfy Next.js 14 requirements.

### 16.2 Trial expiry handling

- **Backend**: Returns `402 Payment Required` when tenant trial has expired (middleware checks `trial_expires_at`).
- **Frontend**: Global 402 detection in `api.ts` triggers `TrialExpiredModal` via callback system.
- **Modal**: Non-dismissable full-screen overlay with upgrade CTA. Admin tenant never expires (no modal shown).

### 16.3 Production deployment

**Location**: `/opt/veridion-nexus` on Hetzner Ubuntu 24.04 server

**Files**:
- `deploy.sh` — Production deployment script that: (1) changes to `/opt/veridion-nexus`, (2) runs `git pull`, (3) smart rebuilds API only if Rust/migration files changed, (4) always rebuilds dashboard with `--no-cache`, (5) uses `--env-file .env` for all docker compose commands, (6) verifies health with `curl http://localhost:8080/health`. Idempotent — safe to run multiple times.
- `Dockerfile` — Multi-stage Rust API build (rust:1.88 builder → debian:bookworm-slim runtime)
- `Dockerfile.dashboard` — Next.js dashboard build (node:20-alpine) with `ARG NEXT_PUBLIC_API_URL` and `ENV NEXT_PUBLIC_API_URL` set before `npm run build` to embed the API URL at build time
- `docker-compose.prod.yml` — Production compose with postgres, api, dashboard services. Uses `--env-file .env` for environment variables.

**Services**:
- **postgres**: postgres:16-alpine, named volume `veridion_api_data`
- **api**: Built from `Dockerfile`, env from `.env`: `DATABASE_URL`, `JWT_SECRET`, `RUST_ENV=production`, `SERVER_HOST=0.0.0.0`, `SERVER_PORT=8080`, `ALLOWED_ORIGINS` (includes `https://app.veridion-nexus.eu`)
- **dashboard**: Built from `Dockerfile.dashboard` with `NEXT_PUBLIC_API_URL` build arg. Runtime env: `NEXT_PUBLIC_API_URL=https://api.veridion-nexus.eu`. Login page uses `process.env.NEXT_PUBLIC_API_URL` for API calls.

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

---

When changing behaviour or routes, update this file to keep it accurate.
