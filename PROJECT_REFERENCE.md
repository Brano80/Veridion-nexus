# Project Reference — Veridion API / Sovereign Shield

**Version:** 1.2  
**Last updated:** 2026-03-03

This is the **single project reference** for Veridion API: vision, scope, tech stack, configuration, and current behaviour (dashboard and API). Use it to onboard, scope work, and keep the codebase and docs aligned.

---

## 1. Vision

**Veridion API** is a **standalone HTTP API and database** for EU-focused compliance tooling. It is built to:

- Provide a **separate service and database** from any other Veridion product (e.g. veridion-nexus), with no shared code or migration path.
- Expose **health, auth, and compliance endpoints** that frontends and other services can call.
- Support **four compliance pillars** at the data layer:
  - **Sovereign Shield** — international transfer monitoring and blocking (GDPR Art. 44–49).
  - **Evidence Vault** — append-only, sealed evidence for audits and export.
  - **Crypto Shredder** — key storage and shredding for GDPR Art. 17 (right to erasure).
  - **Human Oversight** — queue and status for human review (e.g. EU AI Act Art. 14).

The vision is a **single, deployable API** that owns its schema and can grow from a minimal service into a full compliance API without depending on another codebase.

---

## 2. What This Project Is

| Aspect | Description |
|--------|-------------|
| **Product** | Standalone REST API plus Sovereign Shield dashboard (Next.js). Own PostgreSQL database. Own migrations. |
| **Boundary** | No shared migrations, shared DB, or shared Rust crates with veridion-nexus or other repos. |
| **Current scope** | Health, dev auth (JWT), CORS; Evidence Vault (events, verify-integrity, PDF export); Sovereign Shield (ingest/evaluate, evidence + review queue); SCC registries (CRUD, PATCH tia_completed, dpa_id, scc_module; auto-approve on register); Human Oversight (review queue, pending/decided, approve/reject, decided-evidence-ids); Crypto Shredder (erasure execute). Migrations 001–024. |
| **Planned scope** | Further dashboard features, production auth. |

**What it is not:** Not a fork or subset of veridion-nexus. Not a monorepo member that shares `migrations/` or `src/` with another project.

---

## 3. Overview (runtime)

- **Backend**: Rust (Actix-web) API on `http://localhost:8080`.
- **Frontend**: Next.js 14 dashboard (Sovereign Shield) in `dashboard/`, on `http://localhost:3000`.
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

---

## 5. Project structure and configuration

### 5.1 Directory layout

```
veridion-api/
├── Cargo.toml
├── src/                    # Rust API (main.rs, routes_*, evidence, shield, review_queue, etc.)
├── migrations/             # Schema 001–024 (no external path)
├── dashboard/              # Next.js Sovereign Shield (app/, components/, utils/)
├── .env
├── PROJECT_REFERENCE.md    # This file
└── …
```

**Migrations:** 24 (001–024). Key tables: `users`, `compliance_records`, `human_oversight`, `evidence_events`, `scc_registries`. Migration **022** adds `evidence_event_id` to `compliance_records`. **023** adds `tia_completed` (Transfer Impact Assessment) to `scc_registries`. **024** adds `dpa_id` and `scc_module` to `scc_registries`. Full list in `migrations/`.

### 5.2 Configuration

| Variable         | Required | Purpose |
|------------------|----------|---------|
| `DATABASE_URL`   | Yes      | PostgreSQL connection string |
| `SERVER_HOST`    | No       | Bind host (default `0.0.0.0`) |
| `SERVER_PORT`    | No       | Bind port (default `8080`) |
| `ALLOWED_ORIGINS`| No       | CORS origins (default includes localhost:3000) |
| `RUST_ENV`       | No       | e.g. `development`; production disables dev-bypass |
| `JWT_SECRET`     | No       | JWT secret (dev default if unset) |
| `MIGRATIONS_PATH`| No       | Override migrations dir (default `./migrations`) |
| `RESET_MIGRATIONS` | No     | If set, re-run all migrations (one-time fix) |

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
- **Pillar-ready schema** — Tables for all four pillars; API and logic added incrementally.
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
| `POST /api/v1/shield/evaluate` | Evaluate transfer (synchronous runtime enforcement) |
| `POST /api/v1/shield/ingest-logs` | Batch ingest transfer logs |
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

### 8.6 Crypto Shredder

| Method + path | Purpose |
|---------------|--------|
| `POST /api/v1/lenses/gdpr-rights/erasure/execute` | Execute GDPR Art. 17 erasure (requires confirmation: "ERASE {userId}") |

