# Phase 0 — Cursor Implementation Instructions

These files are ready to copy into the repo. Follow the steps below in order.

---

## Step 1 — Create the ADR

```
mkdir -p docs/adr
cp docs_adr_001-al-architecture.md docs/adr/001-al-architecture.md
```

---

## Step 2 — Run migrations in order

Copy each migration to the `migrations/` folder and run them against your dev database:

```
cp migrations_035_acm_tool_call_events.sql        migrations/035_acm_tool_call_events.sql
cp migrations_036_acm_context_trust_annotations.sql migrations/036_acm_context_trust_annotations.sql
cp migrations_037_acm_agent_identity.sql           migrations/037_acm_agent_identity.sql
```

Then run:
```bash
psql $DATABASE_URL -f migrations/035_acm_tool_call_events.sql
psql $DATABASE_URL -f migrations/036_acm_context_trust_annotations.sql
psql $DATABASE_URL -f migrations/037_acm_agent_identity.sql
```

Or via your existing migration runner if one is configured.

**Verify after each migration:**
- 035: `\d tool_call_events` — should show all columns including event_hash, trace_id
- 036: `\d context_trust_annotations` — should show trust_level check constraint
- 037: `\d agents` — should show new columns: oauth_client_id, retention_policy, etc.

---

## Step 3 — Add jose dependency to mcp-server

```bash
cd mcp-server
npm install jose
```

`jose` is needed for JWKS validation in `oauth.ts`.

---

## Step 4 — Create the TypeScript source files

```
mkdir -p mcp-server/src/types
cp mcp-server_src_types_acm.ts   mcp-server/src/types/acm.ts
cp mcp-server_src_oauth.ts       mcp-server/src/oauth.ts
cp mcp-server_src_al-client.ts   mcp-server/src/al-client.ts
cp mcp-server_src_index.ts       mcp-server/src/index.ts
```

---

## Step 5 — Add env variables

Append the contents of `env.proxy.example` to your root `.env.example` and `.env`.

For local development, set:
```
AL_AUTH_MODE=dev_bypass
AL_DEV_CLIENT_ID=test-agent-001
AL_API_BASE_URL=http://localhost:8080
AL_SERVICE_TOKEN=<generate with: openssl rand -hex 32>
```

---

## Step 6 — Build and type-check

```bash
cd mcp-server
npm run build
```

Should compile with zero TypeScript errors.

**Known TODOs left for Phase 1 (marked in index.ts):**
1. Replace the upstream MCP stub with a real `Client` connection to the upstream MCP server
2. Make `inferDecisionMade` configurable per-tool via AgentRecord metadata
3. Make `extractDataSubjects` configurable via AgentRecord classification

---

## Step 7 — Add Rust API routes (Phase 1 task — not in this batch)

The proxy calls these Rust endpoints which don't exist yet:
- `GET  /api/acm/agents?oauth_client_id={id}` → resolve AgentRecord by OAuth client_id
- `POST /api/acm/events`                       → create ToolCallEvent (hash-chain computed here)
- `POST /api/acm/trust-annotations`            → create ContextTrustAnnotation
- `GET  /api/acm/trust-annotations/session/{session_id}/current` → get current trust level

These are Phase 1 Rust work. The proxy will start but all record writes will fail until
these routes exist. That's expected — implement the proxy first, then the API routes.

---

## Verification checklist

- [ ] `psql $DATABASE_URL -c "\d tool_call_events"` shows all columns
- [ ] `psql $DATABASE_URL -c "\d context_trust_annotations"` shows trust_level constraint
- [ ] `psql $DATABASE_URL -c "\d agents"` shows oauth_client_id column
- [ ] `cd mcp-server && npm run build` exits 0
- [ ] No TypeScript errors in any of the four new .ts files
- [ ] `docs/adr/001-al-architecture.md` committed to repo
