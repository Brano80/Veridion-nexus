'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '../components/DashboardLayout';
import { fetchEvidenceEventsWithMeta, fetchEvidenceEventsPaginated, verifyIntegrity, EvidenceEvent } from '../utils/api';
import { RefreshCw, AlertTriangle, FileDown, Filter, Search, Download, Shield, Clock, MapPin, Server, Database, FileText, X, Copy } from 'lucide-react';
import { getCountryCodeFromName, getLegalBasis, getLegalBasisFullText, COUNTRY_NAMES } from '../config/countries';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


function formatEventTypeLabel(eventType: string, payload?: { shadow_mode?: boolean }): string {
  const et = (eventType || '').toLowerCase();
  if (et.includes('sovereign_shield') || et === 'sovereign_shield_evaluation' || et === 'sovereign_shield') return 'Transfer Evaluation';
  if (et.includes('human_oversight_rejected') || et === 'human_oversight_rejected') return 'Human Decision — Blocked';
  if (et.includes('human_oversight_approved') || et === 'human_oversight_approved') return 'Human Decision — Approved';
  if (et === 'data_transfer') return 'Transfer Evaluation';
  if (et === 'data_transfer_blocked') return 'Transfer — Blocked';
  if (et === 'data_transfer_review') return 'Transfer — Review';
  if (eventType) return eventType.replace(/_/g, ' ').toLowerCase();
  return 'Unknown';
}

function getRetentionYear(createdAt: string): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + 7);
  return `Until ${d.getFullYear()}`;
}

function formatDrawerTimestamp(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
}

function formatRetentionDate(createdAt: string): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + 7);
  return d.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
}

function getHumanOversightLegalBasis(eventType: string, articles?: string[]): string {
  // Prefer articles from API if available, but filter out invalid "GDPR Art. 22" and data categories
  const validArticles = articles?.filter(a => {
    if (!a || typeof a !== 'string') return false;
    const article = a.trim();
    // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
    // Exclude data categories like "email", "name", "documents", etc.
    return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
  }) || [];
  const hasValidArticles = validArticles.length > 0;
  if (hasValidArticles) {
    return validArticles.join(', ');
  }
  
  // Otherwise use mapping based on event type
  const et = (eventType || '').toUpperCase();
  if (et.includes('HUMAN_OVERSIGHT_APPROVED')) {
    return 'Art. 44, Art. 46(2)(c), Art. 5(2)';
  }
  if (et.includes('HUMAN_OVERSIGHT_REJECTED') || et.includes('HUMAN_OVERSIGHT_BLOCKED') || et.includes('HUMAN_OVERSIGHT')) {
    return 'Art. 44, Art. 5(2)';
  }
  return '';
}

function getHumanOversightLegalBasisFull(eventType: string, articles?: string[]): string {
  // Prefer articles from API if available, but filter out invalid "GDPR Art. 22" and data categories
  const validArticles = articles?.filter(a => {
    if (!a || typeof a !== 'string') return false;
    const article = a.trim();
    // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
    // Exclude data categories like "email", "name", "documents", etc.
    return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
  }) || [];
  const hasValidArticles = validArticles.length > 0;
  if (hasValidArticles) {
    const articlesText = validArticles.join(', ');
    const et = (eventType || '').toUpperCase();
    if (et.includes('HUMAN_OVERSIGHT_APPROVED')) {
      return `${articlesText} — International transfer — appropriate safeguards`;
    }
    if (et.includes('HUMAN_OVERSIGHT_REJECTED') || et.includes('HUMAN_OVERSIGHT_BLOCKED') || et.includes('HUMAN_OVERSIGHT')) {
      return `${articlesText} — International transfer — accountability`;
    }
    return articlesText;
  }
  
  // Otherwise use mapping based on event type
  const et = (eventType || '').toUpperCase();
  if (et.includes('HUMAN_OVERSIGHT_APPROVED')) {
    return 'Art. 44, Art. 46(2)(c), Art. 5(2) — International transfer — appropriate safeguards';
  }
  if (et.includes('HUMAN_OVERSIGHT_REJECTED') || et.includes('HUMAN_OVERSIGHT_BLOCKED') || et.includes('HUMAN_OVERSIGHT')) {
    return 'Art. 44, Art. 5(2) — International transfer — accountability';
  }
  return '';
}

