'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '../../components/DashboardLayout';
import { fetchReviewQueueItem, fetchEvidenceEvents, rejectReviewQueueItem, ReviewQueueItem, EvidenceEvent } from '../../utils/api';
import { ArrowLeft, MapPin, Shield, AlertTriangle, FileText, CheckCircle, XCircle } from 'lucide-react';
import { COUNTRY_NAMES, getCountryCodeFromName } from '../../config/countries';

// Same severity system as Evidence Vault
function formatEventTypeLabel(eventType: string): string {
  const et = (eventType || '').toLowerCase();
  if (et.includes('sovereign_shield') || et === 'sovereign_shield_evaluation' || et === 'sovereign_shield') return 'Transfer Evaluation';
  if (et.includes('human_oversight_rejected') || et === 'human_oversight_rejected') return 'Human Review — Rejected';
  if (et.includes('human_oversight_approved') || et === 'human_oversight_approved') return 'Human Review — Approved';
  if (et === 'data_transfer') return 'Transfer Evaluation';
  if (et === 'data_transfer_blocked') return 'Transfer — Blocked';
  if (et === 'data_transfer_review') return 'Transfer — Review';
  if (eventType) return eventType.replace(/_/g, ' ').toLowerCase();
  return 'Unknown';
}

function getDerivedSeverity(event: { eventType?: string; sourceSystem?: string; verificationStatus?: string; payload?: { decision?: string } }): 'CRITICAL' | 'HIGH' | 'LOW' | 'INFO' {
  const label = formatEventTypeLabel(event.eventType || '');
  const decision = (event.verificationStatus || event.payload?.decision || '').toUpperCase();
  if (label === 'Transfer — Blocked') return 'CRITICAL';
  if (label === 'Transfer — Review') return 'HIGH';
  if (label === 'Transfer Evaluation' && /^(ALLOW|ALLOWED|VERIFIED)$/.test(decision)) return 'LOW';
  return 'INFO';
}

function getSeverityBadgeClass(severity: 'CRITICAL' | 'HIGH' | 'LOW' | 'INFO'): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-500/15 text-red-400 border border-red-500/25';
    case 'HIGH': return 'bg-amber-500/15 text-amber-400 border border-amber-500/25';
    case 'LOW': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    default: return 'bg-slate-500/15 text-slate-400 border border-slate-500/25';
  }
}

const COUNTRY_CODE_MAP: Record<string, string> = {
  US: 'United States', USA: 'United States', UK: 'United Kingdom', GB: 'United Kingdom',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', BE: 'Belgium',
  CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  IE: 'Ireland', PT: 'Portugal', PL: 'Poland', CZ: 'Czech Republic', GR: 'Greece',
  CN: 'China', JP: 'Japan', IN: 'India', AU: 'Australia', CA: 'Canada', MX: 'Mexico',
  BR: 'Brazil', KR: 'South Korea', SG: 'Singapore', ZA: 'South Africa', RU: 'Russia',
};

function formatActionLabel(action: string): string {
  if (!action) return '—';
  const parts = action.split('_');
  const formatted: string[] = [];
  const PREPOSITIONS = new Set(['to', 'from', 'for', 'with']);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const upper = p.toUpperCase();
    if (COUNTRY_CODE_MAP[upper]) {
      formatted.push(COUNTRY_CODE_MAP[upper]);
    } else if (p === 'transfer' && parts[i + 1] === 'data') {
      formatted.push('Data Transfer');
    } else if (p === 'data' && parts[i - 1] === 'transfer') {
      continue;
    } else if (PREPOSITIONS.has(p.toLowerCase())) {
      formatted.push(p.toLowerCase());
    } else {
      formatted.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    }
  }
  return formatted.filter(Boolean).join(' ');
}

