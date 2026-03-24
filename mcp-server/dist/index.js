/**
 * Accountability Ledger — MCP Proxy
 * Phase 1 skeleton: intercepts MCP tool calls, records ACM ToolCallEvents.
 *
 * Architecture (from ADR 001):
 *   AI Agent → [this proxy] → Upstream MCP Server
 *                    ↓
 *             Rust API (ACM records)
 *
 * The proxy:
 *   1. Validates the OAuth 2.1 Bearer token on session init → resolves agent_id
 *   2. Creates a ContextTrustAnnotation for the session (trusted by default)
 *   3. For each tool call:
 *      a. Checks tools_permitted list from AgentRecord
 *      b. Forwards to upstream MCP server
 *      c. Records a ToolCallEvent (async, does not block the response)
 *   4. On session end: finalises the annotation
 *
 * Environment variables (see .env.example):
 *   AL_API_BASE_URL        - Rust API base URL (default: http://localhost:8080)
 *   AL_SERVICE_TOKEN       - Internal service JWT for proxy→API auth
 *   AL_OAUTH_ISSUER        - OAuth 2.1 issuer URL
 *   AL_OAUTH_AUDIENCE      - Expected audience claim (default: veridion-nexus-al)
 *   AL_JWKS_URI            - JWKS endpoint (default: {issuer}/.well-known/jwks.json)
 *   AL_AUTH_MODE           - 'jwks' (default) or 'dev_bypass' (never in production)
 *   AL_DEV_CLIENT_ID       - Required when AL_AUTH_MODE=dev_bypass
 *   UPSTREAM_MCP_COMMAND   - Command to launch upstream MCP server (stdio mode)
 *                            e.g. 'node /path/to/upstream/dist/index.js'
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { AlClient } from './al-client.js';
import { validateToken, extractBearerToken } from './oauth.js';
// ── Proxy class ───────────────────────────────────────────────────────────────
class AccountabilityLedgerProxy {
    server;
    alClient;
    session = null;
    // TODO Phase 1: Replace with real upstream MCP client
    // The upstream client will be an MCP Client instance connected to the real MCP server.
    // For the Phase 0 skeleton, upstream is stubbed — add real upstream connection here.
    upstreamTools = [];
    constructor() {
        this.alClient = new AlClient();
        this.server = new Server({
            name: 'accountability-ledger-proxy',
            version: '0.1.0',
        }, {
            capabilities: { tools: {} },
        });
        this.registerHandlers();
    }
    // ── Handler registration ────────────────────────────────────────────────────
    registerHandlers() {
        // List tools: proxy the upstream tool list
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            this.ensureSession();
            // TODO Phase 1: fetch tool list from upstream MCP server
            // return await this.upstreamClient.listTools();
            return { tools: this.upstreamTools };
        });
        // Call tool: the core interception point
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            this.ensureSession();
            return await this.handleToolCall(request.params.name, request.params.arguments ?? {});
        });
    }
    // ── Tool call interception ──────────────────────────────────────────────────
    async handleToolCall(toolName, args) {
        const session = this.session;
        const calledAt = new Date().toISOString();
        // 1. Check tools_permitted allowlist
        if (session.agentRecord.tools_permitted.length > 0 &&
            !session.agentRecord.tools_permitted.includes(toolName)) {
            // Record the blocked attempt as a ToolCallEvent
            this.recordEventAsync({
                toolName,
                args,
                result: null,
                calledAt,
                decisionMade: false,
                humanReviewRequired: false,
                outcomeNotes: `Tool blocked: not in tools_permitted list`,
                blocked: true,
            });
            return {
                content: [{ type: 'text', text: `Tool '${toolName}' is not permitted for this agent.` }],
                isError: true,
            };
        }
        // 2. Forward to upstream MCP server
        // TODO Phase 1: replace stub with real upstream call
        // const upstreamResult = await this.upstreamClient.callTool(toolName, args);
        const upstreamResult = {
            content: [{ type: 'text', text: `[STUB] Upstream response for ${toolName}` }],
        };
        // 3. Determine if human review is required
        //    Rule: degraded/untrusted context + high-risk agent + decision made → require review
        const decisionMade = this.inferDecisionMade(toolName, upstreamResult);
        const humanReviewRequired = session.trustLevel !== 'trusted' &&
            session.agentRecord.eu_ai_act_risk_level === 'high' &&
            decisionMade;
        // 4. Record ToolCallEvent (async — does not block response to agent)
        this.recordEventAsync({
            toolName,
            args,
            result: upstreamResult,
            calledAt,
            decisionMade,
            humanReviewRequired,
            blocked: false,
        });
        return upstreamResult;
    }
    // ── Async event recording (non-blocking) ──────────────────────────────────
    recordEventAsync(params) {
        const session = this.session;
        // Fire-and-forget — compliance record must not delay the agent response
        // Errors are logged but not propagated to the agent
        this.alClient
            .recordToolCallEvent({
            agent_id: session.agentRecord.agent_id,
            session_id: session.sessionId,
            tenant_id: session.agentRecord.tenant_id,
            tool_id: params.toolName,
            called_at: params.calledAt,
            // Data minimisation: record field names only, not values
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
            .catch((err) => {
            // Logging only — the agent's response is not affected
            console.error('[AL Proxy] Failed to record ToolCallEvent:', err);
        });
    }
    // ── Session initialisation ─────────────────────────────────────────────────
    /**
     * Initialise the session: validate OAuth token, resolve AgentRecord,
     * create ContextTrustAnnotation. Call this before starting the transport.
     *
     * In MCP over stdio, the Bearer token comes from an environment variable
     * (AL_AGENT_TOKEN) passed by the agent launcher.
     * In MCP over HTTP (future), it comes from the Authorization header.
     */
    async initSession(authHeader, traceparent) {
        const rawToken = extractBearerToken(authHeader ?? process.env.AL_AGENT_TOKEN);
        if (!rawToken) {
            throw new Error('No Bearer token provided. Agent must supply OAuth 2.1 credentials.');
        }
        // Validate token → get client_id
        const tokenData = await validateToken(rawToken, traceparent);
        // Resolve AgentRecord
        const agentRecord = await this.alClient.resolveAgent(tokenData.client_id);
        if (!agentRecord) {
            throw new Error(`Unregistered agent: no AgentRecord found for client_id '${tokenData.client_id}'. ` +
                `Register the agent at POST /api/acm/agents before connecting.`);
        }
        const sessionId = randomUUID();
        // Create initial ContextTrustAnnotation (trusted by default)
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
        console.log(`[AL Proxy] Session started: agent=${agentRecord.display_name} ` +
            `session=${sessionId} trust=trusted`);
    }
    /**
     * Downgrade the session trust level. Call this when the proxy detects
     * an external/unverified source entering the agent's context window.
     */
    async degradeTrust(newLevel, trigger, sources) {
        const session = this.session;
        if (!session)
            throw new Error('No active session');
        // Trust can only go down — ignore if already at or below the requested level
        const levelOrder = { trusted: 2, degraded: 1, untrusted: 0 };
        if (levelOrder[session.trustLevel] <= levelOrder[newLevel])
            return;
        const annotation = await this.alClient.degradeTrust(session.agentRecord.agent_id, session.sessionId, session.agentRecord.tenant_id, newLevel, trigger, sources, session.annotationRef);
        session.trustLevel = newLevel;
        session.annotationRef = annotation.id;
        console.log(`[AL Proxy] Trust degraded: session=${session.sessionId} ` +
            `${session.trustLevel}→${newLevel} trigger=${trigger}`);
    }
    // ── Helpers ────────────────────────────────────────────────────────────────
    ensureSession() {
        if (!this.session) {
            throw new Error('Session not initialised. Call initSession() first.');
        }
    }
    /**
     * Infer whether the tool call constitutes a "decision".
     * A decision is any tool call that produces an output that is acted upon
     * without human confirmation. Heuristic: write/mutate/send/approve operations.
     *
     * TODO Phase 2: Make this configurable per-tool via AgentRecord.tools_permitted metadata
     */
    inferDecisionMade(toolName, _result) {
        const decisionKeywords = ['send', 'create', 'update', 'delete', 'approve', 'reject', 'submit'];
        return decisionKeywords.some((kw) => toolName.toLowerCase().includes(kw));
    }
    /**
     * Extract data subject identifiers from tool arguments.
     * Looks for common identifier field names.
     *
     * TODO Phase 2: Make this configurable via AgentRecord classification metadata
     */
    extractDataSubjects(args) {
        const subjectFields = ['user_id', 'userId', 'subject_id', 'email', 'person_id', 'candidate_id'];
        const subjects = [];
        for (const field of subjectFields) {
            const val = args[field];
            if (typeof val === 'string')
                subjects.push(`${field}:${val}`);
        }
        return subjects;
    }
    /**
     * Extract field names from tool result (not values — data minimisation).
     */
    extractOutputFields(result) {
        // For text results, we record that text was returned but not the content
        // For structured results, record the top-level keys
        if (!result.content)
            return [];
        return result.content.map((c) => c.type);
    }
    // ── Start ──────────────────────────────────────────────────────────────────
    async start() {
        // Initialise session from environment (stdio mode)
        await this.initSession();
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('[AL Proxy] Proxy running on stdio. Waiting for tool calls.');
    }
}
// ── Entry point ───────────────────────────────────────────────────────────────
const proxy = new AccountabilityLedgerProxy();
proxy.start().catch((err) => {
    console.error('[AL Proxy] Fatal error:', err);
    process.exit(1);
});
