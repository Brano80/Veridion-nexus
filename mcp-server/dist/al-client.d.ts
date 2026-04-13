/**
 * AL API client — posts ACM compliance records to the Rust backend.
 *
 * Phase 2: DataTransferRecord + HumanOversightRecord methods.
 */
import type { AgentRecord, ToolCallEventInput, ContextTrustAnnotationInput, DataTransferRecordInput, HumanOversightRecordInput, TrustLevel, CreatedRecord } from './types/acm.js';
export declare class AlClient {
    private readonly baseUrl;
    private readonly serviceToken;
    constructor();
    private request;
    resolveAgent(oauthClientId: string): Promise<AgentRecord | null>;
    recordToolCallEvent(event: ToolCallEventInput): Promise<CreatedRecord>;
    createTrustAnnotation(annotation: ContextTrustAnnotationInput): Promise<CreatedRecord>;
    degradeTrust(agentId: string, sessionId: string, tenantId: string, newLevel: 'degraded' | 'untrusted', trigger: string, sources: Array<{
        source: string;
        verified: boolean;
    }>, _currentAnnotationRef: string): Promise<CreatedRecord>;
    getSessionTrustLevel(sessionId: string): Promise<TrustLevel>;
    createDataTransferRecord(record: DataTransferRecordInput): Promise<CreatedRecord>;
    createOversightRecord(record: HumanOversightRecordInput): Promise<CreatedRecord>;
    updateOversightOutcome(oversightId: string, outcome: 'approved' | 'rejected' | 'escalated', reviewerId?: string, notes?: string, euAiActCompliance?: boolean): Promise<void>;
}
