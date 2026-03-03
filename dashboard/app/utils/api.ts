// Use relative URL so Next.js rewrites proxy to backend (avoids CORS)
const API_BASE = '';

export interface EvidenceEvent {
  id: string;
  eventId: string;
  correlationId?: string;
  occurredAt: string;
  recordedAt: string;
  eventType: string;
  severity: string;
  sourceSystem: string;
  sourceIp?: string;
  regulatoryTags: string[];
  articles: string[];
  payload: any;
  payloadHash: string;
  previousHash: string;
  nexusSeal?: string;
  regulatoryFramework?: string;
  verificationStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SCCRegistry {
  id: string;
  partnerName: string;
  destinationCountry: string;
  status: 'Valid' | 'Expired';
  expiryDate?: string;
  createdAt: string;
  tiaCompleted?: boolean;
  sccModule?: string;
  dpaId?: string;
}

export interface ReviewQueueItem {
  id: string;
  created: string;
  agentId: string;
  action: string;
  module: string;
  suggestedDecision: string;
  context: any;
  status: string;
  evidenceId: string;
  sealId?: string; // Used for approve/reject
  decidedBy?: string;
  decisionReason?: string;
  finalDecision?: string;
  decidedAt?: string;
  expiresAt?: string;
}

export async function fetchEvidenceEvents(): Promise<EvidenceEvent[]> {
  const res = await fetch(`${API_BASE}/api/v1/evidence/events`);
  if (!res.ok) throw new Error('Failed to fetch evidence events');
  const data = await res.json();
  const rawEvents = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];
  return rawEvents.map((e: any) => ({
    ...e,
    sourceSystem: e.source_system || e.sourceSystem || '',
  }));
}

/** Fetch evidence events with pagination for Transfer Log */
export async function fetchEvidenceEventsPaginated(
  page: number = 1,
  limit: number = 50,
  eventType?: string,
  sourceSystem?: string
): Promise<{
  events: EvidenceEvent[];
  total: number;
}> {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(limit));
  searchParams.set('offset', String((page - 1) * limit));
  if (eventType) {
    searchParams.set('event_type', eventType);
  }
  if (sourceSystem) {
    searchParams.set('source_system', sourceSystem);
  }
  const url = `${API_BASE}/api/v1/evidence/events?${searchParams.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch evidence events');
  const data = await res.json();
  const rawEvents = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];
  const events = rawEvents.map((e: any) => ({
    ...e,
    sourceSystem: e.source_system || e.sourceSystem || '',
  }));
  return {
    events,
    total: data.totalCount ?? events.length,
  };
}

/** Fetch evidence events with metadata (merkleRoots, totalCount) for Evidence Vault */
export async function fetchEvidenceEventsWithMeta(params?: {
  eventType?: string;
  limit?: number;
}): Promise<{
  events: EvidenceEvent[];
  totalCount: number;
  merkleRoots: number;
}> {
  const searchParams = new URLSearchParams();
  if (params?.eventType) searchParams.set('event_type', params.eventType);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const url = `${API_BASE}/api/v1/evidence/events${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch evidence events');
  const data = await res.json();
  const rawEvents = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];
  const events = rawEvents.map((e: any) => ({
    ...e,
    sourceSystem: e.source_system || e.sourceSystem || '',
  }));
  return {
    events,
    totalCount: data.totalCount ?? events.length,
    merkleRoots: data.merkleRoots ?? 0,
  };
}

