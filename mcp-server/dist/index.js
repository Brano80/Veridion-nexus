/**
 * Accountability Ledger — MCP Proxy
 * Phase 2: DataTransferRecord + HumanOversightRecord + trust wiring.
 *
 * Architecture (ADR 001):
 *   AI Agent → [this proxy] → Upstream MCP Server
 *                    ↓
 *             Rust API (/api/acm/*)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { AlClient } from './al-client.js';
import { UpstreamMcpClient } from './upstream-client.js';
import { validateToken, extractBearerToken } from './oauth.js';
const EEA_COUNTRIES = new Set([
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
    'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
    'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
    'NO', 'IS', 'LI',
    'GB',
]);
const extraEea = process.env.AL_EEA_EXTRA_COUNTRIES;
if (extraEea) {
    for (const cc of extraEea.split(',').map((s) => s.trim().toUpperCase())) {
        if (cc)
            EEA_COUNTRIES.add(cc);
    }
}
function isEeaCountry(countryCode) {
    return EEA_COUNTRIES.has(countryCode.toUpperCase());
}
class AccountabilityLedgerProxy {
    server;
    alClient;
    upstream;
    session = null;
    constructor() {
        this.alClient = new AlClient();
        this.upstream = new UpstreamMcpClient();
        this.server = new Server({ name: 'accountability-ledger-proxy', version: '0.2.0' }, { capabilities: { tools: {} } });
        this.registerHandlers();
    }
    registerHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            this.ensureSession();
            const tools = this.upstream.listTools();
            return { tools };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            this.ensureSession();
            return this.handleToolCall(request.params.name, (request.params.arguments ?? {}));
        });
    }
    async handleToolCall(toolName, args) {
        const session = this.session;
        const calledAt = new Date().toISOString();
        if (session.agentRecord.tools_permitted.length > 0 &&
            !session.agentRecord.tools_permitted.includes(toolName)) {
            this.recordEventAndWireAsync({
                toolName, args, result: null, calledAt,
                decisionMade: false, humanReviewRequired: false,
                outcomeNotes: `Blocked: '${toolName}' not in tools_permitted`,
            });
            return {
                content: [{ type: 'text', text: `Tool '${toolName}' is not permitted for this agent.` }],
                isError: true,
            };
        }
        if (!this.upstream.isConnected()) {
            this.recordEventAndWireAsync({
                toolName, args, result: null, calledAt,
                decisionMade: false, humanReviewRequired: false,
                outcomeNotes: 'Blocked: upstream MCP server not connected',
            });
            return {
                content: [{ type: 'text', text: 'Upstream MCP server is temporarily unavailable.' }],
                isError: true,
            };
        }
        let result;
        let upstreamError;
        try {
            result = await this.upstream.callTool(toolName, args);
        }
        catch (err) {
            upstreamError = err.message;
            result = {
                content: [{ type: 'text', text: `Upstream error: ${upstreamError}` }],
                isError: true,
            };
        }
        const decisionMade = this.inferDecisionMade(toolName);
        const humanReviewRequired = session.trustLevel !== 'trusted' &&
            session.agentRecord.eu_ai_act_risk_level === 'high' &&
            decisionMade;
        this.recordEventAndWireAsync({
            toolName, args, result, calledAt,
            decisionMade, humanReviewRequired,
            outcomeNotes: upstreamError,
        });
        return result;
    }
    recordEventAndWireAsync(params) {
        const session = this.session;
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
            .then(async (eventRecord) => {
            const eventId = eventRecord.id;
            await this.maybeRecordDataTransfers(eventId, params.toolName, params.args);
            if (params.humanReviewRequired) {
                await this.createOversightAndUpdateSession(eventId);
            }
        })
            .catch((err) => console.error('[AL Proxy] ToolCallEvent or post-event wiring failed:', err));
    }
    async maybeRecordDataTransfers(eventId, toolName, args) {
        const session = this.session;
        const policies = session.agentRecord.transfer_policies ?? [];
        if (!Array.isArray(policies) || policies.length === 0)
            return;
        if (!this.toolInvolvesPii(toolName, args))
            return;
        const originCountry = (process.env.AL_ORIGIN_COUNTRY ?? 'DE').toUpperCase();
        for (const policy of policies) {
            const rawDest = policy['destination_country'] ?? policy['destination'];
            const dest = typeof rawDest === 'string' ? rawDest.toUpperCase() : '';
            if (!dest)
                continue;
            if (isEeaCountry(dest))
                continue;
            const mechRaw = policy['transfer_mechanism'] ?? policy['mechanism'];
            const transferMechanism = typeof mechRaw === 'string' && mechRaw.length > 0 ? mechRaw : 'scc';
            const dc = policy['data_categories'];
            const dataCategories = Array.isArray(dc)
                ? dc.filter((x) => typeof x === 'string')
                : undefined;
            await this.alClient
                .createDataTransferRecord({
                agent_id: session.agentRecord.agent_id,
                event_ref: eventId,
                tenant_id: session.agentRecord.tenant_id,
                origin_country: originCountry,
                destination_country: dest,
                transfer_mechanism: transferMechanism,
                data_categories: dataCategories,
                dpf_relied_upon: policy['dpf_relied_upon'] ?? false,
                scc_ref: policy['scc_ref'],
                bcr_ref: policy['bcr_ref'],
                derogation_basis: policy['derogation_basis'],
                backup_mechanism: policy['backup_mechanism'],
            })
                .catch((err) => console.error(`[AL Proxy] DataTransferRecord failed (dest=${dest}):`, err));
        }
    }
    toolInvolvesPii(toolName, args) {
        const piiFields = [
            'email', 'name', 'phone', 'address', 'user_id', 'userId',
            'person_id', 'candidate_id', 'subject_id', 'dob', 'ip_address',
            'passport', 'national_id', 'health', 'biometric',
        ];
        const hasArgPii = piiFields.some((f) => f in args);
        const writeOp = ['send', 'create', 'update', 'submit', 'post', 'write']
            .some((kw) => toolName.toLowerCase().includes(kw));
        return hasArgPii || writeOp;
    }
    async createOversightAndUpdateSession(eventId) {
        const session = this.session;
        try {
            const oversight = await this.alClient.createOversightRecord({
                agent_id: session.agentRecord.agent_id,
                event_ref: eventId,
                tenant_id: session.agentRecord.tenant_id,
                review_trigger: 'degraded_context_trust',
                notes: `Auto-triggered: context_trust=${session.trustLevel}, ` +
                    `eu_ai_act_risk_level=${session.agentRecord.eu_ai_act_risk_level}, ` +
                    `annotation_ref=${session.annotationRef}`,
            });
            session.annotationRef = oversight.id;
            console.log(`[AL Proxy] HumanOversightRecord created: id=${oversight.id} ` +
                `event_ref=${eventId} session=${session.sessionId}`);
        }
        catch (err) {
            console.error('[AL Proxy] createOversightRecord failed:', err);
        }
    }
    async initSession(authHeader, traceparent) {
        const rawToken = extractBearerToken(authHeader ?? process.env.AL_AGENT_TOKEN);
        if (!rawToken) {
            throw new Error('No Bearer token. Agent must supply OAuth 2.1 credentials.');
        }
        const tokenData = await validateToken(rawToken, traceparent);
        const agentRecord = await this.alClient.resolveAgent(tokenData.client_id);
        if (!agentRecord) {
            throw new Error(`Unregistered agent: no AgentRecord for client_id '${tokenData.client_id}'. ` +
                `Register via POST /api/acm/agents first.`);
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
        console.log(`[AL Proxy] Session started: agent=${agentRecord.display_name} ` +
            `session=${sessionId} trust=trusted`);
    }
    async degradeTrust(newLevel, trigger, sources) {
        const session = this.session;
        if (!session)
            throw new Error('No active session');
        const order = { trusted: 2, degraded: 1, untrusted: 0 };
        if (order[session.trustLevel] <= order[newLevel])
            return;
        const annotation = await this.alClient.degradeTrust(session.agentRecord.agent_id, session.sessionId, session.agentRecord.tenant_id, newLevel, trigger, sources, session.annotationRef);
        const prev = session.trustLevel;
        session.trustLevel = newLevel;
        session.annotationRef = annotation.id;
        console.log(`[AL Proxy] Trust degraded: session=${session.sessionId} ` +
            `${prev}→${newLevel} trigger=${trigger}`);
    }
    async start() {
        await this.upstream.connect();
        await this.initSession();
        const shutdown = async (signal) => {
            console.log(`[AL Proxy] Received ${signal}, shutting down…`);
            await this.upstream.disconnect();
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('[AL Proxy] Ready (v0.2). Forwarding tool calls to upstream MCP server.');
    }
    ensureSession() {
        if (!this.session)
            throw new Error('Session not initialised.');
    }
    inferDecisionMade(toolName) {
        const decisionKeywords = [
            'send', 'create', 'update', 'delete', 'approve',
            'reject', 'submit', 'write', 'post', 'publish',
        ];
        return decisionKeywords.some((kw) => toolName.toLowerCase().includes(kw));
    }
    extractDataSubjects(args) {
        const subjectFields = [
            'user_id', 'userId', 'subject_id', 'email',
            'person_id', 'candidate_id',
        ];
        return subjectFields
            .filter((f) => typeof args[f] === 'string')
            .map((f) => `${f}:${args[f]}`);
    }
    extractOutputFields(result) {
        return (result.content ?? []).map((c) => c.type);
    }
}
const proxy = new AccountabilityLedgerProxy();
proxy.start().catch((err) => {
    console.error('[AL Proxy] Fatal error during startup:', err);
    process.exit(1);
});
