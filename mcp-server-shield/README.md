# Veridion Shield MCP

GDPR Art. 44-49 runtime transfer enforcement for AI agents (Claude, Cursor, etc.)

## Setup

Get your API key at https://veridion-nexus.eu/signup

### Claude Desktop
Add to claude_desktop_config.json:
```json
{
  "mcpServers": {
    "veridion-shield": {
      "command": "npx",
      "args": ["-y", "veridion-shield-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key"
      }
    }
  }
}
```

### Cursor
Add to .cursor/mcp.json:
```json
{
  "mcpServers": {
    "veridion-shield": {
      "command": "npx", 
      "args": ["-y", "veridion-shield-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key"
      }
    }
  }
}
```

## Tools
- evaluate_transfer — evaluate cross-border transfer before it happens
- check_scc_coverage — check SCC registry for partner/country
- get_compliance_status — account compliance overview
- list_adequate_countries — countries by GDPR transfer status
