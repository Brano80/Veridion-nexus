# Veridion Nexus MCP Server

Two MCP servers in one package:

## Sovereign Shield (GDPR transfer enforcement)

`npx veridion-shield-mcp` (binary: `veridion-shield-mcp`)

**Tools:** `evaluate_transfer`, `check_scc_coverage`, `get_compliance_status`, `list_adequate_countries`

**Requires:** `VERIDION_NEXUS_API_KEY`

Optional: `VERIDION_NEXUS_API_URL` (default: `https://api.veridion-nexus.eu`)

## Accountability Ledger (MCP audit proxy)

`npx veridion-nexus-mcp` (binary: `veridion-nexus-mcp`)

**Requires:** `AL_API_BASE_URL`, `AL_SERVICE_TOKEN`, `UPSTREAM_MCP_COMMAND`

The AL proxy forwards tool calls to an upstream MCP server and records audit events to the Veridion API.
