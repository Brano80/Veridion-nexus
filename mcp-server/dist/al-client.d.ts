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
import type { AgentRecord, ToolCallEventInput, ContextTrustAnnotationInput, TrustLevel, CreatedRecord } from './types/acm.js';
export declare class AlClient {
    private readonly baseUrl;
    private readonly serviceToken;
    constructor();
    private request;
    /**
     * Resolve an AgentRecord by OAuth client_id.
     * This is the proxy's hot path — called on every new session.
     * Returns null if no agent is registered with this client_id.
     */
    resolveAgent(oauthClientId: string): Promise<AgentRecord | null>;
    /**
     * Record a tool call event. Called after every tool invocation.
     * The Rust API computes the hash-chain values (event_hash, prev_event_hash).
     * Returns the created record's event_id and created_at.
     */
    recordToolCallEvent(event: ToolCallEventInput): Promise<CreatedRecord>;
    /**
     * Create an initial trust annotation for a new session.
     * Call this once when the proxy establishes a new MCP session.
     */
    createTrustAnnotation(annotation: ContextTrustAnnotationInput): Promise<CreatedRecord>;
    /**
     * Degrade the trust level for a session.
     * Appends a new annotation row — does NOT update the existing one.
     * The Rust API enforces the monotonic degradation invariant:
     *   trusted → degraded → untrusted (no recovery within session).
     */
    degradeTrust(agentId: string, sessionId: string, tenantId: string, newLevel: 'degraded' | 'untrusted', trigger: string, sources: Array<{
        source: string;
        verified: boolean;
    }>, currentAnnotationRef: string): Promise<CreatedRecord>;
    /**
     * Get the current (lowest) trust level for a session.
     * Returns 'trusted' if no annotation exists yet.
     */
    getSessionTrustLevel(sessionId: string): Promise<TrustLevel>;
}
