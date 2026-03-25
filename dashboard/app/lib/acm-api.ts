import { getAuthHeaders } from '@/app/utils/api';

const API_BASE = '';

function checkUnauthorized(res: Response): void {
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      window.location.href = '/login?expired=true';
    }
    throw new Error('Unauthorized - session expired');
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface OversightRecord {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  event_ref: string | null;
  tenant_id: string | null;
  review_trigger: string | null;
  reviewer_outcome: string | null;
  reviewer_id: string | null;
  flagged_at: string | null;
  decided_at: string | null;
  eu_ai_act_compliance: boolean | null;
  comments: string | null;
  created_at: string;
}

export interface TransferRecord {
  transfer_id: string;
  agent_id: string | null;
  agent_name: string | null;
  event_ref: string | null;
  origin_country: string;
  destination_country: string;
  transfer_mechanism: string;
  data_categories: string[] | null;
  dpf_relied_upon: boolean | null;
  schrems_iii_risk: boolean | null;
  scc_ref: string | null;
  bcr_ref: string | null;
  derogation_basis: string | null;
  backup_mechanism: string | null;
  transfer_timestamp: string | null;
  created_at: string;
}

export interface AcmStats {
  oversight_pending: number;
  oversight_decided: number;
  transfers_total: number;
  transfers_schrems_risk: number;
  tool_call_events_total: number;
  trust_degraded_sessions: number;
}

export interface ResolveOversightPayload {
  reviewer_outcome: 'approved' | 'rejected' | 'escalated';
  reviewer_id?: string;
  notes?: string;
  eu_ai_act_compliance?: boolean;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchAcmStats(): Promise<AcmStats> {
  const res = await fetch(`${API_BASE}/api/v1/acm/stats`, { headers: getAuthHeaders() });
  checkUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch ACM stats');
  const json = await res.json();
  return json.data;
}

export async function fetchOversightRecords(
  status: 'all' | 'pending' | 'decided' = 'all',
): Promise<OversightRecord[]> {
  const url = `${API_BASE}/api/v1/acm/oversight?status=${status}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  checkUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch oversight records');
  const json = await res.json();
  return json.data;
}

export async function resolveOversight(
  id: string,
  payload: ResolveOversightPayload,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/acm/oversight/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  checkUnauthorized(res);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to resolve' }));
    throw new Error(err.error || 'Failed to resolve oversight record');
  }
}

export async function fetchTransferRecords(): Promise<TransferRecord[]> {
  const res = await fetch(`${API_BASE}/api/v1/acm/transfers`, { headers: getAuthHeaders() });
  checkUnauthorized(res);
  if (!res.ok) throw new Error('Failed to fetch transfer records');
  const json = await res.json();
  return json.data;
}
