'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from './components/DashboardLayout';
import SovereignMap from './components/SovereignMap';
import { RefreshCw, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { fetchEvidenceEvents, fetchSCCRegistries, fetchReviewQueuePending, fetchDecidedEvidenceIds, createReviewQueueItem, EvidenceEvent, SCCRegistry } from './utils/api';
import { getCountryCodeFromName, getLegalBasis, EU_EEA_COUNTRIES, ADEQUATE_COUNTRIES } from './config/countries';

export default function SovereignShieldPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [sccRegistries, setSccRegistries] = useState<SCCRegistry[]>([]);
  const [reviewQueueItems, setReviewQueueItems] = useState<string[]>([]); // Track evidence IDs already in queue
  const [reviewQueueMap, setReviewQueueMap] = useState<Map<string, string>>(new Map()); // Map event ID to review item ID
  const [decidedEvidenceIds, setDecidedEvidenceIds] = useState<Set<string>>(new Set()); // Rejected/approved – exclude from REQUIRES ATTENTION
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setConnectionError(false);
      const [eventsData, sccData, reviewData, decidedIds] = await Promise.all([
        fetchEvidenceEvents(),
        fetchSCCRegistries(),
        fetchReviewQueuePending().catch(() => []),
        fetchDecidedEvidenceIds(),
      ]);
      setDecidedEvidenceIds(new Set(decidedIds));
      const eventsArray = Array.isArray(eventsData) ? eventsData : [];
      const sccArray = Array.isArray(sccData) ? sccData : [];
      setEvents(eventsArray);
      setSccRegistries(sccArray);
      
      // Update last scan time when data loads successfully
      setLastScanTime(new Date().toLocaleString('en-US', { 
        month: 'short',
        day: 'numeric',
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      }));
      
      // Track which evidence IDs are already in the review queue
      // Backend now stores evidence_event_id and returns it in evidenceId and context
      const existingEvidenceIds = new Set<string>();
      const eventToReviewMap = new Map<string, string>(); // Map event ID to review item ID
      
      reviewData.forEach((item: any) => {
        const reviewItemId = item.id || item.sealId;
        // Check evidenceId (now contains evidence_event_id if available)
        if (item.evidenceId) {
          existingEvidenceIds.add(item.evidenceId);
          eventToReviewMap.set(item.evidenceId, reviewItemId);
        }
        // Check context for event_id/evidence_id
        if (item.context?.event_id) {
          existingEvidenceIds.add(item.context.event_id);
          eventToReviewMap.set(item.context.event_id, reviewItemId);
        }
        if (item.context?.evidence_id) {
          existingEvidenceIds.add(item.context.evidence_id);
          eventToReviewMap.set(item.context.evidence_id, reviewItemId);
        }
        // Fallback to seal_id if no evidence_event_id
        if (item.id && !item.evidenceId) {
          existingEvidenceIds.add(item.id);
        }
      });
      setReviewQueueItems(Array.from(existingEvidenceIds));
      setReviewQueueMap(eventToReviewMap);

      // Automatically add events that need attention to review queue
      await ensureEventsInReviewQueue(eventsArray, sccArray, existingEvidenceIds, new Set(decidedIds));
    } catch (error) {
      console.error('Failed to load data:', error);
      setEvents([]);
      setSccRegistries([]);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }

  async function ensureEventsInReviewQueue(
    eventsArray: EvidenceEvent[],
    sccArray: SCCRegistry[],
    existingEvidenceIds: Set<string>,
    decidedEvidenceIds: Set<string>
  ) {
    // Filter events that need attention (SCC required without valid SCC)
    const needsAttention = eventsArray.filter(e => {
      // Exclude events that have already been decided (approved/rejected)
      const id1 = e.id;
      const id2 = e.eventId;
      if (id1 && decidedEvidenceIds.has(id1)) return false;
      if (id2 && decidedEvidenceIds.has(id2)) return false;

      // Only REVIEW events, not BLOCKED
      const isReview = e.eventType === 'DATA_TRANSFER_REVIEW' || e.verificationStatus === 'REVIEW';
      if (!isReview) return false;

      // Get destination country code
      const countryCode = e.payload?.destination_country_code?.toUpperCase();
      if (!countryCode) return true; // If no country code, needs attention

      // Check if there's a valid (non-expired) SCC for this country
      const hasValidSCC = sccArray.some(scc => {
        if (scc.status !== 'Valid') return false;
        if (scc.destinationCountry.toUpperCase() !== countryCode) return false;
        // Check if expired
        if (scc.expiryDate) {
          const expiryDate = new Date(scc.expiryDate);
          return expiryDate > new Date();
        }
        return true;
      });

      return !hasValidSCC;
    });

    console.log(`Found ${needsAttention.length} events that need attention`);
    console.log(`Existing evidence IDs in queue:`, Array.from(existingEvidenceIds));

    // Add each event to review queue if not already there
    for (const event of needsAttention) {
      const evidenceId = event.id || event.eventId;
      const eventId = event.eventId || event.id;
      if (!evidenceId) {
        continue; // Skip if no ID
      }
      
      // Check if already in queue by event_id in context or by evidenceId
      if (existingEvidenceIds.has(evidenceId) || existingEvidenceIds.has(eventId)) {
        continue; // Already in queue
      }

      try {
        const countryCode = event.payload?.destination_country_code || 'UNKNOWN';
        const countryName = event.payload?.destination_country || 'Unknown';
        const action = `transfer_data_to_${countryCode.toLowerCase()}`;
        
        const result = await createReviewQueueItem({
          action,
          context: {
            destination: countryName,
            destination_country_code: countryCode,
            data_categories: event.payload?.data_category || 'Unknown',
            reason: `SCC required for transfer to ${countryName} but no valid SCC registered`,
            event_id: eventId,
            evidence_id: evidenceId,
            event_type: event.eventType,
          },
          evidenceEventId: evidenceId,
        });
        
        // Add to existing set to avoid duplicates (both eventId and evidenceId)
        existingEvidenceIds.add(evidenceId);
        if (eventId) existingEvidenceIds.add(eventId);
        console.log(`Added event ${evidenceId} to review queue with seal ${result.sealId}`);
      } catch (error) {
        console.error(`Failed to add event ${evidenceId} to review queue:`, error);
        // Continue with other events even if one fails
      }
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // Expiring SCCs: count where days until expiry is between 0 and 30
  const now = Date.now();
  const expiringSccsCount = sccRegistries.filter((scc) => {
    if (!scc.expiryDate) return false;
    const expiryTime = new Date(scc.expiryDate).getTime();
    const daysUntilExpiry = (expiryTime - now) / (24 * 60 * 60 * 1000);
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  }).length;

  // Calculate stats
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  // Filter events from last 24 hours
  const last24HoursEvents = events.filter((e) => {
    const eventDate = new Date(e.occurredAt);
    return eventDate >= twentyFourHoursAgo;
  });
  
  // BLOCKED (24H): policy blocks + human rejections (REGULUS: human REJECT = sealed block decision, GDPR Art. 30 / EU AI Act Art. 14)
  const blocked = last24HoursEvents.filter((e) => 
    e.verificationStatus === 'BLOCK' || e.severity === 'BLOCK' || 
    e.eventType === 'DATA_TRANSFER_BLOCKED' || e.eventType === 'HUMAN_OVERSIGHT_REJECTED'
  ).length;
  const allowed = last24HoursEvents.filter((e) => 
    e.verificationStatus === 'ALLOW' || e.severity === 'ALLOW' ||
    e.eventType === 'DATA_TRANSFER'
  ).length;
  const total = last24HoursEvents.length;

  // ADEQUATE COUNTRIES (24H): distinct adequate/EU destination countries transferred to in last 24h
  const adequateCountryCodes = new Set<string>();
  for (const e of last24HoursEvents) {
    const statusVal = e.payload?.country_status ?? e.payload?.countryStatus ?? '';
    const statusLower = String(statusVal).toLowerCase();
    let isAdequate = false;
    if (statusLower === 'adequate' || statusLower === 'adequate_protection' || statusLower === 'eu_eea' || statusLower === 'euEea') {
      isAdequate = true;
    }
    // Get country code
    let code = (e.payload?.destination_country_code ?? e.payload?.destinationCountryCode ?? '').trim().toUpperCase();
    if (!code || code.length !== 2) {
      // Try country name if code not available
      const name = e.payload?.destination_country ?? e.payload?.destinationCountry ?? '';
      if (name) {
        code = getCountryCodeFromName(name).toUpperCase();
      }
    }
    // If country_status indicates adequate/EU, or fallback check shows it's in adequate sets
    if (isAdequate || (code && code.length === 2 && (EU_EEA_COUNTRIES.has(code) || ADEQUATE_COUNTRIES.has(code)))) {
      if (code && code.length === 2) {
        adequateCountryCodes.add(code);
      }
    }
  }
  const adequateCountriesCount = adequateCountryCodes.size;

  // Calculate PENDING APPROVALS: SCC-required transfers without valid SCC
  // Exclude events that have already been decided (approved/rejected)
  const pendingApprovals = events.filter(e => {
    const id1 = e.id;
    const id2 = e.eventId;
    if (id1 && decidedEvidenceIds.has(id1)) return false;
    if (id2 && decidedEvidenceIds.has(id2)) return false;

    // Only REVIEW events (SCC-required), not BLOCKED
    const isReview = e.eventType === 'DATA_TRANSFER_REVIEW' || e.verificationStatus === 'REVIEW';
    if (!isReview) return false;

    // Get destination country code
    const countryCode = e.payload?.destination_country_code?.toUpperCase();
    if (!countryCode) return true; // If no country code, needs approval

    // Check if there's a valid (non-expired) SCC for this country
    const hasValidSCC = sccRegistries.some(scc => {
      if (scc.status !== 'Valid') return false;
      if (scc.destinationCountry.toUpperCase() !== countryCode) return false;
      // Check if expired
      if (scc.expiryDate) {
        const expiryDate = new Date(scc.expiryDate);
        return expiryDate > new Date();
      }
      return true;
    });

    return !hasValidSCC;
  }).length;

  const status = blocked > 10 ? 'AT_RISK' : blocked > 0 ? 'ATTENTION' : 'PROTECTED';

  // SCC COVERAGE: unique SCC-required destinations WITH valid SCC / unique SCC-required destinations we've transferred to
  const sccRequiredDestCountries = new Set<string>();
  for (const e of events) {
    const statusVal = e.payload?.country_status ?? e.payload?.countryStatus ?? '';
    if (String(statusVal).toLowerCase() !== 'scc_required') continue;
    const code = (e.payload?.destination_country_code ?? e.payload?.destinationCountryCode ?? '').trim().toUpperCase();
    if (code && code.length === 2) sccRequiredDestCountries.add(code);
    else {
      const name = e.payload?.destination_country ?? e.payload?.destinationCountry ?? '';
      if (name) {
        const mapped = getCountryCodeFromName(name);
        if (mapped) sccRequiredDestCountries.add(mapped);
      }
    }
  }
  const validSccCountries = new Set<string>();
  for (const r of sccRegistries) {
    if (r.status !== 'Valid') continue;
    const exp = r.expiryDate ? new Date(r.expiryDate) : null;
    if (exp && exp <= new Date()) continue; // expired
    // Normalize country code (handle both codes and names)
    const countryCode = getCountryCodeFromName(r.destinationCountry);
    if (countryCode && countryCode.length === 2) validSccCountries.add(countryCode.toUpperCase());
  }
  const sccCoverageTotal = sccRequiredDestCountries.size;
  const sccCoverageCovered = [...sccRequiredDestCountries].filter(c => validSccCountries.has(c)).length;
  const sccCoveragePct = sccCoverageTotal === 0 ? 0 : Math.round((sccCoverageCovered / sccCoverageTotal) * 100);

  // Filter transfer events for Recent Activity (exclude human-oversight)
  const transferEvents = events.filter((event) => {
    const eventType = event.eventType?.toLowerCase() || '';
    // Exclude human-oversight events
    if (eventType.includes('human-oversight') || eventType.includes('human_oversight')) {
      return false;
    }
    // Include transfer/sovereign events or events with decision payload
    return (
      eventType.includes('transfer') ||
      eventType.includes('sovereign') ||
      event.payload?.decision !== undefined
    );
  });

  // Log payload structure for debugging
  if (transferEvents.length > 0) {
    console.log('event payload sample:', transferEvents[0]?.payload);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">SOVEREIGN SHIELD</h1>
            <p className="text-sm text-slate-400">GDPR Chapter V (Art. 44-49) • International Data Transfers</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Header Bar */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connectionError ? (
                <AlertTriangle className="w-5 h-5 text-orange-400" />
              ) : status === 'PROTECTED' ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : status === 'ATTENTION' ? (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              )}
              <span className="text-sm font-medium text-white">
                Status:{' '}
                {connectionError ? (
                  <span className="text-orange-400">DISABLED</span>
                ) : status === 'PROTECTED' ? (
                  <span className="text-green-400">ENABLED</span>
                ) : (
                  status
                )}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-300">
              <span>Last scan: {lastScanTime || 'Never'}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid - Row 1 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">TRANSFERS (24H)</div>
              <Shield className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">{total}</div>
            <div className="text-xs text-slate-500 mt-1">Last 24 hours</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">ADEQUATE COUNTRIES (24H)</div>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-400">{adequateCountriesCount}</div>
            <div className="text-xs text-slate-500 mt-1">Distinct adequate countries today</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">HIGH RISK DESTINATIONS (24H)</div>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-400">0</div>
            <div className="text-xs text-slate-500 mt-1">Non-adequate countries</div>
            <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-red-500" style={{ width: '0%' }}></div>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">BLOCKED (24H)</div>
              <Shield className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-400">{blocked}</div>
            <div className="text-xs text-slate-500 mt-1">Transfers prevented in last 24 hours</div>
          </div>
        </div>

        {/* Stats Grid - Row 2 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">SCC COVERAGE</div>
              <CheckCircle className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{sccCoveragePct}%</div>
            <div className="text-xs text-slate-500 mt-1">
              {sccCoverageTotal === 0 ? 'No SCC-required transfers yet' : `${sccCoverageCovered} of ${sccCoverageTotal} destinations covered`}
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">EXPIRING SCCs</div>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{expiringSccsCount}</div>
            <div className="text-xs text-slate-500 mt-1">within 30 days</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">PENDING APPROVALS</div>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{pendingApprovals}</div>
            <div className="text-xs text-slate-500 mt-1">SCC-required transfers awaiting SCC registration</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">ACTIVE AGENTS</div>
              <Shield className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-xs text-slate-500 mt-1">Unique agents performing transfers</div>
          </div>
        </div>

        {/* Thin line separator */}
        <div className="border-b border-slate-700" />

        <div className="space-y-6">
            {/* Top Row - Map + Requires Attention */}
            <div className="grid grid-cols-12 gap-6">
              {/* World Map - Takes 7 columns */}
              <div className="col-span-7 bg-slate-800 border border-slate-700 rounded-lg p-4">
                <SovereignMap evidenceEvents={events} isLoading={loading} />
              </div>

              {/* Requires Attention Panel - Takes 5 columns */}
              <div className="col-span-5 bg-slate-800 border border-slate-700 rounded-lg flex flex-col">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    REQUIRES ATTENTION
                  </h3>
                  <button className="text-xs text-blue-400 hover:text-blue-300">View All →</button>
                </div>
                <div className="p-4 pb-5">
                  {(() => {
                    // Filter: Only SCC-required events (REVIEW) that don't have a valid SCC,
                    // still have a PENDING review item, and are NOT already decided (rejected/approved).
                    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    const requiresAttention = events.filter(e => {
                      const id1 = e.id;
                      const id2 = e.eventId;
                      // Exclude events that already have a decision (rejected or approved)
                      if (id1 && decidedEvidenceIds.has(id1)) return false;
                      if (id2 && decidedEvidenceIds.has(id2)) return false;
                      // Only show if still in pending review queue
                      const eventId = id1 || id2;
                      if (!eventId || !reviewQueueMap.has(eventId)) return false;

                      // Only show REVIEW events, not BLOCKED
                      const isReview = e.eventType === 'DATA_TRANSFER_REVIEW' || e.verificationStatus === 'REVIEW';
                      if (!isReview) return false;

                      // Exclude events with no actionable destination (null, empty, N/A, Unknown)
                      const countryName = (e.payload?.destination_country || e.payload?.destinationCountry || '').trim();
                      let countryCode = (e.payload?.destination_country_code || e.payload?.destinationCountryCode || '').trim().toUpperCase();
                      if (!countryCode && countryName) countryCode = getCountryCodeFromName(countryName);
                      const emptyCountryValues = ['', 'n/a', 'na', 'unknown'];
                      const nameEmpty = !countryName || emptyCountryValues.includes(countryName.toLowerCase());
                      const codeEmpty = !countryCode || countryCode.length !== 2;
                      if (nameEmpty && codeEmpty) return false;

                      // Exclude events older than 7 days (stale)
                      const eventTime = e.occurredAt || e.createdAt;
                      if (eventTime) {
                        const ts = new Date(eventTime).getTime();
                        if (ts < sevenDaysAgo) return false;
                      }

                      // Check if there's a valid (non-expired) SCC for this country
                      const hasValidSCC = sccRegistries.some(scc => {
                        if (scc.status !== 'Valid') return false;
                        if (scc.destinationCountry.toUpperCase() !== countryCode) return false;
                        // Check if expired
                        if (scc.expiryDate) {
                          const expiryDate = new Date(scc.expiryDate);
                          return expiryDate > new Date();
                        }
                        return true;
                      });

                      return !hasValidSCC;
                    });

                    return requiresAttention.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                        <p className="text-sm text-slate-300 font-medium mb-1">No items require immediate attention</p>
                        <p className="text-xs text-slate-500">No action required</p>
                      </div>
                    ) : (
                      <div className="space-y-2 pb-1">
                        {requiresAttention.slice(0, 5).map((event) => {
                          const country = event.payload?.destination_country || 'Unknown';
                          const eventId = event.id || event.eventId;
                          // Find the review queue item ID for this event
                          const reviewItemId = reviewQueueMap.get(eventId) || eventId;
                          
                          const handleClick = () => {
                            router.push(`/transfer-detail/${reviewItemId}`);
                          };
                          
                          return (
                            <div
                              key={event.id}
                              onClick={handleClick}
                              className="p-3 bg-slate-700/50 rounded-lg border border-slate-600 cursor-pointer hover:bg-slate-700 hover:border-slate-500 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white font-medium">{country}</div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    {new Date(event.occurredAt).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      second: '2-digit',
                                      hour12: true
                                    })}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-xs font-medium flex-shrink-0">
                                  SCC Required
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">RECENT ACTIVITY</h2>
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="text-center text-slate-400 py-8">Loading...</div>
                ) : transferEvents.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">No transfer activity</div>
                ) : (
                  <div className="space-y-2">
                    {transferEvents.slice(0, 10).map((event) => {
                        // Extract destination country with priority order
                        const countryName = 
                          event.payload?.destination_country ||
                          event.payload?.destinationCountry ||
                          event.payload?.destination ||
                          event.payload?.context?.destination_country ||
                          'Unknown';
                        
                        // Extract country code (for flag and legal basis)
                        let countryCode = 
                          event.payload?.destination_country_code ||
                          event.payload?.destinationCountryCode ||
                          event.payload?.context?.destination_country_code ||
                          '';
                        
                        // If no code but we have a country name, try to map it
                        if (!countryCode && countryName && countryName !== 'Unknown') {
                          countryCode = getCountryCodeFromName(countryName);
                        }
                        
                        const legalBasis = getLegalBasis(countryCode);
                        
                        // Extract agent ID or endpoint (skip sovereign-shield)
                        const skipValues = ['sovereign-shield', 'sovereign_shield'];
                        let agentOrEndpoint: string | null = null;
                        if (event.payload?.agent_id && !skipValues.includes(event.payload.agent_id.toLowerCase())) {
                          agentOrEndpoint = event.payload.agent_id;
                        } else if (event.payload?.agentId && !skipValues.includes(event.payload.agentId.toLowerCase())) {
                          agentOrEndpoint = event.payload.agentId;
                        } else if (event.payload?.endpoint && !skipValues.includes(event.payload.endpoint.toLowerCase())) {
                          agentOrEndpoint = event.payload.endpoint;
                        } else if (event.payload?.source_system && !skipValues.includes(event.payload.source_system.toLowerCase())) {
                          agentOrEndpoint = event.payload.source_system;
                        } else if (event.sourceSystem && !skipValues.includes(event.sourceSystem.toLowerCase())) {
                          agentOrEndpoint = event.sourceSystem;
                        }
                        // Truncate to 24 chars (only if we have a value)
                        const displayAgent = agentOrEndpoint ? (agentOrEndpoint.length > 24 ? `${agentOrEndpoint.substring(0, 24)}...` : agentOrEndpoint) : null;
                        
                        const dataCategory = event.payload?.data_categories?.[0] || event.payload?.dataCategories?.[0] || 'N/A';
                        const decision = event.eventType === 'DATA_TRANSFER_BLOCKED' || event.verificationStatus === 'BLOCK'
                          ? 'BLOCK'
                          : event.eventType === 'DATA_TRANSFER_REVIEW' || event.verificationStatus === 'REVIEW'
                          ? 'REVIEW'
                          : 'ALLOW';
                        
                        return (
                          <div
                            key={event.id}
                            className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors gap-3"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="text-xs text-slate-400 font-mono shrink-0">
                                {new Date(event.occurredAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: true
                                })}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {countryCode && (
                                  <img 
                                    src={`https://flagcdn.com/16x12/${countryCode.toLowerCase()}.png`}
                                    width={16}
                                    height={12}
                                    alt={countryName}
                                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                                  />
                                )}
                                <span className="text-sm text-white font-medium">{countryName}</span>
                              </div>
                              {displayAgent && (
                                <div className="text-xs text-slate-400 truncate max-w-[120px]" title={agentOrEndpoint || undefined}>
                                  {displayAgent}
                                </div>
                              )}
                              <div className="text-xs text-slate-400 shrink-0">
                                {dataCategory}
                              </div>
                              <div className="text-xs font-mono text-slate-300 shrink-0">
                                {legalBasis}
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-medium border flex-shrink-0 ${
                              decision === 'BLOCK'
                                ? 'bg-red-500/15 text-red-400 border-red-500/25'
                                : decision === 'REVIEW'
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                            }`}>
                              {decision}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
    </DashboardLayout>
  );
}
