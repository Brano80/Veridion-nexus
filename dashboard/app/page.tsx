'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from './components/DashboardLayout';
import SovereignMap from './components/SovereignMap';
import { RefreshCw, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { fetchEvidenceEvents, fetchSCCRegistries, fetchReviewQueuePending, fetchDecidedEvidenceIds, createReviewQueueItem, fetchSettings, patchSettings, EvidenceEvent, SCCRegistry } from './utils/api';
import { getCountryCodeFromName, getLegalBasis, EU_EEA_COUNTRIES, ADEQUATE_COUNTRIES, COUNTRY_NAMES } from './config/countries';

export default function SovereignShieldPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [sccRegistries, setSccRegistries] = useState<SCCRegistry[]>([]);
  const [reviewQueueItems, setReviewQueueItems] = useState<string[]>([]); // Track evidence IDs already in queue
  const [reviewQueuePending, setReviewQueuePending] = useState<any[]>([]); // Actual review queue items from API
  const [reviewQueueMap, setReviewQueueMap] = useState<Map<string, string>>(new Map()); // Map event ID to review item ID
  const [decidedEvidenceIds, setDecidedEvidenceIds] = useState<Set<string>>(new Set()); // Rejected/approved – exclude from REQUIRES ATTENTION
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>('');
  const [enforcementMode, setEnforcementMode] = useState<'shadow' | 'enforce'>('shadow');
  const [showEnforceModal, setShowEnforceModal] = useState(false);
  const [enforceConfirmText, setEnforceConfirmText] = useState('');
  const [enforceUpdating, setEnforceUpdating] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState(false);
  const sccRegistriesRef = useRef<SCCRegistry[]>([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      setConnectionError(false);
      setSettingsLoading(true);
      
      // Check backend availability via settings API
      let settingsData;
      let settingsSuccess = false;
      try {
        settingsData = await fetchSettings();
        settingsSuccess = true;
        setBackendAvailable(true);
        setSettingsError(false);
      } catch (error) {
        console.error('Settings API failed:', error);
        settingsSuccess = false;
        setBackendAvailable(false);
        setSettingsError(true);
        settingsData = { enforcement_mode: 'shadow' };
      } finally {
        setSettingsLoading(false);
      }
      
      const [eventsData, sccData, reviewData, decidedIds] = await Promise.all([
        fetchEvidenceEvents().catch(() => []),
        fetchSCCRegistries().catch(() => []),
        fetchReviewQueuePending().catch(() => []),
        fetchDecidedEvidenceIds().catch(() => []),
      ]);
      
      setEnforcementMode((settingsData?.enforcement_mode === 'enforce' ? 'enforce' : 'shadow') as 'shadow' | 'enforce');
      setDecidedEvidenceIds(new Set(decidedIds));
      const eventsArray = Array.isArray(eventsData) ? eventsData : [];
      const sccArray = Array.isArray(sccData) ? sccData : [];
      const reviewQueueArray = Array.isArray(reviewData) ? reviewData : [];
      setEvents(eventsArray);
      setSccRegistries(sccArray);
      sccRegistriesRef.current = sccArray; // Update ref with latest SCC registries
      setReviewQueuePending(reviewQueueArray); // Store actual review queue items for status calculation
      
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
      
      reviewQueueArray.forEach((item: any) => {
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
      await ensureEventsInReviewQueue(eventsArray, existingEvidenceIds, new Set(decidedIds));
    } catch (error) {
      console.error('Failed to load data:', error);
      setEvents([]);
      setSccRegistries([]);
      setConnectionError(true);
      setBackendAvailable(false);
    } finally {
      setLoading(false);
    }
  }

  async function ensureEventsInReviewQueue(
    eventsArray: EvidenceEvent[],
    existingEvidenceIds: Set<string>,
    decidedEvidenceIds: Set<string>
  ) {
    // Use ref to always get latest SCC registries (avoids stale closure)
    const sccArray = sccRegistriesRef.current;
    
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

      // Get destination country code (normalize from name if needed)
      let countryCode = (e.payload?.destination_country_code || e.payload?.destinationCountryCode || '').trim().toUpperCase();
      if (!countryCode || countryCode.length !== 2) {
        // Try to get code from country name
        const countryName = e.payload?.destination_country || e.payload?.destinationCountry;
        if (countryName) {
          countryCode = getCountryCodeFromName(countryName).toUpperCase();
        }
      }
      if (!countryCode || countryCode.length !== 2) return true; // If no valid country code, needs attention

      const partner = e.payload?.partner_name || e.payload?.partnerName;
      const destCode = countryCode; // already normalized above
      // Partner-specific: AU/AWS transfer must not be blocked by revoked AU/TestPartner SCC
      const hasValidSCC = sccArray.some(scc => {
        if (scc.status === 'revoked' || scc.status === 'archived') return false;
        const sccCode = (getCountryCodeFromName(scc.destinationCountry) || scc.destinationCountry || (scc as any).destinationCountryCode || '').trim().toUpperCase();
        const sccPartner = scc.partnerName || (scc as any).partner_name;
        const expires = scc.expiryDate || (scc as any).expiresAt || (scc as any).expires_at;
        return sccCode === destCode &&
          (sccPartner || '').toLowerCase().trim() === (partner || '').toLowerCase().trim() &&
          (!expires || new Date(expires) > new Date()) &&
          scc.status !== 'revoked' &&
          scc.status !== 'archived';
      });

      // Skip creating review item if valid SCC exists
      if (hasValidSCC) return false;

      return true;
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
        const countryCode = event.payload?.destination_country_code || event.payload?.destinationCountryCode || 'UNKNOWN';
        const countryName = event.payload?.destination_country || event.payload?.destinationCountry || 'Unknown';
        const partner = event.payload?.partner_name || event.payload?.partnerName;
        const action = `transfer_data_to_${countryCode.toLowerCase()}`;
        
        const result = await createReviewQueueItem({
          action,
          context: {
            destination: countryName,
            destination_country_code: countryCode,
            partner_name: partner,
            data_categories: event.payload?.data_categories?.[0] || event.payload?.dataCategories?.[0] || event.payload?.data_category || 'Unknown',
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

  async function handleEnableEnforcement() {
    if (enforceConfirmText !== 'ENABLE_ENFORCEMENT') return;
    setEnforceUpdating(true);
    try {
      await patchSettings({
        enforcement_mode: 'enforce',
        confirmation_token: 'ENABLE_ENFORCEMENT',
      });
      setEnforcementMode('enforce');
      setShowEnforceModal(false);
      setEnforceConfirmText('');
    } catch (err) {
      console.error('Failed to enable enforcement:', err);
      alert(err instanceof Error ? err.message : 'Failed to enable enforcement');
    } finally {
      setEnforceUpdating(false);
    }
  }

  async function handleSwitchToShadow() {
    setEnforceUpdating(true);
    try {
      await patchSettings({ enforcement_mode: 'shadow' });
      setEnforcementMode('shadow');
    } catch (err) {
      console.error('Failed to switch to shadow mode:', err);
      alert(err instanceof Error ? err.message : 'Failed to switch to shadow mode');
    } finally {
      setEnforceUpdating(false);
    }
  }

  // Expiring SCCs: count where days until expiry is between 0 and 30 (exclude revoked and archived)
  const now = Date.now();
  const expiringSccsCount = sccRegistries.filter((scc) => {
    if (scc.status === 'revoked' || scc.status === 'archived') return false;
    if (scc.status !== 'active' && scc.status !== 'valid') return false;
    if (!scc.expiryDate) return false;
    const expiryTime = new Date(scc.expiryDate).getTime();
    const daysUntilExpiry = (expiryTime - now) / (24 * 60 * 60 * 1000);
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  }).length;

  // Calculate stats
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  // Transfer event types (exclude human oversight and erasure events)
  const transferEventTypes = [
    'DATA_TRANSFER',
    'DATA_TRANSFER_BLOCKED',
    'DATA_TRANSFER_REVIEW',
    'TRANSFER_EVALUATION',
    'TRANSFER_EVALUATION_BLOCKED',
    'TRANSFER_EVALUATION_REVIEW'
  ];
  
  // Filter to only transfer events from sovereign-shield in last 24 hours
  const last24HoursTransferEvents = events.filter((e) => {
    const eventDate = new Date(e.occurredAt);
    if (eventDate < twentyFourHoursAgo) return false;
    
    // Must be from sovereign-shield source system
    const sourceSystem = e.sourceSystem || (e as any).source_system;
    if (sourceSystem !== 'sovereign-shield') return false;
    
    // Must be a transfer event type (exclude HUMAN_OVERSIGHT_REJECTED, HUMAN_OVERSIGHT_APPROVED, GDPR_ERASURE_COMPLETED, etc.)
    const eventType = (e.eventType || '').toUpperCase();
    return transferEventTypes.includes(eventType);
  });
  
  // BLOCKED (24H): policy blocks + human rejections (REGULUS: human REJECT = sealed block decision, GDPR Art. 30 / EU AI Act Art. 14)
  // Only count explicit BLOCKED or REJECTED events, NOT REVIEW events
  // Include HUMAN_OVERSIGHT_REJECTED even though it's not a transfer event type
  const blockedTransferEvents = last24HoursTransferEvents.filter((e) => {
    const eventType = (e.eventType || '').toUpperCase();
    // Count explicit blocked events, but NOT review events
    return eventType === 'DATA_TRANSFER_BLOCKED' || 
           eventType === 'TRANSFER_EVALUATION_BLOCKED' ||
           e.verificationStatus === 'BLOCK';
  });
  
  // Also count HUMAN_OVERSIGHT_REJECTED events from last 24h (these are separate events created when rejecting a review)
  const rejectedEvents = events.filter((e) => {
    const eventDate = new Date(e.occurredAt);
    if (eventDate < twentyFourHoursAgo) return false;
    const eventType = (e.eventType || '').toUpperCase();
    return eventType === 'HUMAN_OVERSIGHT_REJECTED';
  });
  
  const blocked = blockedTransferEvents.length + rejectedEvents.length;
  
  const allowed = last24HoursTransferEvents.filter((e) => 
    e.verificationStatus === 'ALLOW' || e.severity === 'ALLOW' ||
    e.eventType === 'DATA_TRANSFER' || e.eventType === 'TRANSFER_EVALUATION'
  ).length;
  
  const total = last24HoursTransferEvents.length;

  // ADEQUATE COUNTRIES (24H): distinct adequate/EU destination countries transferred to in last 24h
  const adequateCountryCodes = new Set<string>();
  for (const e of last24HoursTransferEvents) {
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

  // ACTIVE AGENTS (24H): distinct partner_name values from transfer events in last 24h
  const activeAgents = new Set(
    last24HoursTransferEvents
      .filter(e => {
        const pn = e.payload?.partner_name || e.payload?.partnerName;
        return pn && pn !== 'TestPartner'; // exclude test data
      })
      .map(e => e.payload?.partner_name || e.payload?.partnerName)
      .filter(Boolean)
  ).size;

  // HIGH RISK DESTINATIONS (24H): distinct blocked countries in last 24h (GDPR Art. 49 — no legal basis)
  const highRiskDestinations = new Set(
    last24HoursTransferEvents
      .filter((e) => {
        const status = e.payload?.country_status ?? e.payload?.countryStatus;
        return status === 'blocked';
      })
      .map((e) =>
        e.payload?.destination_country_code ??
        e.payload?.destinationCountryCode ??
        e.payload?.destination_country ??
        e.payload?.destinationCountry
      )
      .filter(Boolean)
  ).size;

  // Transfers in Review Queue awaiting human decision
  const actualPending = reviewQueuePending.length;

  // Status: Based on settings error state
  const status = settingsError ? 'OFFLINE' : 'ACTIVE';

  // SCC COVERAGE: destinations with unresolved REVIEW transfers OR valid SCC
  // Denominator = union of unresolved destinations + covered destinations
  // Once all transfers to a destination are resolved, it drops out of the denominator
  
  // Destinations with unresolved REVIEW transfers (no valid SCC, not decided)
  const unresolvedSccDestinations = new Set<string>();
  for (const e of events) {
    const eventType = e.eventType;
    const isReview = eventType === 'DATA_TRANSFER_REVIEW' || e.payload?.decision === 'REVIEW' || e.verificationStatus === 'REVIEW';
    
    // Skip if not a REVIEW event
    if (!isReview) continue;
    
    // Get country code
    let code = (e.payload?.destination_country_code ?? e.payload?.destinationCountryCode ?? '').trim().toUpperCase();
    if (!code || code.length !== 2) {
      // Try country name if code not available
      const name = e.payload?.destination_country ?? e.payload?.destinationCountry ?? '';
      if (name) {
        const mappedCode = getCountryCodeFromName(name);
        code = mappedCode ? mappedCode.toUpperCase() : '';
      }
    }
    
    if (!code || code.length !== 2) continue;
    
    // Only count if not already decided
    const id1 = e.id;
    const id2 = e.eventId;
    if (id1 && decidedEvidenceIds.has(id1)) continue;
    if (id2 && decidedEvidenceIds.has(id2)) continue;
    
    unresolvedSccDestinations.add(code);
  }
  
  // Valid SCC destinations (non-expired, exclude revoked and archived)
  const validSccCountryCodes = new Set<string>();
  for (const scc of sccRegistries) {
    if (scc.status === 'revoked' || scc.status === 'archived') continue;
    if (scc.status !== 'active' && scc.status !== 'valid') continue;
    const expires = scc.expiryDate;
    if (expires && new Date(expires) <= new Date()) continue; // expired
    const mappedCode = getCountryCodeFromName(scc.destinationCountry);
    const countryCode = (mappedCode || (scc.destinationCountry || '').trim()).toUpperCase();
    if (countryCode && countryCode.length === 2) {
      validSccCountryCodes.add(countryCode);
    }
  }
  
  // Denominator = union of unresolved destinations + covered destinations
  const allSccDestinations = new Set([...unresolvedSccDestinations, ...validSccCountryCodes]);
  const covered = [...validSccCountryCodes].filter(c => allSccDestinations.has(c)).length;
  const sccCoverageTotal = allSccDestinations.size;
  const sccCoveragePct = sccCoverageTotal > 0 ? Math.round((covered / sccCoverageTotal) * 100) : 0;
  
  // Keep old variable name for display compatibility
  const sccCoverageCovered = covered;

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
      <div className="space-y-4">
        {/* Enforcement Mode Banner */}
        {enforcementMode === 'shadow' ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-semibold text-amber-400">SHADOW MODE</span>
                <span className="text-slate-300 ml-2">— All transfers are passing through. Decisions shown are not being enforced.</span>
              </div>
            </div>
            <button
              onClick={() => setShowEnforceModal(true)}
              className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 rounded-lg text-sm font-medium transition-colors"
            >
              Enable Enforcement
            </button>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold text-emerald-400">ENFORCING</span>
                <span className="text-slate-300 ml-2">— Blocking transfers</span>
              </div>
            </div>
            <button
              onClick={handleSwitchToShadow}
              disabled={enforceUpdating}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 border border-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              Switch to Shadow Mode
            </button>
          </div>
        )}

        {/* Enable Enforcement Confirmation Modal */}
        {showEnforceModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 max-w-md w-full shadow-xl">
              <h3 className="text-sm font-semibold text-white mb-2">Enable Enforcement</h3>
              <p className="text-slate-300 text-xs mb-3">
                You are about to enable enforcement. Transfers to blocked countries will be rejected. SCC-required transfers without valid SCC will be sent to Review Queue. This affects live traffic.
              </p>
              <p className="text-slate-400 text-xs mb-2">Type ENABLE_ENFORCEMENT to proceed:</p>
              <input
                type="text"
                value={enforceConfirmText}
                onChange={(e) => setEnforceConfirmText(e.target.value)}
                placeholder="ENABLE_ENFORCEMENT"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-4"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowEnforceModal(false); setEnforceConfirmText(''); }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnableEnforcement}
                  disabled={enforceConfirmText !== 'ENABLE_ENFORCEMENT' || enforceUpdating}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 rounded-lg text-sm font-medium"
                >
                  {enforceUpdating ? 'Updating...' : 'Enable Enforcement'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-xl font-bold text-white mb-0.5">SOVEREIGN SHIELD</h1>
            <p className="text-xs text-slate-400">GDPR Chapter V (Art. 44-49) • International Data Transfers</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Header Bar */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settingsError ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
              <span className="text-sm font-medium text-white">
                Status:{' '}
                {settingsError ? (
                  <span className="text-red-400">OFFLINE</span>
                ) : (
                  <span className="text-green-400">ACTIVE</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-300">
              <span suppressHydrationWarning>Last scan: {lastScanTime || 'Never'}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid - Row 1 */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">TRANSFERS (24H)</div>
              <Shield className={`w-3.5 h-3.5 ${activeAgents === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-xl font-bold ${total === 0 ? 'text-slate-400' : 'text-white'}`}>{total}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Last 24 hours</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">ADEQUATE COUNTRIES (24H)</div>
              <CheckCircle className={`w-3.5 h-3.5 ${adequateCountriesCount === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-xl font-bold ${adequateCountriesCount === 0 ? 'text-slate-400' : 'text-green-400'}`}>{adequateCountriesCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Distinct adequate countries today</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">HIGH RISK DESTINATIONS (24H)</div>
              <AlertTriangle className={`w-3.5 h-3.5 ${highRiskDestinations === 0 ? 'text-slate-500' : 'text-red-500'}`} />
            </div>
            <div className={`text-xl font-bold ${highRiskDestinations === 0 ? 'text-slate-400' : 'text-red-400'}`}>{highRiskDestinations}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Blocked countries (no legal basis)</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">BLOCK (24H)</div>
              <Shield className={`w-3.5 h-3.5 ${blocked === 0 ? 'text-slate-500' : 'text-red-500'}`} />
            </div>
            <div className={`text-xl font-bold ${blocked === 0 ? 'text-slate-400' : 'text-red-400'}`}>{blocked}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Transfers prevented in last 24 hours</div>
          </div>
        </div>

        {/* Stats Grid - Row 2 */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">SCC COVERAGE</div>
              <CheckCircle className={`w-3.5 h-3.5 ${(sccCoverageTotal === 0 || sccCoveragePct === 0) ? 'text-slate-500' : 'text-yellow-500'}`} />
            </div>
            <div className={`text-xl font-bold ${(sccCoverageTotal === 0 || sccCoveragePct === 0) ? 'text-slate-400' : 'text-yellow-400'}`}>{sccCoveragePct}%</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {sccCoverageTotal === 0 ? 'No SCC-required transfers yet' : `${sccCoverageCovered} of ${sccCoverageTotal} destinations covered`}
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">EXPIRING SCCs</div>
              <AlertTriangle className={`w-3.5 h-3.5 ${expiringSccsCount === 0 ? 'text-slate-500' : 'text-yellow-500'}`} />
            </div>
            <div className={`text-xl font-bold ${expiringSccsCount === 0 ? 'text-slate-400' : 'text-yellow-400'}`}>{expiringSccsCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">within 30 days</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">PENDING APPROVALS</div>
              <AlertTriangle className={`w-3.5 h-3.5 ${actualPending === 0 ? 'text-slate-500' : 'text-yellow-500'}`} />
            </div>
            <div className={`text-xl font-bold ${actualPending === 0 ? 'text-slate-400' : 'text-yellow-400'}`}>{actualPending}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">SCC-required transfers awaiting SCC registration</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-400 font-medium">ACTIVE AGENTS</div>
              <Shield className={`w-3.5 h-3.5 ${activeAgents === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-xl font-bold ${activeAgents === 0 ? 'text-slate-400' : 'text-white'}`}>{activeAgents}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Distinct data processors (24h)</div>
          </div>
        </div>

        {/* Thin line separator */}
        <div className="border-b border-slate-700" />

        <div className="space-y-4">
            {/* Top Row - Map + Requires Attention */}
            <div className="grid grid-cols-12 gap-4">
              {/* World Map - Takes 7 columns */}
              <div className="col-span-7 bg-slate-800 border border-slate-700 rounded-lg p-3">
                <SovereignMap
                  evidenceEvents={events}
                  sccRegistries={sccRegistries}
                  decidedEvidenceIds={decidedEvidenceIds}
                  isLoading={loading}
                />
              </div>

              {/* Requires Attention Panel - Takes 5 columns */}
              <div className="col-span-5 bg-slate-800 border border-slate-700 rounded-lg flex flex-col">
                <div className="p-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                    REQUIRES ATTENTION
                  </h3>
                  <button className="text-[10px] text-blue-400 hover:text-blue-300">View All →</button>
                </div>
                <div className="p-3 pb-3">
                  {(() => {
                    // Use review queue data directly as the source of truth
                    // Filter: Only SCC-required items that don't have a valid SCC
                    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                    const requiresAttention = reviewQueuePending.filter((item: any) => {
                      // Exclude items that already have a decision (rejected or approved)
                      const evidenceId = item.evidenceId || item.context?.event_id || item.context?.evidence_id;
                      if (evidenceId && decidedEvidenceIds.has(evidenceId)) return false;

                      // If status is PENDING, always show it (needs human attention regardless of destination)
                      const status = (item.status || '').toUpperCase();
                      if (status === 'PENDING') {
                        return true;
                      }

                      // Exclude items with no actionable destination (null, empty, N/A, Unknown)
                      // But only if status is not PENDING (already handled above)
                      const countryName = (item.context?.destination_country || item.context?.destination || '').trim();
                      let countryCode = (item.context?.destination_country_code || item.context?.destinationCountryCode || '').trim().toUpperCase();
                      if (!countryCode && countryName) countryCode = getCountryCodeFromName(countryName);
                      const emptyCountryValues = ['', 'n/a', 'na', 'unknown'];
                      const nameEmpty = !countryName || emptyCountryValues.includes(countryName.toLowerCase());
                      const codeEmpty = !countryCode || countryCode.length !== 2;
                      if (nameEmpty && codeEmpty) return false;

                      // Exclude items older than 7 days (stale)
                      const itemTime = item.created || item.context?.created_at;
                      if (itemTime) {
                        const ts = new Date(itemTime).getTime();
                        if (ts < sevenDaysAgo) return false;
                      }

                      // Partner-specific: AU/AWS must not be blocked by revoked AU/TestPartner SCC
                      const partner = item.context?.partner_name || item.context?.partnerName || item.context?.partner;
                      const destCode = countryCode;
                      if (destCode && destCode.length === 2) {
                        const hasValidSCC = sccRegistries.some(scc => {
                          if (scc.status === 'revoked' || scc.status === 'archived') return false;
                          const sccCode = (getCountryCodeFromName(scc.destinationCountry) || scc.destinationCountry || (scc as any).destinationCountryCode || '').trim().toUpperCase();
                          const sccPartner = scc.partnerName || (scc as any).partner_name;
                          const expires = scc.expiryDate || (scc as any).expiresAt || (scc as any).expires_at;
                          return sccCode === destCode &&
                            (sccPartner || '').toLowerCase().trim() === (partner || '').toLowerCase().trim() &&
                            (!expires || new Date(expires) > new Date()) &&
                            scc.status !== 'revoked' &&
                            scc.status !== 'archived';
                        });
                        if (hasValidSCC) return false;
                      }

                      return true;
                    });

                    return requiresAttention.length === 0 ? (
                      <div className="text-center py-4">
                        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                        <p className="text-sm text-slate-300 font-medium mb-1">No items require immediate attention</p>
                        <p className="text-xs text-slate-500">No action required</p>
                      </div>
                    ) : (
                      <div className="space-y-2 pb-1">
                        {requiresAttention.slice(0, 5).map((item: any) => {
                          const countryName = item.context?.destination_country || item.context?.destination || '';
                          const countryCode = (item.context?.destination_country_code || item.context?.destinationCountryCode || '').trim().toUpperCase()
                            || (countryName ? getCountryCodeFromName(countryName) : '');
                          const country = countryName.trim() || (countryCode && COUNTRY_NAMES[countryCode]) || countryCode || 'Unknown';
                          const reviewItemId = item.id || item.sealId || item.evidenceId;
                          
                          const handleClick = () => {
                            router.push(`/transfer-detail/${reviewItemId}`);
                          };
                          
                          return (
                            <div
                              key={item.id || item.sealId}
                              onClick={handleClick}
                              className="p-3 bg-slate-700/50 rounded-lg border border-slate-600 cursor-pointer hover:bg-slate-700 hover:border-slate-500 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white font-medium">{country}</div>
                                  <div className="text-xs text-slate-400 mt-1">
                                    {new Date(item.created || item.context?.created_at || Date.now()).toLocaleString('en-US', {
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
              <div className="p-3 border-b border-slate-700">
                <h2 className="text-sm font-semibold text-white">RECENT ACTIVITY</h2>
              </div>
              <div className="p-3">
                {loading ? (
                  <div className="text-center text-slate-400 py-4 text-xs">Loading...</div>
                ) : transferEvents.length === 0 ? (
                  <div className="text-center text-slate-400 py-4 text-xs">No transfer activity</div>
                ) : (
                  <div className="space-y-1.5">
                    {transferEvents.slice(0, 10).map((event) => {
                        // Resolve destination to display name (code → full name via COUNTRY_NAMES)
                        const raw =
                          event.payload?.destination_country ||
                          event.payload?.destinationCountry ||
                          event.payload?.destination_country_code ||
                          event.payload?.destinationCountryCode ||
                          event.payload?.destination ||
                          event.payload?.context?.destination_country ||
                          '—';
                        const displayName =
                          raw.length === 2 && raw === raw.toUpperCase()
                            ? (COUNTRY_NAMES[raw] || `Unknown (${raw})`)
                            : raw;

                        // Extract country code (for flag and legal basis)
                        let countryCode =
                          event.payload?.destination_country_code ||
                          event.payload?.destinationCountryCode ||
                          event.payload?.context?.destination_country_code ||
                          '';
                        if (!countryCode && displayName && displayName !== '—') {
                          countryCode = displayName.length === 2 && displayName === displayName.toUpperCase()
                            ? displayName
                            : getCountryCodeFromName(displayName);
                        }
                        
                        const legalBasis =
                          event.payload?.decision === 'BLOCK' && event.payload?.country_status === 'unknown'
                            ? 'Art. 44 Blocked'
                            : event.payload?.articles?.[0] || getLegalBasis(countryCode) || '—';
                        
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
                        const isShadow = event.payload?.shadow_mode === true;
                        // Real decision from event type (BLOCK/REVIEW/ALLOW)
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
                                    alt={displayName}
                                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}
                                  />
                                )}
                                <span className="text-sm text-white font-medium">{displayName}</span>
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
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isShadow && (
                                <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-[10px] font-medium whitespace-nowrap">
                                  SHADOW
                                </span>
                              )}
                              <span className={`px-2 py-1 rounded text-xs font-medium border whitespace-nowrap ${
                                decision === 'BLOCK'
                                  ? 'bg-red-500/15 text-red-400 border-red-500/25'
                                  : decision === 'REVIEW'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                              }`}>
                                {decision}
                              </span>
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

export const dynamic = 'force-dynamic';
