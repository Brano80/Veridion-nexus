# Veridion Nexus MCP Server

GDPR Art. 44-49 runtime compliance enforcement for AI agents.

Veridion Nexus is available as an MCP (Model Context Protocol) server. This allows AI agents — including Claude, Cursor, and any MCP-compatible assistant — to evaluate cross-border data transfers automatically, without manual API integration.

## Installation

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veridion-nexus": {
      "command": "npx",
      "args": ["veridion-nexus-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key_here"
      }
    }
  }
}
```

File location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "veridion-nexus": {
      "command": "npx",
      "args": ["veridion-nexus-mcp"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "ss_test_your_key_here"
      }
    }
  }
}
```

### Manual (local build)

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

## Tools

| Tool | Description |
|---|---|
| `evaluate_transfer` | Evaluate a cross-border transfer before it happens |
| `check_scc_coverage` | Check SCC registry for a country/partner |
| `get_compliance_status` | Get account compliance overview |
| `list_adequate_countries` | List countries by GDPR transfer status |

## Environment variables

| Variable | Required | Default |
|---|---|---|
| `VERIDION_NEXUS_API_KEY` | Yes | — |
| `VERIDION_NEXUS_API_URL` | No | `https://api.veridion-nexus.eu` |

## Example usage in Claude

Once configured, Claude will automatically use Veridion Nexus before data transfers:

> "Before calling the OpenAI API with this user's email address, evaluate the transfer to the US."

Claude calls `evaluate_transfer` and handles the decision.

## How it works

1. Your AI agent receives a task that involves sending personal data to an external service
2. The agent calls `evaluate_transfer` with the destination country and data categories
3. Veridion Nexus evaluates the transfer against GDPR Art. 44-49 and returns ALLOW, BLOCK, or REVIEW
4. Every decision is cryptographically sealed in the Evidence Vault
5. The agent proceeds (ALLOW), stops (BLOCK), or queues for human review (REVIEW)

## Decision types

| Decision | Meaning | Agent action |
|---|---|---|
| **ALLOW** | Transfer is permitted | Proceed with the transfer |
| **BLOCK** | No legal transfer basis | Do not proceed |
| **REVIEW** | Human approval required | Queue for review, do not proceed |

## Limitations

- Veridion Nexus supports demonstrable compliance — it does not guarantee it
- Country classifications are updated manually, not pulled live from the EU Commission
- The system trusts the `data_categories` you provide; it does not inspect payload content
- Shadow Mode (trial) records decisions but does not enforce them
