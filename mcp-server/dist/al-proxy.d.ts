/**
 * MCP Governance Gateway (veridion-nexus-gateway) — legacy bundle via veridion-nexus-mcp
 * Phase 1: Tool call interception, hash-chained audit trail, upstream forwarding.
 * Phase 2: DataTransferRecord + HumanOversightRecord + trust wiring.
 *
 * Architecture (ADR 001):
 *   AI Agent → [this proxy] → Upstream MCP Server
 *                    ↓
 *             Rust API (/api/acm/*)
 */
export {};
