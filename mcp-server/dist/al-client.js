/**
 * AL API client — posts ACM compliance records to the Rust backend.
 *
 * Phase 2: DataTransferRecord + HumanOversightRecord methods.
 */
export class AlClient {
    baseUrl;
    serviceToken;
    constructor() {
        this.baseUrl = process.env.AL_API_BASE_URL ?? 'http://localhost:8080';
        this.serviceToken = process.env.AL_SERVICE_TOKEN ?? '';
        if (!this.serviceToken) {
            console.warn('[AlClient] AL_SERVICE_TOKEN not set — API calls will fail in production');
        }
    }
    async request(method, path, body) {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.serviceToken}`,
                'X-AL-Proxy': 'true',
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => 'no body');
            throw new Error(`AL API ${method} ${path} → ${res.status}: ${text}`);
        }
        return res.json();
    }
    async resolveAgent(oauthClientId) {
        try {
            const res = await this.request('GET', `/api/acm/agents?oauth_client_id=${encodeURIComponent(oauthClientId)}`);
            return res.data;
        }
        catch (err) {
            if (err.message.includes('404'))
                return null;
            throw err;
        }
    }
    async recordToolCallEvent(event) {
        const res = await this.request('POST', '/api/acm/events', event);
        return res.data;
    }
    async createTrustAnnotation(annotation) {
        const res = await this.request('POST', '/api/acm/trust-annotations', annotation);
        return res.data;
    }
    async degradeTrust(agentId, sessionId, tenantId, newLevel, trigger, sources, _currentAnnotationRef) {
        return this.createTrustAnnotation({
            agent_id: agentId,
            session_id: sessionId,
            tenant_id: tenantId,
            trust_level: newLevel,
            sources_in_context: sources,
            degradation_trigger: trigger,
            session_trust_persistent: true,
            triggered_human_review: false,
        });
    }
    async getSessionTrustLevel(sessionId) {
        try {
            const res = await this.request('GET', `/api/acm/trust-annotations/session/${encodeURIComponent(sessionId)}/current`);
            return res.data.trust_level;
        }
        catch {
            return 'trusted';
        }
    }
    async createDataTransferRecord(record) {
        const res = await this.request('POST', '/api/acm/transfers', record);
        return res.data;
    }
    async createOversightRecord(record) {
        const res = await this.request('POST', '/api/acm/oversight', record);
        return res.data;
    }
    async updateOversightOutcome(oversightId, outcome, reviewerId, notes, euAiActCompliance) {
        await this.request('PATCH', `/api/acm/oversight/${encodeURIComponent(oversightId)}`, {
            reviewer_outcome: outcome,
            reviewer_id: reviewerId,
            notes,
            eu_ai_act_compliance: euAiActCompliance,
        });
    }
}