export default function TransferDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  
  const [reviewItem, setReviewItem] = useState<ReviewQueueItem | null>(null);
  const [evidenceEvent, setEvidenceEvent] = useState<EvidenceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const item = await fetchReviewQueueItem(id);
      setReviewItem(item);
      
      // Try to fetch the related evidence event
      if (item?.context?.event_id || item?.context?.evidence_id || item?.evidenceId) {
        const eventId = item.context?.event_id || item.context?.evidence_id || item.evidenceId;
        try {
          const events = await fetchEvidenceEvents();
          const event = events.find(e => e.id === eventId || e.eventId === eventId);
          setEvidenceEvent(event || null);
        } catch (error) {
          console.error('Failed to fetch evidence event:', error);
        }
      }
    } catch (error) {
      console.error('Failed to load transfer detail:', error);
    } finally {
      setLoading(false);
    }
  }

  const isMissingSCC = reviewItem?.context?.reason?.toLowerCase().includes('scc') || 
                       reviewItem?.context?.reason?.toLowerCase().includes('standard contractual clause') ||
                       reviewItem?.action?.includes('transfer_data_to');

  // Extract transfer details from evidence event payload (primary source) or review item context (fallback)
  // Resolve country code to full name
  const destinationCountryCodeRaw = reviewItem?.context?.destination_country_code || evidenceEvent?.payload?.destination_country_code || '';
  const destinationCountryCode = destinationCountryCodeRaw.toUpperCase();
  
  // Get country name from payload/context first
  let destinationCountry = reviewItem?.context?.destination || evidenceEvent?.payload?.destination_country || '';
  
  // If we have a country code, resolve it to full name using COUNTRY_NAMES map
  if (destinationCountryCode && destinationCountryCode.length === 2) {
    const resolvedName = COUNTRY_NAMES[destinationCountryCode];
    if (resolvedName) {
      // Use resolved name if destinationCountry is empty, or if it's just the code
      if (!destinationCountry || destinationCountry.toUpperCase() === destinationCountryCode) {
        destinationCountry = resolvedName;
      }
    } else if (!destinationCountry || destinationCountry.toUpperCase() === destinationCountryCode) {
      // If COUNTRY_NAMES doesn't have it and destinationCountry is empty or just the code, use code as fallback
      destinationCountry = destinationCountryCode;
    }
  }
  
  // Final fallback
  if (!destinationCountry || destinationCountry === 'Unknown') {
    destinationCountry = destinationCountryCode || 'Unknown';
  }
  
  // Partner/Service Provider identification (critical for SCC registration per GDPR Art. 46)
  const partnerName = evidenceEvent?.payload?.partner_name || reviewItem?.context?.partner_name || null;
  
  // Technical transfer details (for audit trail per GDPR Art. 30 and partner identification)
  const destIp = evidenceEvent?.payload?.dest_ip || null;
  const sourceIp = evidenceEvent?.payload?.source_ip || evidenceEvent?.sourceIp || null;
  const requestPath = evidenceEvent?.payload?.request_path || null;
  const protocol = evidenceEvent?.payload?.protocol || null;
  const userAgent = evidenceEvent?.payload?.user_agent || null;
  
  const handleAddSCC = () => {
    const params = new URLSearchParams();
    if (destinationCountryCode) {
      params.set('country', destinationCountryCode);
    }
    if (partnerName) {
      params.set('partner', partnerName);
    }
    router.push(`/scc-registry?${params.toString()}`);
  };

  const sealId = reviewItem?.sealId || reviewItem?.id;
  const isPending = reviewItem?.status?.toUpperCase() === 'PENDING';

  const handleReject = async () => {
    if (!sealId) return;
    setActionError(null);
    setActionLoading('reject');
    try {
      await rejectReviewQueueItem(sealId, decisionReason);
      router.push('/review-queue');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const reasonValid = decisionReason.trim().length >= 10;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-slate-400">Loading transfer details...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!reviewItem) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Review Queue
          </button>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-red-400" />
            <h2 className="text-lg font-semibold text-white mb-2">Transfer Not Found</h2>
            <p className="text-slate-400">The requested transfer detail could not be found.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs w-fit"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-white">Transfer Detail</h1>
            <p className="text-sm text-slate-400">Review transfer details and compliance status</p>
          </div>
          {actionError && (
            <span className="text-sm text-red-400">{actionError}</span>
          )}
        </div>

        {/* Status Banner */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <span className="text-sm font-medium text-white">
                Status:{' '}
                {isPending ? (
                  <span className="text-orange-400">PENDING REVIEW</span>
                ) : (
                  <span className="text-green-400">NO PENDING REVIEWS</span>
                )}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              Last review • {new Date(reviewItem.created).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Reason Flagged + Regulatory Context - Side by side, same height */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 min-h-[200px] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">
              Reason Flagged
            </h2>
            <div className="space-y-3 flex-1">
              <p className="text-slate-300 leading-relaxed">
                {reviewItem.context?.reason || reviewItem.decisionReason || 'Manual review required for this transfer decision.'}
              </p>
              {isMissingSCC && (
                <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <p className="text-sm text-orange-400 font-medium mb-1">SCC Required</p>
                  <p className="text-xs text-slate-400 mb-2">
                    This transfer requires Standard Contractual Clauses (SCC) per GDPR Art. 46. 
                    No valid SCC is currently registered for {destinationCountry}.
                  </p>
                  {partnerName ? (
                    <p className="text-xs text-green-400 flex items-center gap-1 mt-2">
                      <CheckCircle className="w-3 h-3" />
                      Partner identified: <strong>{partnerName}</strong> — You can register an SCC for this partner.
                    </p>
                  ) : (
                    <p className="text-xs text-yellow-400 flex items-center gap-1 mt-2">
                      <AlertTriangle className="w-3 h-3" />
                      Partner name not specified — You'll need to identify the partner/service provider 
                      (e.g., AWS, Google Cloud, Microsoft Azure) before registering an SCC. Check technical details above for clues.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 min-h-[200px] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Regulatory Context
            </h2>
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-xs text-slate-400 mb-2">Applicable Regulations:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded text-xs font-medium">
                    GDPR Art. 44-49
                  </span>
                  <span className="px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded text-xs font-medium">
                    GDPR Art. 22
                  </span>
                  {isMissingSCC && (
                    <span className="px-2 py-1 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-xs font-medium">
                      GDPR Art. 46
                    </span>
                  )}
                  <span className="px-2 py-1 bg-purple-500/15 text-purple-400 border border-purple-500/25 rounded text-xs font-medium">
                    EU AI Act Art. 14
                  </span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-400 leading-relaxed">
                  This transfer requires human oversight per EU AI Act Art. 14 and GDPR Art. 22 
                  (right not to be subject to automated decision-making). All review decisions 
                  are sealed in the Evidence Vault per GDPR Art. 30.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Transfer Details (merged with Technical + Evidence Event) */}
          <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                Transfer Details
              </h2>
              <div className="space-y-4">
                {/* Partner/Service Provider */}
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider">Partner / Service Provider</label>
                  {partnerName ? (
                    <div className="mt-1">
                      <div className="text-white font-medium">{partnerName}</div>
                      <div className="text-xs text-green-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Partner identified — SCC can be registered
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <div className="text-slate-400 italic">Not specified</div>
                      <div className="text-xs text-yellow-400 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Partner name required for SCC registration (GDPR Art. 46)
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider">Destination Country</label>
                  <div className="mt-1 text-white font-medium">{destinationCountry}</div>
                  {destinationCountryCode && destinationCountryCode.length === 2 && (
                    <div className="text-xs text-slate-400 mt-0.5">Country Code: {destinationCountryCode}</div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider">Action</label>
                  <div className="mt-1 text-white">
                    {(() => {
                      const label = formatActionLabel(reviewItem.action);
                      const dest = (destinationCountry || '').trim();
                      if ((!dest || dest === 'Unknown') && (label === 'Data Transfer to' || label.endsWith(' to'))) {
                        return 'Data Transfer to Unknown Destination';
                      }
                      return label;
                    })()}
                  </div>
                </div>

                {reviewItem.context?.data_categories && (
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider">Data Categories</label>
                    <div className="mt-1 text-white">{reviewItem.context.data_categories}</div>
                  </div>
                )}

                {evidenceEvent?.payload?.records && (
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider">Records</label>
                    <div className="mt-1 text-white">{evidenceEvent.payload.records.toLocaleString()} records</div>
                  </div>
                )}

                {/* Technical details (merged) */}
                {(destIp || sourceIp || requestPath || protocol || userAgent) && (
                  <div className="pt-4 border-t border-slate-700 space-y-4">
                    {destIp && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Destination IP / Endpoint</label>
                        <div className="mt-1 text-white font-mono text-sm">{destIp}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Where data is being sent</div>
                      </div>
                    )}
                    {sourceIp && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Source IP</label>
                        <div className="mt-1 text-white font-mono text-sm">{sourceIp}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Originating IP address</div>
                      </div>
                    )}
                    {requestPath && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Request Path / Endpoint</label>
                        <div className="mt-1 text-white font-mono text-sm break-all">{requestPath}</div>
                        <div className="text-xs text-slate-400 mt-0.5">API endpoint or service URL</div>
                      </div>
                    )}
                    {protocol && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Protocol</label>
                        <div className="mt-1 text-white">{protocol}</div>
                      </div>
                    )}
                    {userAgent && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider">User Agent</label>
                        <div className="mt-1 text-white text-xs break-all">{userAgent}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence Event (merged) */}
                {evidenceEvent && (
                  <div className="pt-4 border-t border-slate-700 space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-wider">Event Type</label>
                      <div className="mt-1 text-white">{evidenceEvent.eventType?.replace(/_/g, ' ')}</div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-wider">Severity</label>
                      <div className="mt-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityBadgeClass(getDerivedSeverity(evidenceEvent))}`}>
                          {getDerivedSeverity(evidenceEvent)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-wider">Occurred At</label>
                      <div className="mt-1 text-white">{new Date(evidenceEvent.occurredAt).toLocaleString()}</div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-wider">Source System</label>
                      <div className="mt-1 text-white">{evidenceEvent.sourceSystem}</div>
                    </div>
                  </div>
                )}

                {/* Decision reason + Actions */}
                {(isPending || isMissingSCC) && (
                  <div className="pt-4 mt-4 border-t border-slate-700 space-y-4">
                    {isPending && (
                      <div>
                        <textarea
                          value={decisionReason}
                          onChange={e => setDecisionReason(e.target.value)}
                          placeholder="Add reason for audit record (required per GDPR Art. 22)..."
                          className="bg-slate-900 border border-slate-700 rounded p-3 text-sm w-full text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 resize-y min-h-[80px]"
                          rows={3}
                        />
                      </div>
                    )}
                    <div className="flex justify-end gap-2 flex-wrap">
                      {isMissingSCC && (
                        <button
                          onClick={handleAddSCC}
                          className="px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                          disabled={!!actionLoading}
                        >
                          <FileText className="w-4 h-4" />
                          Add SCC
                        </button>
                      )}
                      {isPending && (
                        <button
                            onClick={handleReject}
                            disabled={!!actionLoading || !reasonValid}
                            className="px-4 py-2 bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle className="w-4 h-4" />
                            {actionLoading === 'reject' ? 'Rejecting…' : 'Reject'}
                          </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Evidence & Compliance */}
          <div className="space-y-6">
            {/* Evidence Chain */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                Evidence Chain
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider">Seal ID</label>
                  <div className="mt-1 text-white font-mono text-sm">{reviewItem.id}</div>
                </div>
                {reviewItem.sealId && reviewItem.sealId !== reviewItem.id && (
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider">Seal ID (Alternate)</label>
                    <div className="mt-1 text-white font-mono text-sm">{reviewItem.sealId}</div>
                  </div>
                )}
                {reviewItem.evidenceId && (
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider">Evidence ID</label>
                    <div className="mt-1 text-white font-mono text-sm">{reviewItem.evidenceId}</div>
                  </div>
                )}
                {reviewItem.context?.tx_id && (
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-wider">Transaction ID</label>
                    <div className="mt-1 text-white font-mono text-sm">{reviewItem.context.tx_id}</div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider">Created</label>
                  <div className="mt-1 text-white">{new Date(reviewItem.created).toLocaleString()}</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