**Note:** Dashboard calls `/api/v1/shield/evaluate` via `evaluateTransfer()` and `/api/v1/lenses/gdpr-rights/erasure/execute` via `executeErasure()`. Full route list in `src/main.rs` startup log. Evidence API returns `merkleRoots` for chain integrity display.

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
- **Data**: `fetchEvidenceEvents()`, `fetchSCCRegistries()`, `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`; auto-refresh 5s; Refresh button. **ensureEventsInReviewQueue** runs on load: finds SCC-required (REVIEW) events without a valid SCC and creates a review queue item via `createReviewQueueItem({ action, context, evidenceEventId })` for each not already in queue. Decided evidence IDs excluded from "Requires Attention".
- **Header**: "SOVEREIGN SHIELD", "GDPR Chapter V (Art. 44-49) • International Data Transfers". Refresh.
- **Status bar**: Status (PROTECTED→ENABLED, ATTENTION, AT_RISK), Last scan.
- **KPI cards (8)**: Row 1 — TRANSFERS (24H), ADEQUATE COUNTRIES (15), HIGH RISK DESTINATIONS (0), **BLOCKED (24H)** (policy blocks + `HUMAN_OVERSIGHT_REJECTED`). Row 2 — SCC COVERAGE, EXPIRING SCCs, **PENDING APPROVALS** (SCC-required without valid SCC), ACTIVE AGENTS.
- **Main**: **Left** — TRANSFER MAP (SovereignMap/WorldMap); EU/EEA adequate. **Right** — REQUIRES ATTENTION: only SCC-required without valid SCC, pending and not decided; click → Transfer Detail; up to 5; "View All →". **Below** — RECENT ACTIVITY (last 10 events, BLOCK/REVIEW/ALLOW badges).

### 10.2 Transfer Log — `dashboard/app/transfer-log/page.tsx`

- **Route**: `/transfer-log`. Data: `fetchEvidenceEventsPaginated()` (50 per page); filters ALL | ALLOWED | BLOCKED | PENDING; filters by `source_system='sovereign-shield'` and transfer event types. Table: Timestamp, Destination, Partner, Data Category, Agent/Endpoint, Purpose (if present), Legal Basis, Status. CSV export. Pagination controls.

### 10.3 Review Queue — `dashboard/app/review-queue/page.tsx`

- **Route**: `/review-queue`. Data: `fetchReviewQueuePending()`. Approve/Reject via `approveReviewQueueItem(sealId)` / `rejectReviewQueueItem(sealId)`. Table: Transfer Details (click → Transfer Detail), Reason, Suggested Decision, Actions. Auto-refresh 5s.

### 10.4 SCC Registry — `dashboard/app/scc-registry/page.tsx`

- **Route**: `/scc-registry`. Data: `fetchSCCRegistries()`, `createSCCRegistry()`, `patchSCCRegistry()`. Wizard (Partner, Country; SCC Module C2C/C2P/P2P/P2C, DPA ID, dates, TIA completed; Submit). Pre-fill from `?country=` and `?partner=` query params. Filters (status, search) and KPI cards (Total, Active, Expiring Soon, Expired). Registry cards show Partner, Country, Module, DPA ID, expiry, TIA status; **Mark TIA Complete** button calls PATCH. Renew flow for expiring SCCs.

### 10.5 Adequate Countries — `dashboard/app/adequate-countries/page.tsx`

- **Route**: `/adequate-countries`. Static: EU adequate, SCC required, Blocked country cards. No API. Brazil adequacy note (adopted January 2026).

### 10.6 Evidence Vault — `dashboard/app/evidence-vault/page.tsx`

- **Route**: `/evidence-vault`. Data: `fetchEvidenceEventsWithMeta()` (events, merkleRoots, totalCount), `verifyIntegrity()`. Query `?eventId=` highlights row. Auto-run chain integrity on load. KPI cards, status bar, filters (Risk Level, Destination Country, Search, Event Type). Filters exclude only `HUMAN_OVERSIGHT_REVIEW`; keep `HUMAN_OVERSIGHT_REJECTED` and `HUMAN_OVERSIGHT_APPROVED`. Severity: `HUMAN_OVERSIGHT_REJECTED` → CRITICAL, `HUMAN_OVERSIGHT_APPROVED` → LOW. Labels: "Human Decision — Blocked", "Human Decision — Approved". Evidence Events Archive: paginated (10/page). Table: EVENT and GDPR BASIS columns are plain text (no badge styling). **GDPR basis for human oversight:** when `sourceSystem === 'human-oversight'` or `eventType` includes `HUMAN_OVERSIGHT`, show **Art. 22** (right not to be subject to automated decision-making). Drawer: event details, Transfer/Erasure sections, Cryptographic Evidence. Export JSON; **PDF export** (HTML report via print dialog; includes Art. 22 for human oversight events).

