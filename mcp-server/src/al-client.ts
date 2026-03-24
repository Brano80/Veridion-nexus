/**
 * AL API client — posts ACM compliance records to the Rust backend.
 *
 * All ACM record writes go through this client. The proxy never writes to
 * the database directly. Auth uses an internal service token (not an agent
 * OAuth token) to call the Rust API.
 *
 * Environment variables:
 *   AL_API_BASE_URL   - e.g. 'http://localhost:8080'
 *   AL_SERVICE_TOKEN  - Internal service JWT for proxy→API auth
 */

import type {
  AgentRecord,
  ToolCallEventInput,
  ContextTrustAnnotationInput,
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
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.serviceToken}`,
        'X-AL-Proxy': 'true',  // Identifies internal proxy requests to the Rust API
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'no body');
      throw new Error(`AL API ${method} ${path} failed: ${res.status} ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ── AgentRecord ────────────────────────────────────────────────────────────

  /**
   * Resolve an AgentRecord by OAuth client_id.
   * This is the proxy's hot path — called on every new session.
   * Returns null if no agent is registered with this client_id.
   */
  async resolveAgent(oauthClientId: string): Promise<AgentRecord | null> {
    try {
      const res = await this.request<AlApiResponse<AgentRecord>>(
        'GET',
        `/api/acm/agents?oauth_client_id=${encodeURIComponent(oauthClientId)}`,
      );
      return res.data;
    } catch (err) {
      // 404 = unregistered agent — proxy should reject the session
      if ((err as Error).message.includes('404')) return null;
      throw err;
    }
  }

  // ── ToolCallEvent ──────────────────────────────────────────────────────────

  /**
   * Record a tool call event. Called after every tool invocation.
   * The Rust API computes the hash-chain values (event_hash, prev_event_hash).
   * Returns the created record's event_id and created_at.
   */
  async recordToolCallEvent(event: ToolCallEventInput): Promise<CreatedRecord> {
    const res = await this.request<AlApiResponse<CreatedRecord>>(
      'POST',
      '/api/acm/events',
      event,
    );
    return res.data;
  }

  // ── ContextTrustAnnotation ─────────────────────────────────────────────────

  /**
   * Create an initial trust annotation for a new session.
   * Call this once when the proxy establishes a new MCP session.
   */
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

  /**
   * Degrade the trust level for a session.
   * Appends a new annotation row — does NOT update the existing one.
   * The Rust API enforces the monotonic degradation invariant:
   *   trusted → degraded → untrusted (no recovery within session).
   */
  async degradeTrust(
    agentId: string,
    sessionId: string,
    tenantId: string,
    newLevel: 'degraded' | 'untrusted',
    trigger: string,
    sources: Array<{ source: string; verified: boolean }>,
    currentAnnotationRef: string,
  ): Promise<CreatedRecord> {
    return this.createTrustAnnotation({
      agent_id: agentId,
      session_id: sessionId,
      tenant_id: tenantId,
      trust_level: newLevel,
      sources_in_context: sources,
      degradation_trigger: trigger,
      session_trust_persistent: true,
      triggered_human_review: false,  // set to true if this triggers review
    });
  }

  /**
   * Get the current (lowest) trust level for a session.
   * Returns 'trusted' if no annotation exists yet.
   */
  async getSessionTrustLevel(sessionId: string): Promise<TrustLevel> {
    try {
      const res = await this.request<AlApiResponse<{ trust_level: TrustLevel }>>(
        'GET',
        `/api/acm/trust-annotations/session/${encodeURIComponent(sessionId)}/current`,
      );
      return res.data.trust_level;
    } catch {
      return 'trusted'; // default — session not yet annotated
    }
  }
}