function EvidenceVaultPageContent() {
  const searchParams = useSearchParams();
  const highlightedEventId = searchParams.get('eventId');
  const searchParam = searchParams.get('search');

  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<'VALID' | 'TAMPERED' | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [filters, setFilters] = useState({
    destinationCountry: '',
    search: searchParam || highlightedEventId || '',
    eventType: '',
  });
  const [merkleRootsCount, setMerkleRootsCount] = useState(0);
  const [totalSealedCount, setTotalSealedCount] = useState(0);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<Date | null>(null);
  const [lastScanTime, setLastScanTime] = useState<string>('');
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<EvidenceEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEntered, setDrawerEntered] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const EVENTS_PER_PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(events.length / EVENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedEvents = events.slice(
    (currentPage - 1) * EVENTS_PER_PAGE,
    currentPage * EVENTS_PER_PAGE
  );

  useEffect(() => {
    setPage(1);
  }, [filters.destinationCountry, filters.search, filters.eventType]);

  useEffect(() => {
    if (searchParam || highlightedEventId) {
      setFilters(prev => ({ ...prev, search: searchParam || highlightedEventId || prev.search }));
    }
  }, [searchParam, highlightedEventId]);

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, [filters]);

  useEffect(() => {
    const handleRefresh = () => {
      loadEvents();
    };
    window.addEventListener('refresh-evidence-vault', handleRefresh);
    return () => window.removeEventListener('refresh-evidence-vault', handleRefresh);
  }, []);

  // Fix 5: Auto-run Chain Integrity verification on page load
  useEffect(() => {
    (async () => {
      try {
        const result = await verifyIntegrity();
        setIntegrityStatus(result.status);
        if (result.verified === true) setLastVerifiedAt(new Date());
      } catch {
        setIntegrityStatus(null);
      }
    })();
  }, []);

  async function loadEvents() {
    try {
      // When searching by SEAL ID, skip event_type filter so we get BOTH Transfer — Review and Human Decision
      const searchTrimmed = (filters.search || '').trim();
      const isSealSearch = /SEAL-/i.test(searchTrimmed);
      const eventTypeApi = isSealSearch ? undefined
        : filters.eventType === 'Human Decision — Blocked' ? 'HUMAN_OVERSIGHT_REJECTED'
        : filters.eventType === 'Human Decision — Approved' ? 'HUMAN_OVERSIGHT_APPROVED'
        : undefined;
      const { events: rawEvents, merkleRoots, totalSealed } = await fetchEvidenceEventsWithMeta({
        limit: 5000,
        search: filters.search || undefined,
        destination_country: filters.destinationCountry || undefined,
        eventType: eventTypeApi,
      });
      setMerkleRootsCount(merkleRoots);
      setTotalSealedCount(totalSealed);
      // Update last scan time when data loads successfully
      setLastScanTime(new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));
      let filtered = Array.isArray(rawEvents) ? rawEvents : [];

      // Apply filters
      if (filters.destinationCountry) {
        filtered = filtered.filter(e => 
          e.payload?.destination_country?.toLowerCase().includes(filters.destinationCountry.toLowerCase()) ||
          e.payload?.destination_country_code?.toLowerCase().includes(filters.destinationCountry.toLowerCase())
        );
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(e => {
          const correlationStr = String(
            e.correlationId ?? (e as { correlation_id?: string }).correlation_id ?? ''
          );
          const causationStr = String(
            e.causationId ?? (e as { causation_id?: string }).causation_id ?? ''
          );
          const matchesBase =
            e.id?.toLowerCase().includes(searchLower) ||
            e.eventId?.toLowerCase().includes(searchLower) ||
            correlationStr.toLowerCase().includes(searchLower) ||
            causationStr.toLowerCase().includes(searchLower) ||
            e.eventType?.toLowerCase().includes(searchLower) ||
            e.payloadHash?.toLowerCase().includes(searchLower);
          if (matchesBase) return true;
          // Also match nexusSeal, seal_id, review_id (SEAL-XXXXXXXX) for Transfer — Review + Human Decision linkage
          const sealId = (e.nexusSeal || e.payload?.seal_id || e.payload?.sealId || e.payload?.review_id || e.payload?.reviewId || '').toString().toLowerCase();
          return sealId.includes(searchLower);
        });
      }

      // Exclude only HUMAN_OVERSIGHT_REVIEW (noisy), keep HUMAN_OVERSIGHT_REJECTED and HUMAN_OVERSIGHT_APPROVED
      const excludeHumanOversight = filtered.filter((e) => {
        const source = (e.sourceSystem || '').toLowerCase();
        const et = (e.eventType || '').toUpperCase();
        if (source === 'human-oversight' && et.includes('HUMAN_OVERSIGHT_REVIEW')) return false;
        return true;
      });

      // Apply event type filter
      let eventTypeFiltered = excludeHumanOversight;
      if (filters.eventType) {
        eventTypeFiltered = excludeHumanOversight.filter((e) => {
          const label = formatEventTypeLabel(e.eventType, e.payload);
          if (filters.eventType === 'Shadow') {
            return e.payload?.shadow_mode === true;
          }
          return label === filters.eventType;
        });
      }

      setEvents(eventTypeFiltered);
      // Set last hash from rawEvents (before filtering) - events are sorted by sequence_number ascending
      setLastHash(rawEvents.length > 0 ? rawEvents[rawEvents.length - 1]?.payloadHash ?? null : null);
    } catch (error) {
      console.error('Failed to load events:', error);
      setEvents([]);
      setLastHash(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }

  async function handleVerifyIntegrity() {
    setVerifying(true);
    try {
      const result = await verifyIntegrity();
      if (result.verified === true) {
        setIntegrityStatus('VALID');
        setLastVerifiedAt(new Date());
      } else {
        setIntegrityStatus('TAMPERED');
      }
    } catch (error) {
      console.error('Failed to verify integrity:', error);
      alert('Failed to verify integrity');
    } finally {
      setVerifying(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function getEventDecision(e: EvidenceEvent): string {
    const et = (e.eventType || '').toUpperCase();
    if (e.eventType === 'DATA_TRANSFER_BLOCKED' || e.verificationStatus === 'BLOCK' || et.includes('HUMAN_OVERSIGHT_REJECTED')) return 'BLOCK';
    if (e.eventType === 'DATA_TRANSFER_REVIEW' || e.verificationStatus === 'REVIEW') return 'REVIEW';
    if (et.includes('HUMAN_OVERSIGHT_APPROVED')) return 'ALLOW';
    return e.verificationStatus || e.payload?.decision || 'ALLOW';
  }

  async function handleExportPDF() {
    setPdfExporting(true);
    try {
      // 1. Fetch all events (paginate with limit 500)
      const allEvents: EvidenceEvent[] = [];
      let page = 1;
      const limit = 500;
      while (true) {
        const { events, total } = await fetchEvidenceEventsPaginated(page, limit);
        allEvents.push(...events);
        if (events.length < limit || allEvents.length >= total) break;
        page++;
      }

      if (allEvents.length === 0) {
        alert('No events to export');
        return;
      }

      // 2. Get integrity status and merkle roots
      let chainStatus: 'VALID' | 'TAMPERED' = integrityStatus || 'VALID';
      let merkleRoots = merkleRootsCount;
      try {
        const integrity = await verifyIntegrity();
        chainStatus = integrity.status;
        const meta = await fetchEvidenceEventsWithMeta({ limit: 1 });
        merkleRoots = meta.merkleRoots;
      } catch {
        // Use existing state if fetch fails
      }

      // 3. Create jsPDF instance
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // 4. Cover page — dark header block
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 50, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('SOVEREIGN SHIELD — GDPR Compliance Audit Report', pageWidth / 2, 22, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Evidence Vault Export — GDPR Art. 5(2), 24, 30, 32', pageWidth / 2, 32, { align: 'center' });

      // White body
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      const generated = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'medium' });
      doc.text(`Generated: ${generated}`, 20, 70);
      doc.text(`Chain Status: ${chainStatus}`, 20, 78);
      doc.text(`Total Events: ${allEvents.length}`, 20, 86);
      doc.text(`Merkle Roots: ${merkleRoots}`, 20, 94);

      // 5. Evidence Events table (page 2+)
      doc.addPage();
      const tableData = allEvents.map((e) => {
        const raw = e.payload?.destination_country || e.payload?.destinationCountry || e.payload?.destination_country_code || e.payload?.destinationCountryCode || e.payload?.destination || '—';
        const dest = (raw.length === 2 && raw === raw.toUpperCase() && COUNTRY_NAMES[raw])
          ? COUNTRY_NAMES[raw]
          : raw;
        let countryCode = e.payload?.destination_country_code || e.payload?.destinationCountryCode || '';
        if (!countryCode) countryCode = getCountryCodeFromName(String(raw));
        const source = (e.sourceSystem || '').toLowerCase();
        const et = (e.eventType || '').toUpperCase();
        const isHumanOversight = source === 'human-oversight' || et.includes('HUMAN_OVERSIGHT');
        // Filter to only include valid GDPR article strings (exclude data categories)
        const validArticles = e.articles?.filter((a: string) => {
          if (!a || typeof a !== 'string') return false;
          const article = a.trim();
          // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
          // Exclude data categories like "email", "name", "documents", etc.
          return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
        }) || [];
        const hasValidArticles = validArticles.length > 0;
        const gdprBasis = isHumanOversight
          ? getHumanOversightLegalBasis(e.eventType || '', e.articles)
          : (e.payload?.decision === 'BLOCK' && e.payload?.country_status === 'unknown'
            ? 'Art. 44 Blocked'
            : hasValidArticles
              ? validArticles[0]
              : e.payload?.articles?.[0] || getLegalBasis(countryCode) || '—');
        const dataCat = e.payload?.data_categories?.[0] || e.payload?.dataCategories?.[0] || e.payload?.data_category || '—';
        const verification = e.verificationStatus || e.payload?.decision || '—';
        return [
          new Date(e.occurredAt || e.createdAt).toLocaleString(),
          formatEventTypeLabel(e.eventType, e.payload),
          String(dest).substring(0, 20),
          String(gdprBasis).substring(0, 18),
          String(dataCat).substring(0, 15),
          (e.sourceSystem || '—').substring(0, 15),
          String(verification).substring(0, 12),
        ];
      });

      autoTable(doc, {
        head: [['Timestamp', 'Event Type', 'Destination', 'GDPR Basis', 'Data', 'Source', 'Verification']],
        body: tableData,
        startY: 20,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 65, 85] },
      });

      // 6. Add footers to all pages
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Generated by Sovereign Shield — Veridion Nexus', pageWidth / 2, pageHeight - 14, { align: 'center' });
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text('This document constitutes an auditable record per GDPR Art. 30', pageWidth / 2, pageHeight - 6, { align: 'center' });
      }

      doc.save('sovereign-shield-audit-report.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfExporting(false);
    }
  }

  function handleExport(format: 'pdf' | 'json') {
    if (format === 'pdf') {
      handleExportPDF();
      return;
    }
    if (events.length === 0) {
      alert('No events to export');
      return;
    }
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evidence-vault-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const handleEventClick = useCallback((event: EvidenceEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
    setDrawerEntered(false);
    requestAnimationFrame(() => setDrawerEntered(true));
  }, []);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDrawer = useCallback(() => {
    setDrawerEntered(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setDrawerOpen(false);
      setSelectedEvent(null);
      closeTimeoutRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    if (drawerOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [drawerOpen, closeDrawer]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      closeDrawer();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add toast - for now silent
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffMs = now.getTime() - eventTime.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 min-w-0 overflow-x-hidden">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">EVIDENCE VAULT</h1>
            <p className="text-sm text-slate-400">GDPR Art. 5(2), 24, 30, 32 • Audit Archive & Evidence Chain</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={pdfExporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <FileDown className={`w-4 h-4 ${pdfExporting ? 'animate-pulse' : ''}`} />
              {pdfExporting ? 'Generating PDF...' : 'Export for Audit (PDF)'}
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export (JSON)
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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
              <Shield className="w-5 h-5 text-green-400" />
              <span className="text-sm font-medium text-white">Status: <span className="text-green-400">ACTIVE</span></span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-300">
              <span suppressHydrationWarning>Last scan: {lastScanTime || 'Never'}</span>
              <span>•</span>
              <span>{totalSealedCount} events archived</span>
            </div>
            <div className="flex items-center gap-4">
              {integrityStatus && (
                <div className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                  integrityStatus === 'VALID'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    : 'bg-red-500/15 text-red-400 border-red-500/25'
                }`}>
                  Chain: {integrityStatus}
                </div>
              )}
              <button
                onClick={handleVerifyIntegrity}
                disabled={verifying}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {verifying ? 'Verifying...' : 'Verify Chain Integrity'}
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">EVENTS SEALED</div>
              <FileText className={`w-4 h-4 ${totalSealedCount === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${totalSealedCount === 0 ? 'text-slate-400' : 'text-green-400'}`}>{totalSealedCount}</div>
            <div className="text-xs text-slate-500 mt-1">Total sealed events</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">MERKLE ROOTS</div>
              <Database className={`w-4 h-4 ${merkleRootsCount === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${merkleRootsCount === 0 ? 'text-slate-400' : 'text-green-400'}`}>{merkleRootsCount}</div>
            <div className="text-xs text-slate-500 mt-1">Sealed chain roots</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">CHAIN STATUS</div>
              <Shield className={`w-4 h-4 ${integrityStatus === 'VALID' ? 'text-green-500' : integrityStatus === 'TAMPERED' ? 'text-red-500' : 'text-slate-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${integrityStatus === 'VALID' ? 'text-green-400' : integrityStatus === 'TAMPERED' ? 'text-red-400' : 'text-slate-400'}`}>
              {integrityStatus ?? '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Integrity check result</div>
            {lastHash && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-500 mb-1">LAST HASH</p>
                <p className="text-xs font-mono text-slate-400 truncate" 
                   title={lastHash}>
                  {lastHash.slice(0, 8)}...{lastHash.slice(-8)}
                </p>
              </div>
            )}
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">LAST VERIFIED</div>
              <Clock className={`w-4 h-4 ${lastVerifiedAt === null ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-2xl font-normal ${lastVerifiedAt === null ? 'text-slate-400' : 'text-white'}`}>
              {lastVerifiedAt ? (
                <div className="flex flex-col">
                  <div>{lastVerifiedAt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div className="text-lg">{lastVerifiedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                </div>
              ) : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">When chain was verified</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-white">Filters</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-2">Event Type</label>
              <select
                value={filters.eventType}
                onChange={(e) => handleFilterChange('eventType', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="Transfer Evaluation">Transfer Evaluation</option>
                <option value="Transfer — Blocked">Transfer — Blocked</option>
                <option value="Transfer — Review">Transfer — Review</option>
                <option value="Human Decision — Blocked">Human Decision — Blocked</option>
                <option value="Human Decision — Approved">Human Decision — Approved</option>
                <option value="Shadow">Shadow</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Destination Country</label>
              <input
                type="text"
                value={filters.destinationCountry}
                onChange={(e) => handleFilterChange('destinationCountry', e.target.value)}
                placeholder="e.g., China, US, Germany"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="Event ID, Review ID (SEAL-XXXXXXXX), type, or content..."
                  className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Highlighted Event Notice */}
        {highlightedEventId && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">
                Viewing Evidence for Block ID: {highlightedEventId}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              This event is highlighted below. The evidence has been sealed in the Audit & Evidence vault for regulatory compliance.
            </p>
          </div>
        )}

        {/* Evidence Events Table */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Evidence Events Archive</h2>
              <p className="text-xs text-slate-400 mt-1">
                {events.length === 0
                  ? '0 events found'
                  : `Showing ${(currentPage - 1) * EVENTS_PER_PAGE + 1}–${Math.min(currentPage * EVENTS_PER_PAGE, events.length)} of ${events.length} events`}
              </p>
            </div>
          </div>
          <div className="overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading evidence events...</div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-400 mb-2">No Evidence Events Found</p>
                <p className="text-sm text-slate-500">Try adjusting your filters or check back later for new events.</p>
              </div>
            ) : (
              <>
              <table className="w-full table-fixed" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Destination</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">GDPR Basis</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap">Retention</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {paginatedEvents.map((event, index) => {
                    const isHighlighted = highlightedEventId && (
                      event.id === highlightedEventId ||
                      event.eventId === highlightedEventId
                    );
                    // const isErased = erasedEventIds.has(event.id); // Crypto Shredder (commented out)
                    const seq = (currentPage - 1) * EVENTS_PER_PAGE + index + 1;
                    return (
                      <tr
                        key={event.id}
                        onClick={() => handleEventClick(event)}
                        className={`cursor-pointer hover:bg-slate-700/50 transition-colors ${
                          isHighlighted ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-sm text-slate-300" title={event.eventId || event.id || undefined}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {formatEventTypeLabel(event.eventType, event.payload)}
                              {event.payload?.shadow_mode === true && (
                                <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-[10px] font-medium">
                                  Shadow mode
                                </span>
                              )}
                            </div>
                            {((event.eventType || '').toUpperCase().includes('HUMAN_OVERSIGHT_REJECTED') || (event.eventType || '').toUpperCase().includes('HUMAN_OVERSIGHT_APPROVED')) && Number(event.payload?.transfer_count || 0) > 1 && (
                              <span className="inline-flex w-fit px-2 py-0.5 rounded text-xs font-medium bg-slate-600/50 text-slate-400 border border-slate-500/50">
                                ×{event.payload.transfer_count} transfers
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            {(() => {
                              const raw = event.payload?.destination_country || event.payload?.destinationCountry || 
                                          event.payload?.destination_country_code || event.payload?.destinationCountryCode || 'N/A';
                              const destination = (raw.length === 2 && COUNTRY_NAMES[raw.toUpperCase()]) 
                                ? COUNTRY_NAMES[raw.toUpperCase()] 
                                : raw;
                              return (
                                <>
                                  <div className="text-sm text-white truncate" title={destination}>
                                    {destination}
                                  </div>
                                  {event.payload?.destination_country_code && (
                                    <div className="text-xs text-slate-400">({event.payload.destination_country_code})</div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                          {(() => {
                            const source = (event.sourceSystem || '').toLowerCase();
                            const et = (event.eventType || '').toUpperCase();
                            const isHumanOversight = source === 'human-oversight' || et.includes('HUMAN_OVERSIGHT');
                            let articlesText: string;
                            if (isHumanOversight) {
                              articlesText = getHumanOversightLegalBasis(event.eventType || '', event.articles) || '—';
                            } else {
                              const countryName = event.payload?.destination_country || event.payload?.destinationCountry || event.payload?.destination || '';
                              let countryCode = event.payload?.destination_country_code || event.payload?.destinationCountryCode || '';
                              if (!countryCode && countryName) countryCode = getCountryCodeFromName(countryName);
                              // Filter to only include valid GDPR article strings (exclude data categories)
                              const validArticles = event.articles?.filter((a: string) => {
                                if (!a || typeof a !== 'string') return false;
                                const article = a.trim();
                                // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
                                // Exclude data categories like "email", "name", "documents", etc.
                                return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
                              }) || [];
                              const hasValidArticles = validArticles.length > 0;
                              articlesText = hasValidArticles
                                ? validArticles.join(', ')
                                : getLegalBasis(countryCode) || '—';
                            }
                            // Split by comma and display each article on a new line
                            const articles = articlesText.split(',').map(a => a.trim()).filter(a => a && a !== '—');
                            if (articles.length === 0) return '—';
                            return (
                              <div className="space-y-0.5">
                                {articles.map((article, idx) => (
                                  <div key={idx} className="whitespace-nowrap">{article}</div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white truncate">{event.payload?.data_categories?.[0] || event.payload?.dataCategories?.[0] || '—'}</div>
                            {event.payload?.records && (
                              <div className="text-xs text-slate-400">{event.payload.records.toLocaleString()} records</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-white truncate" title={event.sourceSystem ?? undefined}>
                            {event.sourceSystem ?? 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            <div className="text-white whitespace-nowrap">{formatTimeAgo(event.occurredAt)}</div>
                            <div className="text-xs text-slate-400 whitespace-nowrap">{formatTimestamp(event.occurredAt)}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-500 whitespace-nowrap">{getRetentionYear(event.createdAt)}</div>
                        </td>
                        <td className="px-4 py-3 min-w-[100px] whitespace-nowrap">
                          {event.verificationStatus === 'BLOCK' || event.verificationStatus === 'VERIFIED' ? (
                            <span className="inline-block px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded text-[11px] font-medium shrink-0">
                              VERIFIED
                            </span>
                          ) : event.verificationStatus === 'REVIEW' || event.verificationStatus === 'PENDING' ? (
                            <span className="inline-block px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-[11px] font-medium shrink-0">
                              PENDING
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-slate-500/15 text-slate-400 border border-slate-500/25 rounded text-[11px] font-medium shrink-0">
                              UNVERIFIED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 border-t border-slate-700 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Evidence Vault maintains immutable audit trail · {events.length} event{events.length !== 1 ? 's' : ''} loaded
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-400 px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
              </>
            )}
          </div>
        </div>

        {/* Detail Drawer */}
        {drawerOpen && selectedEvent && (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-black/20"
            onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}
            role="presentation"
          >
            <div
              ref={drawerRef}
              className={`fixed right-0 top-0 h-full w-[520px] bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
                drawerEntered ? 'translate-x-0' : 'translate-x-full'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const e = selectedEvent;
                const raw = e.payload?.destination_country || e.payload?.destinationCountry || e.payload?.destination || '';
                const countryName = (raw.length === 2 && COUNTRY_NAMES[raw.toUpperCase()]) 
                  ? COUNTRY_NAMES[raw.toUpperCase()] 
                  : raw;
                let countryCode = e.payload?.destination_country_code || e.payload?.destinationCountryCode || '';
                if (!countryCode && countryName) countryCode = getCountryCodeFromName(countryName);
                const source = (e.sourceSystem || '').toLowerCase();
                const et = (e.eventType || '').toUpperCase();
                const isHumanOversight = source === 'human-oversight' || et.includes('HUMAN_OVERSIGHT');
                // Filter to only include valid GDPR article strings (exclude data categories)
                const validArticles = e.articles?.filter((a: string) => {
                  if (!a || typeof a !== 'string') return false;
                  const article = a.trim();
                  // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
                  // Exclude data categories like "email", "name", "documents", etc.
                  return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
                }) || [];
                const hasValidArticles = validArticles.length > 0;
                const gdprBasisFull = isHumanOversight
                  ? getHumanOversightLegalBasisFull(e.eventType || '', e.articles)
                  : (hasValidArticles
                      ? validArticles.join(', ')
                      : getLegalBasisFullText(countryCode));
                const CopyRow = ({ label, value }: { label: string; value: string }) => (
                  <div className="flex items-start justify-between gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                      <code className="text-xs font-mono text-emerald-400 break-all">{value || '—'}</code>
                    </div>
                    <button
                      onClick={() => copyToClipboard(value)}
                      className="shrink-0 p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );

                return (
                  <>
                    {/* Header — Event Label, Verification, Close */}
                    <div className="p-5 border-b border-slate-700 flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-2 items-center min-w-0">
                        {(() => {
                          const et = (e.eventType || '').toUpperCase();
                          const label = formatEventTypeLabel(e.eventType, e.payload).toLowerCase();
                          const isBlocked = et.includes('DATA_TRANSFER_BLOCKED') || et.includes('TRANSFER_EVALUATION_BLOCKED') || et.includes('HUMAN_OVERSIGHT_REJECTED') || label.includes('blocked');
                          const isReview = et.includes('DATA_TRANSFER_REVIEW') || et.includes('TRANSFER_EVALUATION_REVIEW') || label.includes('review');
                          const isGreen = et.includes('HUMAN_OVERSIGHT_APPROVED') || label.includes('approved') || label.includes('evaluation') || et.includes('DATA_TRANSFER') || et.includes('TRANSFER_EVALUATION');
                          const badgeClass = isBlocked
                            ? 'px-2 py-0.5 rounded text-xs font-medium border bg-red-500/15 text-red-400 border-red-500/25'
                            : isReview
                            ? 'px-2 py-0.5 rounded text-xs font-medium border bg-orange-500/15 text-orange-400 border-orange-500/25'
                            : isGreen
                            ? 'px-2 py-0.5 rounded text-xs font-medium border bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                            : 'px-2 py-0.5 rounded text-xs font-medium border bg-slate-500/15 text-slate-400 border-slate-500/25';
                          return (
                            <span className={badgeClass}>
                              {formatEventTypeLabel(e.eventType, e.payload)}
                            </span>
                          );
                        })()}
                        {e.payload?.shadow_mode === true && (
                          <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-[10px] font-medium">
                            Shadow mode
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${
                            e.verificationStatus === 'VERIFIED' || e.verificationStatus === 'BLOCK' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                            e.verificationStatus === 'REVIEW' || e.verificationStatus === 'PENDING' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                            'bg-red-500/15 text-red-400 border-red-500/25'
                          }`}>
                            {e.verificationStatus === 'VERIFIED' || e.verificationStatus === 'BLOCK' ? 'VERIFIED' :
                             e.verificationStatus === 'REVIEW' || e.verificationStatus === 'PENDING' ? 'PENDING' : 'UNVERIFIED'}
                          </span>
                      </div>
                      <button
                        onClick={closeDrawer}
                        className="shrink-0 p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        aria-label="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                      {/* Section 1 — Transfer Details */}
                      {(() => {
                        const et = (e.eventType || '').toUpperCase();
                        // Removed GDPR_ERASURE_COMPLETED handling - Crypto Shredder feature removed
                        if (false) {
                          const p = e.payload || {};
                          const requestId = p.requestId ?? p.request_id ?? '—';
                          const userId = p.userId ?? p.user_id ?? '—';
                          const cryptoLogId = p.cryptoLogId ?? p.crypto_log_id ?? '—';
                          const executedAt = p.executedAt ?? p.executed_at ?? e.occurredAt ?? '—';
                          const grounds = p.grounds ?? '—';
                          const shreddedItems = Array.isArray(p.shreddedItems) ? p.shreddedItems : (Array.isArray(p.shredded_items) ? p.shredded_items : []);
                          const totalRecords = p.totalRecords ?? p.total_records ?? 0;
                          const totalSizeMb = p.totalSizeMb ?? p.total_size_mb ?? 0;
                          const execDate = executedAt !== '—' ? new Date(executedAt) : null;
                          const certId = execDate && requestId !== '—'
                            ? `CERT-${requestId}-${execDate!.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`
                            : (e.nexusSeal || e.eventId || e.id);
                          const certObj = {
                            certificateId: certId,
                            issuedAt: executedAt,
                            compliance: 'GDPR Article 17 — Right to Erasure',
                            requestId,
                            userId,
                            cryptoLogId,
                            grounds,
                            shreddedItems,
                            totalRecords,
                            totalSizeMb,
                          };
                          return (
                            <section>
                              <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-3">Erasure Certificate</h3>
                              <div className="bg-slate-900 rounded p-4 space-y-4">
                                <div className="text-sm text-emerald-400 font-medium">✓ GDPR Art. 17 — Right to Erasure Executed</div>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-400">Request ID</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-white">{requestId}</span>
                                      <button onClick={() => copyToClipboard(String(requestId))} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-400">User ID</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-white">{userId}</span>
                                      <button onClick={() => copyToClipboard(String(userId))} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-400">Crypto Log ID</span>
                                    <div className="flex items-center gap-1.5">
                                      <code className="text-emerald-400 font-mono text-xs">{cryptoLogId}</code>
                                      <button onClick={() => copyToClipboard(String(cryptoLogId))} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  <div><span className="text-slate-400">Executed At</span> <span className="text-white">{formatDrawerTimestamp(executedAt)}</span></div>
                                  <div><span className="text-slate-400">Legal Grounds</span> <span className="text-white">{grounds}</span></div>
                                </div>
                                {shreddedItems.length > 0 && (
                                  <>
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 pt-2 border-t border-slate-700">Shredded Items</h4>
                                    <div className="space-y-0">
                                      {shreddedItems.map((item: { source?: string; records?: number; size_mb?: number; sizeMb?: number; method?: string; status?: string }, i: number) => (
                                        <div key={i} className="border-t border-slate-700 pt-2 first:border-t-0 first:pt-0 text-sm">
                                          <span className="text-slate-400">Source:</span> <span className="text-white">{item.source ?? '—'}</span>
                                          <span className="text-slate-500 mx-2">|</span>
                                          <span className="text-slate-400">Records:</span> <span className="text-white">{(item.records ?? 0).toLocaleString()}</span>
                                          <span className="text-slate-500 mx-2">|</span>
                                          <span className="text-slate-400">Size:</span> <span className="text-white">{item.size_mb ?? item.sizeMb ?? 0} MB</span>
                                          <span className="text-slate-500 mx-2">|</span>
                                          <span className="text-slate-400">Method:</span> <span className="text-white">{item.method ?? '—'}</span>
                                          <span className="text-slate-500 mx-2">|</span>
                                          <span className="text-emerald-400">✓ SHREDDED</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                <div className="border-t border-slate-700 pt-3 space-y-1">
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Totals</h4>
                                  <div className="text-white font-medium">Total Records Destroyed: {(totalRecords ?? 0).toLocaleString()}</div>
                                  <div className="text-white font-medium">Total Data Size: {totalSizeMb ?? 0} MB</div>
                                </div>
                                <button
                                  onClick={() => {
                                    const blob = new Blob([JSON.stringify(certObj, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `erasure-certificate-${requestId}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
                                >
                                  Download Certificate JSON
                                </button>
                              </div>
                            </section>
                          );
                        }
                        const destCountry = (e.payload?.destination_country ?? e.payload?.destinationCountry ?? e.payload?.destination ?? '').trim();
                        const hasDestCountry = destCountry && destCountry !== 'N/A';
                        const isHumanDecision = et.includes('HUMAN_OVERSIGHT_REJECTED') || et.includes('HUMAN_OVERSIGHT_APPROVED');
                        const hasDecisionFields = e.payload?.reason || e.payload?.decided_by || e.payload?.final_decision;

                        if (hasDestCountry || isHumanDecision || hasDecisionFields) {
                          return (
                            <section>
                              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Transfer Details</h3>
                              <div className="space-y-2 text-sm">
                                {hasDestCountry && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      {countryCode && (
                                        <img src={`https://flagcdn.com/16x12/${countryCode.toLowerCase()}.png`} width={16} height={12} alt="" className="shrink-0" />
                                      )}
                                      <span className="text-white">{countryName || '—'}</span>
                                    </div>
                                    <div><span className="text-slate-400">GDPR Legal Basis:</span> <span className="text-white">{gdprBasisFull}</span></div>
                                    <div><span className="text-slate-400">Data Category:</span> <span className="text-white">{e.payload?.data_categories?.[0] || e.payload?.dataCategories?.[0] || (e.payload?.data_category ?? '—')}</span></div>
                                  </>
                                )}
                                {isHumanDecision && Number(e.payload?.transfer_count || 0) > 1 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400">Transfers Covered:</span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/50 text-slate-400 border border-slate-500/50">
                                      ×{e.payload.transfer_count} transfers
                                    </span>
                                  </div>
                                )}
                                <div><span className="text-slate-400">Source System:</span> <span className="text-white">{e.sourceSystem || '—'}</span></div>
                                {e.payload?.reason && typeof e.payload.reason === 'string' && e.payload.reason.trim() && (
                                  <div suppressHydrationWarning><span className="text-slate-400">Decision Reason:</span> <span className="text-white">{e.payload.reason}</span></div>
                                )}
                                {e.payload?.decided_by && typeof e.payload.decided_by === 'string' && e.payload.decided_by.trim() && (
                                  <div suppressHydrationWarning><span className="text-slate-400">Decided By:</span> <span className="text-white">{e.payload.decided_by}</span></div>
                                )}
                                {e.payload?.final_decision && typeof e.payload.final_decision === 'string' && e.payload.final_decision.trim() && (
                                  <div className="flex items-center gap-2" suppressHydrationWarning>
                                    <span className="text-slate-400">Final Decision:</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                      String(e.payload.final_decision).toUpperCase() === 'APPROVED' 
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                        : 'bg-red-500/15 text-red-400 border-red-500/25'
                                    }`}>
                                      {e.payload.final_decision}
                                    </span>
                                  </div>
                                )}
                                {hasDestCountry && (
                                  <div><span className="text-slate-400">Purpose:</span> <span className="text-white">{e.payload?.purpose || '—'}</span></div>
                                )}
                              </div>
                            </section>
                          );
                        }
                        return null;
                      })()}

                      {/* Section 2 — Cryptographic Evidence */}
                      <section className="border-t border-slate-700 pt-5">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Cryptographic Evidence</h3>
                        <div className="space-y-0">
                          <CopyRow label="Event ID" value={e.eventId || e.id} />
                          <CopyRow label="Nexus Seal" value={e.nexusSeal || ''} />
                          {(() => {
                            const reviewId = (e.correlationId ?? (e as { correlation_id?: string }).correlation_id ?? e.payload?.seal_id ?? e.payload?.sealId ?? '').toString().trim();
                            if (reviewId && reviewId.startsWith('SEAL-')) {
                              return <CopyRow key="review-id" label="Review ID" value={reviewId} />;
                            }
                            return null;
                          })()}
                          <CopyRow label="Payload Hash" value={e.payloadHash || ''} />
                          <CopyRow label="Previous Hash" value={e.previousHash || ''} />
                        </div>
                      </section>

                      {/* Section 3 — Timestamps */}
                      <section className="border-t border-slate-700 pt-5">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Timestamps</h3>
                        <div className="space-y-1 text-sm">
                          <div><span className="text-slate-400">Occurred at:</span> <span className="text-white">{formatDrawerTimestamp(e.occurredAt)}</span></div>
                          <div><span className="text-slate-400">Recorded at:</span> <span className="text-white">{formatDrawerTimestamp(e.recordedAt)}</span></div>
                          <div><span className="text-slate-400">Retention until:</span> <span className="text-white">{formatRetentionDate(e.createdAt)}</span></div>
                        </div>
                      </section>

                      {/* Section 4 — Regulatory Tags */}
                      <section className="border-t border-slate-700 pt-5">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Regulatory Tags</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {[...(e.regulatoryTags || []), ...(e.articles || [])].length ? (
                            [...(e.regulatoryTags || []), ...(e.articles || [])].map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">{tag}</span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-sm">None</span>
                          )}
                        </div>
                      </section>


                    </div>

                    {/* Raw Payload — above footer */}
                    <div className="px-5 pb-4 border-t border-slate-700 pt-4">
                      <details className="group">
                        <summary className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-300 cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                          Show Raw Payload ▶
                        </summary>
                        <pre className="mt-3 p-3 rounded overflow-auto max-h-48 font-mono text-xs text-emerald-400 bg-slate-950">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </details>
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-slate-700 flex gap-2">
                      <button
                        onClick={() => {
                          if (!selectedEvent) return;
                          const e = selectedEvent;
                          const raw = e.payload?.destination_country || e.payload?.destinationCountry || e.payload?.destination || '';
                          const countryName = (raw.length === 2 && COUNTRY_NAMES[raw.toUpperCase()]) 
                            ? COUNTRY_NAMES[raw.toUpperCase()] 
                            : raw;
                          let countryCode = e.payload?.destination_country_code || e.payload?.destinationCountryCode || '';
                          if (!countryCode && countryName) countryCode = getCountryCodeFromName(countryName);
                          const sourceForPdf = (e.sourceSystem || '').toLowerCase();
                          const etForPdf = (e.eventType || '').toUpperCase();
                          const isHumanOversightForPdf = sourceForPdf === 'human-oversight' || etForPdf.includes('HUMAN_OVERSIGHT');
                          const gdprBasisForPdf = isHumanOversightForPdf
                            ? getHumanOversightLegalBasisFull(e.eventType || '', e.articles)
                            : (() => {
                                // Filter to only include valid GDPR article strings (exclude data categories)
                                const validArticles = e.articles?.filter((a: string) => {
                                  if (!a || typeof a !== 'string') return false;
                                  const article = a.trim();
                                  // Only include strings that look like GDPR articles (contain "Art." or "GDPR")
                                  // Exclude data categories like "email", "name", "documents", etc.
                                  return (article.includes('Art.') || article.includes('GDPR') || article.includes('art.')) && !article.includes('Art. 22');
                                }) || [];
                                return validArticles.length > 0
                                  ? validArticles.join(', ')
                                  : getLegalBasisFullText(countryCode);
                              })();
                          const reviewIdForPdf = (e.correlationId ?? (e as { correlation_id?: string }).correlation_id ?? '').toString();
                          const reviewIdPdfHtml = reviewIdForPdf.startsWith('SEAL-') ? `<p>Review ID: <code>${reviewIdForPdf}</code></p>` : '';
                          const html = `<html><head><title>Evidence - ${e.eventId || e.id}</title>
<style>body{font-family:system-ui,sans-serif;color:#1e293b;padding:2rem;max-width:600px}
h3{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin:1.5rem 0 0.5rem}
p{margin:0.2rem 0;font-size:0.875rem}
code{font-family:monospace;font-size:0.75rem;color:#059669;word-break:break-all}
</style></head><body>
<h2>Evidence Vault — Event Detail</h2>
<h3>Transfer Details</h3><p>Destination: ${countryName || '—'}</p><p>GDPR Basis: ${gdprBasisForPdf}</p>
<h3>Cryptographic Evidence</h3><p>Event ID: <code>${e.eventId || e.id}</code></p><p>Nexus Seal: <code>${e.nexusSeal || '—'}</code></p>${reviewIdPdfHtml}
<h3>Timestamps</h3><p>Occurred: ${e.occurredAt || '—'}</p><p>Retention: ${getRetentionYear(e.createdAt)}</p>
</body></html>`;
                          const w = window.open('', '_blank');
                          if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 250); }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <FileDown className="w-4 h-4" />
                        Export as PDF
                      </button>
                      <button
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/evidence-vault?eventId=${encodeURIComponent(e.eventId || e.id)}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Shareable Link
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function EvidenceVaultPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-400">Loading...</div></div>}>
      <EvidenceVaultPageContent />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