### 10.7 Transfer Detail — `dashboard/app/transfer-detail/[id]/page.tsx`

- **Route**: `/transfer-detail/[id]` (id = seal_id or evidence id). Data: `fetchReviewQueueItem(id)`, `fetchEvidenceEvents()` for linked event.
- **Actions**: **Reject** (red), **Approve** (green, only when **not** missing SCC), **Add SCC** (orange when SCC required). When missing SCC, Approve hidden; user registers SCC and backend auto-approves matching pending reviews. Reject → sealed `HUMAN_OVERSIGHT_REJECTED`, counted in BLOCKED (24H).
- **Sections**: Status banner; Regulatory Context (GDPR Art. 44–49, 22, 46, EU AI Act 14); Transfer Details (Partner, Destination, Action, Data categories, Records); Technical Details (IPs, path, protocol, User-Agent); Reason Flagged; Evidence Chain (Seal ID, Evidence ID, etc.); Evidence Event (when linked).

---

## 11. Shared components

- **SovereignMap.tsx**: Maps `EvidenceEvent[]` to country status (adequate/SCC/blocked) and transfer counts; outputs for WorldMap.
- **WorldMap.tsx**: react-simple-maps; 400px map, legend, tooltips; fill by status.

---

## 12. API client — `dashboard/app/utils/api.ts`

- **Base**: Uses relative URL (`API_BASE = ''`) so Next.js rewrites proxy to backend (avoids CORS). Types: `EvidenceEvent`, `SCCRegistry`, `ReviewQueueItem`.
- **Calls**: 
  - Evidence: `fetchEvidenceEvents()`, `fetchEvidenceEventsPaginated(page, limit, eventType?, sourceSystem?)`, `fetchEvidenceEventsWithMeta(params?)` (events, totalCount, merkleRoots), `verifyIntegrity()`
  - SCC: `fetchSCCRegistries()`, `createSCCRegistry(data)`, `patchSCCRegistry(id, data)`, `revokeSCCRegistry(id)`
  - Review Queue: `fetchReviewQueuePending()`, `fetchDecidedEvidenceIds()`, `fetchReviewQueueItem(id)`, `createReviewQueueItem(data)`, `approveReviewQueueItem(sealId, reason?)`, `rejectReviewQueueItem(sealId, reason?)`
  - Shield: `evaluateTransfer(data)` → `POST /api/v1/shield/evaluate`
  - Erasure: `executeErasure(data)` → `POST /api/v1/lenses/gdpr-rights/erasure/execute`
- **Note**: `createReviewQueueItem` sends `evidenceEventId`; `rejectReviewQueueItem` creates `HUMAN_OVERSIGHT_REJECTED` event. See §8 for endpoint mapping.

---

## 13. Backend (Rust) — relevant for dashboard

- **Evidence**: `src/routes_evidence.rs` — list events (with pagination, filters; returns events, totalCount, merkleRoots), create event, verify-integrity.
- **Shield**: `src/routes_shield.rs` — evaluate (synchronous), ingest-logs (batch), stats, countries, requires-attention, transfers-by-destination, SCC CRUD (list, register, PATCH, delete). On register, `review_queue::approve_pending_reviews_for_scc()` auto-approves pending reviews whose evidence event matches the new SCC destination.
- **Review queue**: `src/routes_review_queue.rs`, `src/review_queue.rs` — list (with status filter), pending, decided-evidence-ids, create (with `evidence_event_id`), approve, reject. Reject creates `HUMAN_OVERSIGHT_REJECTED` evidence event.
- **Erasure**: `src/routes_erasure.rs` — execute erasure (requires confirmation format "ERASE {userId}").

---

## 14. File map (dashboard)

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
| `app/config/countries.ts` | EU/EEA, Adequate, SCC-required, Blocked; getLegalBasis, getLegalBasisFullText, getCountryCodeFromName |
| `app/utils/api.ts` | API client and types |

---

When changing behaviour or routes, update this file to keep it accurate.
