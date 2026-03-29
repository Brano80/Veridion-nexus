-- Per-agent PII detection hints for MCP proxy (arg key names + tool names).
-- Shape: { "arg_keys": ["email", "name"], "tool_names": ["cv_parser"] }

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS pii_heuristics JSONB DEFAULT NULL;

COMMENT ON COLUMN agents.pii_heuristics IS
  'Optional JSON: { "arg_keys": string[], "tool_names": string[] }; NULL = use global defaults in MCP proxy';
