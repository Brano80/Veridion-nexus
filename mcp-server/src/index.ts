/**
 * Accountability Ledger — MCP Proxy
 * Phase 1: real upstream MCP connection (replaces stub).
 *
 * Architecture (ADR 001):
 *   AI Agent → [this proxy] → Upstream MCP Server
 *                    ↓
 *             Rust API (/api/acm/*)
 *
 * Changes from Phase 0 skeleton:
 *   - UpstreamMcpClient replaces all stub upstream calls
 *   - listTools() proxies real upstream tool list
 *   - callTool() forwards to real upstream and records actual outputs
 *   - Graceful shutdown on SIGINT/SIGTERM
 *   - Upstream connection happens before session init — fails fast if misconfigured
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

import { AlClient } from './al-client.js';
import { UpstreamMcpClient } from './upstream-client.js';
import { validateToken, extractBearerToken } from './oauth.js';
import type { AgentRecord, TrustLevel } from './types/acm.js';

// ── Session state ─────────────────────────────────────────────────────────────

interface SessionState {
  sessionId: string;
  agentRecord: AgentRecord;
  trustLevel: TrustLevel;
  annotationRef: string;
  traceId?: string;
  parentSpanId?: string;
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

class AccountabilityLedgerProxy {
  private server: Server;
  private alClient: AlClient;
  private upstream: UpstreamMcpClient;
  private session: SessionState | null = null;

  constructor() {
    this.alClient = new AlClient();
    this.upstream = new UpstreamMcpClient();
    this.server = new Server(
      { name: 'accountability-ledger-proxy', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.registerHandlers();
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private registerHandlers(): void {
    // List tools: return real upstream tool list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.ensureSession();
      const tools = this.upstream.listTools();
      return { tools };
    });

    // Call tool: intercept, record, forward to upstream
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.ensureSession();
      return this.handleToolCall(
        request.params.name,
        (request.params.arguments ?? {}) as Record<string, unknown>,
      );
    });
  }

  // ── Tool call interception ────────────────────────────────────────────────

  private async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const session = this.session!;
    const calledAt = new Date().toISOString();

    // 1. Check tools_permitted allowlist
    if (
      session.agentRecord.tools_permitted.length > 0 &&
      !session.agentRecord.tools_permitted.includes(toolName)
    ) {
      this.recordEventAsync({
        toolName, args, result: null, calledAt,
        decisionMade: false, humanReviewRequired: false,
        outcomeNotes: `Blocked: '${toolName}' not in tools_permitted`,
      });
      return {
        content: [{ type: 'text', text: `Tool '${toolName}' is not permitted for this agent.` }],
        isError: true,
      };
    }

    // 2. Check upstream is available
    if (!this.upstream.isConnected()) {
      this.recordEventAsync({
        toolName, args, result: null, calledAt,
        decisionMade: false, humanReviewRequired: false,
        outcomeNotes: 'Blocked: upstream MCP server not connected',
      });
      return {
        content: [{ type: 'text', text: 'Upstream MCP server is temporarily unavailable.' }],
        isError: true,
      };
    }

    // 3. Forward to upstream
    let result: CallToolResult;
    let upstreamError: string | undefined;
    try {
      result = await this.upstream.callTool(toolName, args);
    } catch (err) {
      upstreamError = (err as Error).message;
      result = {
        content: [{ type: 'text', text: `Upstream error: ${upstreamError}` }],
        isError: true,
      };
    }

    // 4. Determine decision + review requirement
    const decisionMade = this.inferDecisionMade(toolName);
    const humanReviewRequired =
      session.trustLevel !== 'trusted' &&
      session.agentRecord.eu_ai_act_risk_level === 'high' &&
      decisionMade;

    // 5. Record ToolCallEvent (async — does not block response)
    this.recordEventAsync({
      toolName, args, result, calledAt,
      decisionMade, humanReviewRequired,
      outcomeNotes: upstreamError,
    });

    return result;
  }

  // ── Async event recording ────────────────────────────────────────────────

  private recordEventAsync(params: {
    toolName: string;
    args: Record<string, unknown>;
    result: CallToolResult | null;
    calledAt: string;
    decisionMade: boolean;
    humanReviewRequired: boolean;
    outcomeNotes?: string;
  }): void {
    const session = this.session!;

    this.alClient
      .recordToolCallEvent({
        agent_id: session.agentRecord.agent_id,
        session_id: session.sessionId,
        tenant_id: session.agentRecord.tenant_id,
        tool_id: params.toolName,
        called_at: params.calledAt,
        inputs: {
          fields_requested: Object.keys(params.args),
          data_subjects: this.extractDataSubjects(params.args),
        },
        outputs: {
          fields_returned: params.result
            ? this.extractOutputFields(params.result)
            : [],
        },
        context_trust_level: session.trustLevel,
        decision_made: params.decisionMade,
        human_review_required: params.humanReviewRequired,
        outcome_notes: params.outcomeNotes,
        eu_ai_act_risk_level: session.agentRecord.eu_ai_act_risk_level,
        trace_id: session.traceId,
        parent_span_id: session.parentSpanId,
        annotation_ref: session.annotationRef,
      })
      .catch((err) =>
        console.error('[AL Proxy] ToolCallEvent write failed:', err),
      );
  }

  // ── Session init ─────────────────────────────────────────────────────────

  async initSession(authHeader?: string, traceparent?: string): Promise<void> {
    const rawToken = extractBearerToken(authHeader ?? process.env.AL_AGENT_TOKEN);
    if (!rawToken) {
      throw new Error('No Bearer token. Agent must supply OAuth 2.1 credentials.');
    }

    const tokenData = await validateToken(rawToken, traceparent);

    const agentRecord = await this.alClient.resolveAgent(tokenData.client_id);
    if (!agentRecord) {
      throw new Error(
        `Unregistered agent: no AgentRecord for client_id '${tokenData.client_id}'. ` +
        `Register via POST /api/acm/agents first.`,
      );
    }

    const sessionId = randomUUID();

    const annotation = await this.alClient.createTrustAnnotation({
      agent_id: agentRecord.agent_id,
      session_id: sessionId,
      tenant_id: agentRecord.tenant_id,
      trust_level: 'trusted',
      sources_in_context: [],
      session_trust_persistent: true,
      triggered_human_review: false,
    });

    this.session = {
      sessionId,
      agentRecord,
      trustLevel: 'trusted',
      annotationRef: annotation.id,
      traceId: tokenData.trace_id,
      parentSpanId: tokenData.parent_span_id,
    };

    console.log(
      `[AL Proxy] Session started: agent=${agentRecord.display_name} ` +
      `session=${sessionId} trust=trusted`,
    );
  }

  /**
   * Degrade session trust. Call this when an external/unverified source
   * enters the agent's context window (e.g. web search result, user URL).
   * Trust is monotonically decreasing — it cannot recover within a session.
   */
  async degradeTrust(
    newLevel: 'degraded' | 'untrusted',
    trigger: string,
    sources: Array<{ source: string; verified: boolean }>,
  ): Promise<void> {
    const session = this.session;
    if (!session) throw new Error('No active session');

    const order: Record<TrustLevel, number> = { trusted: 2, degraded: 1, untrusted: 0 };
    if (order[session.trustLevel] <= order[newLevel]) return; // already at or below

    const annotation = await this.alClient.degradeTrust(
      session.agentRecord.agent_id,
      session.sessionId,
      session.agentRecord.tenant_id,
      newLevel,
      trigger,
      sources,
      session.annotationRef,
    );

    const prev = session.trustLevel;
    session.trustLevel = newLevel;
    session.annotationRef = annotation.id;

    console.log(
      `[AL Proxy] Trust degraded: session=${session.sessionId} ` +
      `${prev}→${newLevel} trigger=${trigger}`,
    );
  }

  // ── Start / stop ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Connect to upstream first — fail fast if misconfigured
    await this.upstream.connect();

    // Validate agent token + create session
    await this.initSession();

    // Wire up graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[AL Proxy] Received ${signal}, shutting down…`);
      await this.upstream.disconnect();
      process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Start accepting MCP connections over stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[AL Proxy] Ready. Forwarding tool calls to upstream MCP server.');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private ensureSession(): void {
    if (!this.session) throw new Error('Session not initialised.');
  }

  /**
   * Infer whether a tool call constitutes a "decision" that may require
   * human oversight. Matches write/mutate/send/approve operation names.
   * Phase 2: make this configurable per-tool via AgentRecord metadata.
   */
  private inferDecisionMade(toolName: string): boolean {
    const decisionKeywords = [
      'send', 'create', 'update', 'delete', 'approve',
      'reject', 'submit', 'write', 'post', 'publish',
    ];
    return decisionKeywords.some((kw) => toolName.toLowerCase().includes(kw));
  }

  /** Extract data subject identifiers from tool args (field names, not values). */
  private extractDataSubjects(args: Record<string, unknown>): string[] {
    const subjectFields = ['user_id', 'userId', 'subject_id', 'email', 'person_id', 'candidate_id'];
    return subjectFields
      .filter((f) => typeof args[f] === 'string')
      .map((f) => `${f}:${args[f]}`);
  }

  /** Record output field names, not values (data minimisation). */
  private extractOutputFields(result: CallToolResult): string[] {
    return (result.content ?? []).map((c) => c.type);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const proxy = new AccountabilityLedgerProxy();
proxy.start().catch((err) => {
  console.error('[AL Proxy] Fatal error during startup:', err);
  process.exit(1);
});
