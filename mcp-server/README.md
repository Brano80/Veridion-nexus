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

## Accountability Ledger (MCP audit proxy)

The AL proxy implementation lives in `src/al-proxy.ts` for a future **`nexus-al-mcp`** package. It is **not** compiled or published in this release.
