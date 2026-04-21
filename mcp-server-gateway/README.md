# veridion-nexus-gateway — MCP Governance Gateway

**npm:** `veridion-nexus-gateway@0.1.1` — MCP proxy package version (see `package.json`).

Sits between your AI agent and any MCP server. Every tool call is intercepted, identity-verified, and logged as a tamper-evident compliance record.

Satisfies EU AI Act Art. 12 (logging) and GDPR Art. 30 (records of processing).

## How it works

```
Agent → veridion-nexus-gateway → upstream MCP server
                 ↓
         Rust API (/api/acm/*)
                 ↓
         PostgreSQL (tool_call_events, hash-chained)
```

Tool calls are forwarded to the upstream MCP first. Each call is then logged asynchronously to the ACM API. If logging fails, the error is captured in proxy logs; the agent may still have received an upstream result. Strict fail-closed mode (block until persisted) is a planned option.

## Quick start (dev mode — 30 minutes)

### 1. Get your credentials

Sign up at [veridion-nexus.eu](https://veridion-nexus.eu) → register your agent → copy your Agent ID and Service Token.

### 2. Install

```bash
npx -y veridion-nexus-gateway
```

### 3. Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veridion-gateway": {
      "command": "npx",
      "args": ["-y", "veridion-nexus-gateway"],
      "env": {
        "AL_API_BASE_URL": "https://api.veridion-nexus.eu",
        "AL_SERVICE_TOKEN": "your_service_token",
        "AL_AUTH_MODE": "dev_bypass",
        "AL_DEV_CLIENT_ID": "agt_your_agent_id",
        "UPSTREAM_MCP_MODE": "stdio",
        "UPSTREAM_MCP_COMMAND": "npx -y your-upstream-mcp-server"
      }
    }
  }
}
```

### 4. View logs

Open [app.veridion-nexus.eu](https://app.veridion-nexus.eu) → ACM Overview → see every tool call logged.

## Configuration

### Authentication

**For real users (production)** — Veridion Nexus tenant API key + agent ID (no shared server token):

```bash
AL_AUTH_MODE=api_key
VERIDION_API_KEY=ss_live_...   # Your Veridion Nexus API key (same as Shield)
VERIDION_AGENT_ID=agt_...      # Agent ID from the dashboard
```

Register the agent in the dashboard first, then run e.g. `npx -y veridion-nexus-gateway@latest` with the three variables above (plus `AL_API_BASE_URL` and upstream MCP settings).

**Internal / dev use only** — server-level token and fixed client id (not per-tenant):

```bash
AL_AUTH_MODE=dev_bypass
AL_SERVICE_TOKEN=...           # Server-level token (internal only)
AL_DEV_CLIENT_ID=...           # Agent oauth_client_id / dev client id
```

**OAuth 2.1 (JWKS)** — JWT bearer; see below.

### Authentication modes

- **api_key:** `AL_AUTH_MODE=api_key` with `VERIDION_API_KEY` and `VERIDION_AGENT_ID`. The gateway calls `GET /api/acm/agents/lookup` using your tenant API key.
- **dev_bypass:** `AL_AUTH_MODE=dev_bypass` with `AL_DEV_CLIENT_ID` matching the agent's `oauth_client_id` in the DB. Typical for local Claude Desktop / Cursor with `AL_SERVICE_TOKEN`.
- **jwks:** JWT required. With stdio MCP, set `AL_AGENT_TOKEN` in env — there is no HTTP `Authorization` header passed to the process automatically.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AL_API_BASE_URL` | Yes | `http://localhost:8080` | Rust API URL |
| `VERIDION_API_KEY` | api_key (or ACM calls) | — | Per-tenant API key (`ss_test_` / `ss_live_`); preferred for `/api/acm/*` |
| `VERIDION_AGENT_ID` | api_key | — | Agent id (`agt_…`) when `AL_AUTH_MODE=api_key` |
| `AL_SERVICE_TOKEN` | dev / legacy | — | Server token for `/api/acm/*`; used if `VERIDION_API_KEY` unset |
| `AL_AUTH_MODE` | No | `jwks` | `api_key`, `dev_bypass`, or `jwks` |
| `AL_DEV_CLIENT_ID` | dev_bypass | — | Fixed agent client_id for testing |
| `UPSTREAM_MCP_MODE` | No | `stdio` | `stdio` or `sse` |
| `UPSTREAM_MCP_COMMAND` | stdio | — | Command to launch upstream MCP server |
| `UPSTREAM_MCP_ARGS` | No | `[]` | JSON array of args for upstream command |
| `UPSTREAM_MCP_URL` | sse | — | SSE endpoint for upstream server |
| `AL_ORIGIN_COUNTRY` | No | `DE` | Origin country for transfer records |
| `AL_EEA_EXTRA_COUNTRIES` | No | — | Comma-separated extra EEA codes |

## Production (OAuth 2.1)

For production with OAuth, set `AL_AUTH_MODE=jwks` and configure:

- `AL_OAUTH_ISSUER` — your authorization server URL
- `AL_OAUTH_AUDIENCE` — expected audience claim
- `AL_JWKS_URI` — JWKS endpoint (defaults to `{issuer}/.well-known/jwks.json`)

Every agent must have a registered `oauth_client_id` in the agents table.

## What gets logged

Each tool call creates a `ToolCallEvent` with:
- Agent identity (from OAuth token, not self-reported)
- Tool name and input field names (not values — data minimisation)
- Context trust level (trusted / degraded / untrusted)
- SHA-256 hash chain (tamper-evident)
- OTel trace_id for delegation chain (when W3C traceparent header present)

Optional side-records:
- `DataTransferRecord` — when tool call involves non-EEA transfer
- `HumanOversightRecord` — when degraded trust + high-risk AI system

## License

UNLICENSED — proprietary.
