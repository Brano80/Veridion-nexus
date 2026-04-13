# Veridion Nexus MCP Server

**Default entry:** Sovereign Shield tools (GDPR Art. 44–49 transfer enforcement).

## Usage

```bash
npx veridion-nexus-mcp
```

**Binary:** `veridion-nexus-mcp` → `dist/index.js`

**Tools:** `evaluate_transfer`, `check_scc_coverage`, `get_compliance_status`, `list_adequate_countries`

**Requires:** `VERIDION_NEXUS_API_KEY`

Optional: `VERIDION_NEXUS_API_URL` (default: `https://api.veridion-nexus.eu`)

---

## MCP Governance Gateway (bundled entry)

The gateway implementation lives in `src/al-proxy.ts`; the same binary is published as **`veridion-nexus-gateway`** from **`mcp-server-gateway/`**. This package also exposes optional **`veridion-nexus-gateway`** → `dist/al-proxy.js` — see `mcp-server/package.json` `bin`.