/** Execute GDPR Art. 17 erasure (Crypto Shredder). Links to transfer via requestId = transfer event id. */
export async function executeErasure(data: {
  requestId: string;
  userId: string;
  grounds: string;
  confirmation: string;
}): Promise<{
  success: boolean;
  requestId: string;
  userId: string;
  executedAt: string;
  executedBy: string;
  grounds: string;
  shreddedItems: Array<{ source?: string; records?: number; size_mb?: number; method?: string; status?: string }>;
  summary: { totalRecords: number; totalSizeMb: number; cryptoLogId: string; evidenceSealed: boolean; integrityLevel: string };
  certificate: { id: string; issuedAt: string; issuedBy: string; compliance: string; verification: string };
}> {
  const res = await fetch(`${API_BASE}/api/v1/lenses/gdpr-rights/erasure/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Failed to execute erasure';
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

export async function fetchSCCRegistries(): Promise<SCCRegistry[]> {
  const res = await fetch(`${API_BASE}/api/v1/scc-registries`);
  if (!res.ok) throw new Error('Failed to fetch SCC registries');
  const data = await res.json();
  console.log('fetchSCCRegistries raw response:', JSON.stringify(data, null, 2));
  
  // Backend returns { registries: [...], total: ... }
  const raw = Array.isArray(data.registries) ? data.registries : Array.isArray(data) ? data : [];
  const registries = raw.filter((r: any) => (r.status || '').toLowerCase() === 'active');

  // Convert backend format to frontend format
  return registries.map((r: any) => ({
    id: r.id,
    partnerName: r.partnerName || r.partner_name,
    destinationCountry: r.destinationCountryCode || r.destination_country_code || r.destinationCountry,
    status: r.status === 'active' ? 'Valid' : 'Expired',
    expiryDate: r.expiresAt || r.expires_at,
    createdAt: r.createdAt || r.created_at,
    tiaCompleted: r.tiaCompleted ?? r.tia_completed ?? false,
    sccModule: r.sccModule ?? r.scc_module,
    dpaId: r.dpaId ?? r.dpa_id,
  }));
}

export async function patchSCCRegistry(id: string, data: { tiaCompleted: boolean }): Promise<{ success: boolean; id: string; tiaCompleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/scc-registries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Failed to update SCC registry';
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

/** Revoke (delete) SCC registry. DELETE /api/v1/scc-registries/{id} */
export async function revokeSCCRegistry(id: string): Promise<{ success: boolean; id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/scc-registries/${id}`, { method: 'DELETE' });
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Failed to revoke SCC';
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

export async function createSCCRegistry(data: {
  partnerName: string;
  destinationCountryCode?: string; // New: accept code directly
  destinationCountry?: string; // Legacy: for backward compatibility
  expiryDate?: string;
  tiaCompleted?: boolean;
  dpaId?: string;
  sccModule?: string;
}): Promise<SCCRegistry> {
  // Use destinationCountryCode if provided (preferred), otherwise try to convert destinationCountry
  let destinationCountryCode: string;
  
  if (data.destinationCountryCode) {
    // Already a code, just uppercase it
    destinationCountryCode = data.destinationCountryCode.toUpperCase();
  } else if (data.destinationCountry) {
    // Legacy: try to convert country name to code
    const countryCodeMap: Record<string, string> = {
      'United States': 'US',
      'India': 'IN',
      'Brazil': 'BR',
      'Mexico': 'MX',
      'Singapore': 'SG',
      'South Korea': 'KR',
      'Republic of Korea': 'KR',
      'South Africa': 'ZA',
    };
    
    destinationCountryCode = countryCodeMap[data.destinationCountry] || 
      (data.destinationCountry.length === 2 ? data.destinationCountry.toUpperCase() : 
      data.destinationCountry);
  } else {
    throw new Error('Either destinationCountryCode or destinationCountry must be provided');
  }

  // Convert date to RFC3339 format if provided
  // Handle both "YYYY-MM-DD" format and full ISO strings
  let expiresAt: string | undefined;
  if (data.expiryDate) {
    const dateStr = data.expiryDate.trim();
    // If it's just a date (YYYY-MM-DD), append time to make it RFC3339
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      expiresAt = `${dateStr}T00:00:00Z`;
    } else {
      // Otherwise, parse and convert to ISO
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateStr}`);
      }
      expiresAt = date.toISOString();
    }
  }

  // Backend expects camelCase (SccRegistryRequest has #[serde(rename_all = "camelCase")])
  const requestBody = {
    partnerName: data.partnerName,
    destinationCountryCode,
    expiresAt: expiresAt || null,
    notes: null,
    tiaCompleted: data.tiaCompleted ?? false,
    dpaId: data.dpaId || null,
    sccModule: data.sccModule || null,
  };

  console.log('SCC Registry API Request:', JSON.stringify(requestBody, null, 2));

  const res = await fetch(`${API_BASE}/api/v1/scc-registries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  
  console.log('SCC Registry API Response Status:', res.status, res.statusText);
  
  // Read response body once as text
  const responseText = await res.text();
  
  if (!res.ok) {
    let errorMessage = 'Unknown error';
    try {
      const errorJson = JSON.parse(responseText);
      errorMessage = errorJson.message || errorJson.error || responseText;
      console.error('SCC Registry API Error Response:', errorJson);
    } catch {
      errorMessage = responseText || `Failed to create SCC registry: ${res.status}`;
      console.error('SCC Registry API Error (non-JSON):', responseText);
    }
    throw new Error(errorMessage);
  }
  
  // Parse successful response
  const response = JSON.parse(responseText);
  console.log('SCC Registry API Success Response:', response);
  
  // Convert backend response to frontend format
  return {
    id: response.id,
    partnerName: response.partnerName || response.partner_name,
    destinationCountry: response.destinationCountryCode || response.destination_country_code,
    status: response.status === 'active' ? 'Valid' : 'Expired',
    expiryDate: response.expiresAt || response.expires_at,
    createdAt: response.createdAt || response.created_at,
    tiaCompleted: response.tiaCompleted ?? response.tia_completed ?? false,
    sccModule: response.sccModule ?? response.scc_module,
    dpaId: response.dpaId ?? response.dpa_id,
  };
}

export async function fetchReviewQueuePending(): Promise<ReviewQueueItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/human_oversight/pending`);
  if (!res.ok) throw new Error('Failed to fetch review queue');
  const data = await res.json();
  return data.reviews || [];
}

/** Evidence event IDs that already have a decision (rejected/approved). Exclude these from REQUIRES ATTENTION. */
export async function fetchDecidedEvidenceIds(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/human_oversight/decided-evidence-ids`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.evidenceEventIds) ? data.evidenceEventIds : [];
  } catch {
    return [];
  }
}

