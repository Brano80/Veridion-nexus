/**
 * AL API client — posts ACM compliance records to the Rust backend.
 *
 * Phase 2: DataTransferRecord + HumanOversightRecord methods.
 */

import type {
  AgentRecord,
  ToolCallEventInput,
  ContextTrustAnnotationInput,
  DataTransferRecordInput,
  HumanOversightRecordInput,
  TrustLevel,
  CreatedRecord,
  AlApiResponse,
} from './types/acm.js';

export class AlClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string;

  constructor() {
    this.baseUrl = process.env.AL_API_BASE_URL ?? 'http://localhost:8080';
    this.serviceToken = process.env.AL_SERVICE_TOKEN ?? '';
    if (!this.serviceToken) {
      console.warn('[AlClient] AL_SERVICE_TOKEN not set — API calls will fail in production');
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
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

    return res.json() as Promise<T>;
  }

  async resolveAgent(oauthClientId: string): Promise<AgentRecord | null> {
    try {
      const res = await this.request<AlApiResponse<AgentRecord>>(
        'GET',
        `/api/acm/agents?oauth_client_id=${encodeURIComponent(oauthClientId)}`,
      );
      return res.data;
    } catch (err) {
      if ((err as Error).message.includes('404')) return null;
      throw err;
    }
  }

  async recordToolCallEvent(event: ToolCallEventInput): Promise<CreatedRecord> {
    const res = await this.request<AlApiResponse<CreatedRecord>>(
      'POST',
      '/api/acm/events',
      event,
    );
    return res.data;
  }

  async createTrustAnnotation(
    annotation: ContextTrustAnnotationInput,
  ): Promise<CreatedRecord> {
    const res = await this.request<AlApiResponse<CreatedRecord>>(
      'POST',
      '/api/acm/trust-annotations',
      annotation,
    );
    return res.data;
  }

  async degradeTrust(
    agentId: string,
    sessionId: string,
    tenantId: string,
    newLevel: 'degraded' | 'untrusted',
    trigger: string,
    sources: Array<{ source: string; verified: boolean }>,
    _currentAnnotationRef: string,
  ): Promise<CreatedRecord> {
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

  async getSessionTrustLevel(sessionId: string): Promise<TrustLevel> {
    try {
      const res = await this.request<AlApiResponse<{ trust_level: TrustLevel }>>(
        'GET',
        `/api/acm/trust-annotations/session/${encodeURIComponent(sessionId)}/current`,
      );
      return res.data.trust_level;
    } catch {
      return 'trusted';
    }
  }

  async createDataTransferRecord(record: DataTransferRecordInput): Promise<CreatedRecord> {
    const res = await this.request<AlApiResponse<CreatedRecord>>(
      'POST',
      '/api/acm/transfers',
      record,
    );
    return res.data;
  }

  async createOversightRecord(record: HumanOversightRecordInput): Promise<CreatedRecord> {
    const res = await this.request<AlApiResponse<CreatedRecord>>(
      'POST',
      '/api/acm/oversight',
      record,
    );
    return res.data;
  }

  async updateOversightOutcome(
    oversightId: string,
    outcome: 'approved' | 'rejected' | 'escalated',
    reviewerId?: string,
    notes?: string,
    euAiActCompliance?: boolean,
  ): Promise<void> {
    await this.request<unknown>(
      'PATCH',
      `/api/acm/oversight/${encodeURIComponent(oversightId)}`,
      {
        reviewer_outcome: outcome,
        reviewer_id: reviewerId,
        notes,
        eu_ai_act_compliance: euAiActCompliance,
      },
    );
  }
}
