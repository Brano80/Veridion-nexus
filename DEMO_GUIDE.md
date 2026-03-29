# Demo Guide — Veridion Nexus MCP

## Before every demo — run this checklist

1. Open Cursor and ask: "Send a test transfer to France for partner OpenAI with data categories email and name"
2. Check dashboard at app.veridion-nexus.eu — transfer should appear within seconds
3. If it works — you're ready

## If MCP authentication fails

### Step 1 — Regenerate Almaco API key
Run this command:
```bash
ssh root@46.225.118.162 "docker exec veridion-postgres psql -U postgres -d veridion_api -c \"UPDATE tenants SET api_key = 'ss_test_' || encode(gen_random_bytes(16), 'hex') WHERE name='Almaco' RETURNING api_key;\""
```
Copy the new key from the output.

### Step 2 — Update .cursor/mcp.json
Replace the value of `VERIDION_NEXUS_API_KEY` with the new key:
```json
{
  "mcpServers": {
    "veridion-nexus": {
      "command": "node",
      "args": ["C:\\Users\\Brano\\AppData\\Roaming\\npm\\node_modules\\veridion-nexus-mcp\\dist\\index.js"],
      "env": {
        "VERIDION_NEXUS_API_KEY": "NEW_KEY_HERE"
      }
    }
  }
}
```

### Step 3 — Restart Cursor completely
Close and reopen Cursor. Check Settings → Tools & MCP → veridion-nexus shows green dot with 4 tools.

### Step 4 — Test again
Ask Cursor: "Send a test transfer to France for partner OpenAI with data categories email and name"

## Important rules
- NEVER run `docker compose down -v` on production — it wipes the database and invalidates all API keys
- Current Almaco API key: `ss_test_25cc5fc40167da75ea0f34ac8b5a53ca`
- If key stops working, always regenerate via SSH (Step 1 above)