export async function fetchReviewQueueItem(id: string): Promise<ReviewQueueItem | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/review-queue`);
    if (!res.ok) throw new Error('Failed to fetch review queue');
    const data = await res.json();
    const items = data.reviews || [];
    return items.find((item: ReviewQueueItem) => item.id === id || item.sealId === id || item.evidenceId === id) || null;
  } catch (error) {
    console.error('Failed to fetch review item:', error);
    return null;
  }
}

export async function createReviewQueueItem(data: {
  action: string;
  context: any;
  evidenceEventId: string;
  agentId?: string;
  module?: string;
}): Promise<{ sealId: string }> {
  const res = await fetch(`${API_BASE}/api/v1/review-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: data.agentId || 'sovereign-shield',
      action: data.action,
      module: data.module || 'sovereign-shield',
      context: data.context,
      evidenceEventId: data.evidenceEventId,
    }),
  });
  
  // Read response body once as text
  const responseText = await res.text();
  
  if (!res.ok) {
    let errorMessage = 'Failed to create review item';
    try {
      const errorJson = JSON.parse(responseText);
      errorMessage = errorJson.message || errorJson.error || responseText;
    } catch {
      errorMessage = responseText || 'Failed to create review item';
    }
    throw new Error(errorMessage);
  }
  
  return JSON.parse(responseText);
}

export async function approveReviewQueueItem(sealId: string, reason?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/action/${sealId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'APPROVE',
      reason: reason || 'Approved via dashboard',
      reviewerId: 'dashboard-user',
    }),
  });
  
  // Read response body once as text
  const responseText = await res.text();
  
  if (!res.ok) {
    let errorMessage = 'Failed to approve review item';
    try {
      const errorJson = JSON.parse(responseText);
      errorMessage = errorJson.message || errorJson.error || responseText;
    } catch {
      errorMessage = responseText || 'Failed to approve review item';
    }
    throw new Error(errorMessage);
  }
}

export async function rejectReviewQueueItem(sealId: string, reason?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/action/${sealId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'REJECT',
      reason: reason || 'Rejected via dashboard',
      reviewerId: 'dashboard-user',
    }),
  });
  
  // Read response body once as text
  const responseText = await res.text();
  
  if (!res.ok) {
    let errorMessage = 'Failed to reject review item';
    try {
      const errorJson = JSON.parse(responseText);
      errorMessage = errorJson.message || errorJson.error || responseText;
    } catch {
      errorMessage = responseText || 'Failed to reject review item';
    }
    throw new Error(errorMessage);
  }
}

/** Shield evaluate: POST /api/v1/shield/evaluate — expects camelCase (EvaluateRequest has #[serde(rename_all = "camelCase")]) */
export async function evaluateTransfer(data: {
  destinationCountryCode?: string;
  destinationCountry?: string;
  dataCategories?: string[];
  partnerName?: string;
  sourceIp?: string;
  destIp?: string;
  dataSize?: number;
  protocol?: string;
  userAgent?: string;
  requestPath?: string;
}): Promise<{
  decision: string;
  reason: string;
  severity: string;
  articles: string[];
  country_status: string;
  evidence_id?: string;
  review_id?: string;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/api/v1/shield/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinationCountryCode: data.destinationCountryCode,
      destinationCountry: data.destinationCountry,
      dataCategories: data.dataCategories,
      partnerName: data.partnerName,
      sourceIp: data.sourceIp,
      destIp: data.destIp,
      dataSize: data.dataSize,
      protocol: data.protocol,
      userAgent: data.userAgent,
      requestPath: data.requestPath,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = 'Failed to evaluate transfer';
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return JSON.parse(text);
}

export async function verifyIntegrity(): Promise<{ status: 'VALID' | 'TAMPERED'; verified?: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/evidence/verify-integrity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_system: 'sovereign-shield' }),
  });
  
  const responseText = await res.text();
  
  if (!res.ok) {
    let errorMessage = 'Failed to verify integrity';
    try {
      const errorJson = JSON.parse(responseText);
      errorMessage = errorJson.message || errorJson.error || responseText;
    } catch {
      errorMessage = responseText || 'Failed to verify integrity';
    }
    throw new Error(errorMessage);
  }
  
  const data = JSON.parse(responseText);
  return {
    status: data.verified === true ? 'VALID' : 'TAMPERED',
    verified: data.verified,
  };
}
