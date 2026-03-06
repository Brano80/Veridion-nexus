'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '../components/DashboardLayout';
import { fetchSCCRegistries, createSCCRegistry, patchSCCRegistry, revokeSCCRegistry, SCCRegistry } from '../utils/api';
import { Plus, RefreshCw, Clipboard, FileText, AlertTriangle, CheckCircle, Pencil } from 'lucide-react';
import { SCC_REQUIRED_COUNTRIES, COUNTRY_NAMES, SCC_REQUIRED_COUNTRY_LIST } from '../config/countries';

const MODULE_LABELS: Record<string, string> = {
  'Module1': 'C2C', // Controller → Controller
  'Module2': 'C2P', // Controller → Processor
  'Module3': 'P2P', // Processor → Processor
  'Module4': 'P2C', // Processor → Controller
};

function getModuleLabel(sccModule?: string): string {
  if (!sccModule) return 'C2C';
  const normalized = /Module\s*(\d)/i.exec(sccModule)?.[0]?.replace(/\s+/g, '') || sccModule;
  return MODULE_LABELS[normalized] || MODULE_LABELS[sccModule] || sccModule;
}

const PARTNER_SUGGESTIONS = [
  'AWS',
  'Google Cloud',
  'Microsoft Azure',
  'Salesforce',
  'OpenAI',
  'Snowflake',
];

type SCCModule = 'Module1' | 'Module2' | 'Module3' | 'Module4';

function SCCRegistryPageContent() {
  const searchParams = useSearchParams();
  const [registries, setRegistries] = useState<SCCRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All Status' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED'>('All Status');
  const [wizardStep, setWizardStep] = useState(0); // 0 = closed, 1-3 = steps
  const [wizardData, setWizardData] = useState({
    partnerName: '',
    countryCode: '',
    sccModule: '' as SCCModule | '',
    dpaId: '',
    signedDate: '',
    expiryDate: '',
    tiaCompleted: false,
  });
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);
  const [tiaConfirmingId, setTiaConfirmingId] = useState<string | null>(null);
  const [revokeConfirmingId, setRevokeConfirmingId] = useState<string | null>(null);
  const [archiveConfirmingId, setArchiveConfirmingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [wizardRenewRegistry, setWizardRenewRegistry] = useState<SCCRegistry | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    loadRegistries();

    // Pre-fill from query parameters if present
    const countryParam = searchParams?.get('country');
    const partnerParam = searchParams?.get('partner');

    if (countryParam || partnerParam) {
      setWizardData(prev => ({
        ...prev,
        countryCode: countryParam || prev.countryCode,
        partnerName: partnerParam || prev.partnerName,
      }));
      setPartnerSearch(partnerParam || '');
      // Open wizard if we have pre-filled data
      if (countryParam && partnerParam) {
        setWizardStep(1);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  async function loadRegistries() {
    try {
      const data = await fetchSCCRegistries();
      // Ensure data is always an array
      setRegistries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load SCC registries:', error);
      setRegistries([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadRegistries();
    setRefreshing(false);
  }

  async function handleWizardSubmit() {
    try {
      const requestData = {
        partnerName: wizardData.partnerName,
        destinationCountryCode: wizardData.countryCode,
        expiryDate: wizardData.expiryDate || undefined,
        tiaCompleted: wizardData.tiaCompleted,
        dpaId: wizardData.dpaId || undefined,
        sccModule: wizardData.sccModule || undefined,
      };

      await createSCCRegistry(requestData);

      const wasRenewal = !!wizardRenewRegistry;
      setWizardStep(0);
      setWizardRenewRegistry(null);
      setWizardData({
        partnerName: '',
        countryCode: '',
        sccModule: '',
        dpaId: '',
        signedDate: '',
        expiryDate: '',
        tiaCompleted: false,
      });
      setPartnerSearch('');
      setToastMessage(wasRenewal ? 'SCC renewed successfully' : 'SCC registered successfully');
      await loadRegistries();
    } catch (error) {
      console.error('Failed to create SCC registry:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create SCC registry';
      alert(errorMessage);
    }
  }

  async function handleTiaConfirm(registryId: string) {
    setTiaConfirmingId(null);
    try {
      await patchSCCRegistry(registryId, { tiaCompleted: true });
      setRegistries(prev => prev.map(r =>
        r.id === registryId ? { ...r, tiaCompleted: true } : r
      ));
      setToastMessage('TIA marked as completed');
    } catch {
      setToastMessage('Failed to update TIA status');
    }
  }

  async function handleRevoke(registry: SCCRegistry) {
    const countryName = COUNTRY_NAMES[getCountryCode(registry.destinationCountry)] || registry.destinationCountry;
    setRevokeConfirmingId(null);
    try {
      await revokeSCCRegistry(registry.id, { revoke: true });
      setToastMessage(`SCC revoked — transfers to ${countryName} via ${registry.partnerName} will require review`);
      await loadRegistries();
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to revoke SCC');
    }
  }

  async function handleArchive(registry: SCCRegistry) {
    setArchiveConfirmingId(null);
    try {
      await revokeSCCRegistry(registry.id); // DELETE without revoke=1 sets status=archived
      setToastMessage('SCC archived — record retained for audit compliance (GDPR Art. 30)');
      await loadRegistries();
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to archive SCC');
    }
  }

  function handleRenewClick(registry: SCCRegistry) {
    const countryCode = getCountryCode(registry.destinationCountry);
    setWizardRenewRegistry(registry);
    setWizardData(prev => ({
      ...prev,
      partnerName: registry.partnerName,
      countryCode,
      sccModule: (registry.sccModule as SCCModule) || 'Module1',
      dpaId: registry.dpaId || prev.dpaId || '',
      signedDate: prev.signedDate || new Date().toISOString().slice(0, 10),
      expiryDate: prev.expiryDate || '',
    }));
    setPartnerSearch(registry.partnerName);
    setWizardStep(3);
  }


  const getStatusConfig = (expiryDate?: string) => {
    if (!expiryDate) return { label: 'ACTIVE', color: 'green', daysUntilExpiry: null };
    const now = new Date().getTime();
    const expiryTime = new Date(expiryDate).getTime();
    const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= 0) {
      return { label: 'EXPIRED', color: 'red', daysUntilExpiry };
    } else if (daysUntilExpiry <= 30) {
      return { label: 'EXPIRING', color: 'amber', daysUntilExpiry };
    } else {
      return { label: 'ACTIVE', color: 'green', daysUntilExpiry };
    }
  };

  const getDaysUntilExpiryText = (expiryDate?: string): string => {
    if (!expiryDate) return 'No expiry';
    const status = getStatusConfig(expiryDate);
    if (status.daysUntilExpiry === null) return 'No expiry';
    if (status.daysUntilExpiry <= 0) return 'EXPIRED';
    if (status.daysUntilExpiry <= 30) return `${status.daysUntilExpiry} days — renew urgently`;
    return `${status.daysUntilExpiry} days remaining`;
  };

  const getStatusSummary = () => {
    if (!Array.isArray(registries)) {
      return { totalActive: 0, expiringSoon: 0, expired: 0, archived: 0 };
    }

    const now = new Date().getTime();
    let totalActive = 0;
    let expiringSoon = 0;
    let expired = 0;
    let archived = 0;

    registries.forEach(scc => {
      const s = (scc.status || '').toLowerCase();

      // ARCHIVED: status === 'archived' || status === 'revoked'
      if (s === 'archived' || s === 'revoked') {
        archived++;
        return;
      }

      // EXPIRED: status === 'expired' or past expiry date (and not archived/revoked)
      const isExpiredByDate = scc.expiryDate ? new Date(scc.expiryDate).getTime() < now : false;
      if (s === 'expired' || isExpiredByDate) {
        expired++;
        return;
      }

      // TOTAL ACTIVE: status === 'active' (valid coverage, not expired)
      if (s === 'active') {
        totalActive++;
        if (scc.expiryDate) {
          const daysUntilExpiry = Math.ceil((new Date(scc.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
            expiringSoon++;
          }
        }
      }
    });

    return { totalActive, expiringSoon, expired, archived };
  };

  const tabFilteredRegistries = Array.isArray(registries) ? registries.filter(registry => {
    const s = (registry.status || '').toLowerCase();
    if (activeTab === 'active') {
      return s !== 'archived' && s !== 'revoked';
    }
    return s === 'archived' || s === 'revoked';
  }) : [];

  const filteredRegistries = tabFilteredRegistries.filter(registry => {
    const matchesSearch = searchTerm === '' ||
      (registry.partnerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (registry.destinationCountry || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'All Status') return matchesSearch;
    
    const status = getStatusConfig(registry.expiryDate || '');
    if (statusFilter === 'ACTIVE') return matchesSearch && status.label !== 'EXPIRED';
    if (statusFilter === 'EXPIRING') return matchesSearch && status.label === 'EXPIRING';
    if (statusFilter === 'EXPIRED') return matchesSearch && status.label === 'EXPIRED';
    
    return matchesSearch;
  });

  const getCountryCode = (countryNameOrCode: string): string => {
    // If it's already a 2-letter code, return it
    if (countryNameOrCode.length === 2 && /^[A-Z]{2}$/.test(countryNameOrCode.toUpperCase())) {
      return countryNameOrCode.toUpperCase();
    }
    // Otherwise, try to find the code from COUNTRY_NAMES
    const entry = Object.entries(COUNTRY_NAMES).find(([_, name]) => 
      name.toLowerCase() === countryNameOrCode.toLowerCase()
    );
    return entry ? entry[0] : countryNameOrCode.toUpperCase();
  };

  const filteredPartners = PARTNER_SUGGESTIONS.filter(partner =>
    partner.toLowerCase().includes(partnerSearch.toLowerCase())
  );

  const statusSummary = getStatusSummary();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">SCC REGISTRY</h1>
            <p className="text-slate-400 text-sm">Manage Standard Contractual Clauses</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                setWizardRenewRegistry(null);
                setWizardStep(1);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register New SCC
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option>All Status</option>
            <option>ACTIVE</option>
            <option>EXPIRING</option>
            <option>EXPIRED</option>
          </select>
          <input
            type="text"
            placeholder="Search partner or country..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-400 flex-1"
          />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">TOTAL ACTIVE</div>
              <CheckCircle className={`w-4 h-4 ${statusSummary.totalActive === 0 ? 'text-slate-500' : 'text-green-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${statusSummary.totalActive === 0 ? 'text-slate-400' : 'text-green-400'}`}>{statusSummary.totalActive}</div>
            <div className="text-xs text-slate-500 mt-1">Valid coverage, not expired</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">EXPIRING SOON</div>
              <AlertTriangle className={`w-4 h-4 ${statusSummary.expiringSoon === 0 ? 'text-slate-500' : 'text-amber-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${statusSummary.expiringSoon === 0 ? 'text-slate-400' : 'text-amber-400'}`}>{statusSummary.expiringSoon}</div>
            <div className="text-xs text-slate-500 mt-1">≤ 30 days until expiry</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">EXPIRED</div>
              <AlertTriangle className={`w-4 h-4 ${statusSummary.expired === 0 ? 'text-slate-500' : 'text-red-500'}`} />
            </div>
            <div className={`text-2xl font-bold ${statusSummary.expired === 0 ? 'text-slate-400' : 'text-red-400'}`}>{statusSummary.expired}</div>
            <div className="text-xs text-slate-500 mt-1">Past expiry, not archived</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">ARCHIVED</div>
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-400">{statusSummary.archived}</div>
            <div className="text-xs text-slate-500 mt-1">Revoked or archived</div>
          </div>
        </div>

        {/* Active / History Tabs */}
        <div className="flex gap-2 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            History
          </button>
        </div>

        {/* Registry Cards */}
        {loading ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
            Loading...
          </div>
        ) : filteredRegistries.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 flex flex-col items-center justify-center text-center">
            <Clipboard className="w-16 h-16 text-slate-500 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              {activeTab === 'history' ? 'No Archived or Revoked SCCs' : 'No SCC Registrations'}
            </h2>
            <p className="text-slate-400 mb-6 max-w-md">
              {activeTab === 'history'
                ? 'Revoked and archived SCCs will appear here.'
                : 'Transfers to SCC-required countries (US, IN, MX, SG, ZA and others) are currently in REVIEW status. Register Standard Contractual Clauses to allow these transfers under GDPR Art. 46.'}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => setWizardStep(1)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Register New SCC
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRegistries.map((registry) => {
              const sccStatus = (registry.status || '').toLowerCase();
              const isHistory = sccStatus === 'archived' || sccStatus === 'revoked';
              const status = getStatusConfig(registry.expiryDate);
              const countryCode = getCountryCode(registry.destinationCountry);
              const countryName = COUNTRY_NAMES[countryCode] || registry.destinationCountry;
              const daysText = getDaysUntilExpiryText(registry.expiryDate);
              const daysColor = status.daysUntilExpiry === null || (status.daysUntilExpiry && status.daysUntilExpiry > 30)
                ? 'text-green-400'
                : status.daysUntilExpiry && status.daysUntilExpiry > 0
                ? 'text-amber-400'
                : 'text-red-400';
              const isExpired = registry.expiryDate ? new Date(registry.expiryDate) < new Date() : false;

              return (
                <div
                  key={registry.id}
                  className={`bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4 ${isHistory ? 'opacity-60' : ''}`}
                >
                  {/* Top row: flag + country name + partner name + status badge */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {countryCode && countryCode.length === 2 && (
                        <img
                          src={`https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png`}
                          alt=""
                          className="w-6 h-[18px] object-cover rounded-sm shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-bold">{countryName}</div>
                        <div className="text-sm text-slate-400 truncate">{registry.partnerName}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium border shrink-0 ${
                      isHistory
                        ? 'bg-slate-500/15 text-slate-400 border-slate-500/25'
                        : status.color === 'red'
                        ? 'bg-red-500/15 text-red-400 border-red-500/25'
                        : status.color === 'amber'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                        : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    }`}>
                      {isHistory ? (sccStatus === 'archived' ? 'ARCHIVED' : 'REVOKED') : status.label}
                    </span>
                  </div>

                  {/* Middle: SCC Module, DPA ID, Signed date → Expiry date */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">SCC Module</div>
                      <div className="text-white">{getModuleLabel(registry.sccModule)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">DPA ID</div>
                      <div className="text-white">{registry.dpaId || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Signed → Expiry</div>
                      <div className="text-white">
                        {registry.expiryDate 
                          ? `${new Date(registry.createdAt).toLocaleDateString()} → ${new Date(registry.expiryDate).toLocaleDateString()}`
                          : registry.createdAt
                          ? `${new Date(registry.createdAt).toLocaleDateString()} → No expiry`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Bottom row: TIA status + days until expiry + Revoke / Remove / Renew (read-only for history) */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                    <div className="flex flex-col gap-2">
                      {!isHistory && (() => {
                        const effectiveTiaCompleted = registry.tiaCompleted;
                        const isConfirming = tiaConfirmingId === registry.id;
                        if (effectiveTiaCompleted) {
                          return (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              ✓ TIA Completed
                            </span>
                          );
                        }
                        if (isConfirming) {
                          return (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs text-slate-300">Mark Transfer Impact Assessment as completed?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleTiaConfirm(registry.id)}
                                  className="px-2 py-1 rounded text-xs font-medium bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/25 transition-colors"
                                >
                                  ✓ Confirm
                                </button>
                                <button
                                  onClick={() => setTiaConfirmingId(null)}
                                  className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 hover:bg-slate-600/40 text-slate-300 border border-slate-500/25 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => setTiaConfirmingId(registry.id)}
                            className="px-2 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-colors text-left"
                          >
                            ⚠ TIA Pending
                          </button>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-3">
                      {!isHistory && (status.label === 'ACTIVE' || status.label === 'EXPIRING') && status.daysUntilExpiry != null && status.daysUntilExpiry > 0 && (
                        <span className={`text-xs font-medium ${daysColor}`}>
                          {daysText}
                        </span>
                      )}
                      {!isHistory && (
                        <>
                          {status.label === 'EXPIRING' && (
                            <button
                              onClick={() => handleRenewClick(registry)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-600/20 hover:bg-slate-600/30 text-slate-300 border border-slate-500/25 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              Renew
                            </button>
                          )}
                          {isExpired ? (
                            archiveConfirmingId === registry.id ? (
                              <div className="flex flex-col gap-2 items-end">
                                <p className="text-xs text-slate-300 text-right">
                                  Archive SCC for {countryName} / {registry.partnerName}? Record retained for audit.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setArchiveConfirmingId(null)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 hover:bg-slate-600/40 text-slate-300 border border-slate-500/25 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleArchive(registry)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 hover:bg-slate-600/40 text-slate-400 border border-slate-500/25 transition-colors"
                                  >
                                    Confirm Archive
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setArchiveConfirmingId(registry.id)}
                                className="px-2 py-1 rounded text-xs font-medium bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 border border-slate-500/25 transition-colors"
                              >
                                Archive
                              </button>
                            )
                          ) : (
                            revokeConfirmingId === registry.id ? (
                              <div className="flex flex-col gap-2 items-end">
                                <p className="text-xs text-slate-300 text-right">
                                  Revoke SCC for {countryName} / {registry.partnerName}? This cannot be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setRevokeConfirmingId(null)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 hover:bg-slate-600/40 text-slate-300 border border-slate-500/25 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleRevoke(registry)}
                                    className="px-2 py-1 rounded text-xs font-medium bg-red-600/30 hover:bg-red-600/40 text-red-400 border border-red-500/25 transition-colors"
                                  >
                                    Confirm Revoke
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRevokeConfirmingId(registry.id)}
                                className="px-2 py-1 rounded text-xs font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/25 transition-colors"
                              >
                                Revoke
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SCC Registration Wizard */}
        {wizardStep > 0 && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl border border-slate-700 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {wizardRenewRegistry ? 'Renew SCC' : 'SCC Registration Wizard'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {wizardRenewRegistry ? 'Update dates to renew' : `Step ${wizardStep} of 3`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setWizardStep(0);
                    setWizardRenewRegistry(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Step Indicator */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {[1, 2, 3].map((step) => (
                  <>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step <= wizardStep ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {step}
                    </div>
                    {step < 3 && <div className={`w-12 h-0.5 ${step < wizardStep ? 'bg-blue-600' : 'bg-slate-700'}`} />}
                  </>
                ))}
              </div>

              {/* Step 1: Partner & Country */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">Partner Name *</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={partnerSearch}
                        onChange={(e) => {
                          setPartnerSearch(e.target.value);
                          setWizardData({ ...wizardData, partnerName: e.target.value });
                          setShowPartnerSuggestions(true);
                        }}
                        onFocus={() => setShowPartnerSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowPartnerSuggestions(false), 200)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter partner name..."
                      />
                      {showPartnerSuggestions && partnerSearch && filteredPartners.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg">
                          {filteredPartners.slice(0, 5).map((partner) => (
                            <button
                              key={partner}
                              type="button"
                              onClick={() => {
                                setPartnerSearch(partner);
                                setWizardData({ ...wizardData, partnerName: partner });
                                setShowPartnerSuggestions(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-600"
                            >
                              {partner}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Partner suggestion chips */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {PARTNER_SUGGESTIONS.map((partner) => (
                        <button
                          key={partner}
                          type="button"
                          onClick={() => {
                            setPartnerSearch(partner);
                            setWizardData({ ...wizardData, partnerName: partner });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 transition-colors"
                        >
                          {partner}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">Destination Country (SCC Required) *</label>
                    <select
                      value={wizardData.countryCode}
                      onChange={(e) => setWizardData({ ...wizardData, countryCode: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select country...</option>
                      {SCC_REQUIRED_COUNTRY_LIST.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.flag} {country.name} ({country.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setWizardStep(0)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => wizardData.partnerName && wizardData.countryCode && setWizardStep(2)}
                      disabled={!wizardData.partnerName || !wizardData.countryCode}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: SCC Module & DPA */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">SCC Module *</label>
                    <select
                      value={wizardData.sccModule}
                      onChange={(e) => setWizardData({ ...wizardData, sccModule: e.target.value as SCCModule })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select module...</option>
                      <option value="Module1">Module 1: Controller → Controller (C2C)</option>
                      <option value="Module2">Module 2: Controller → Processor (C2P)</option>
                      <option value="Module3">Module 3: Processor → Processor (P2P)</option>
                      <option value="Module4">Module 4: Processor → Controller (P2C)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">DPA ID *</label>
                    <input
                      type="text"
                      value={wizardData.dpaId}
                      onChange={(e) => setWizardData({ ...wizardData, dpaId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter DPA identifier..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => wizardData.sccModule && wizardData.dpaId && setWizardStep(3)}
                      disabled={!wizardData.sccModule || !wizardData.dpaId}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Dates & TIA */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-300 mb-2">Signed Date *</label>
                      <input
                        type="date"
                        value={wizardData.signedDate}
                        onChange={(e) => setWizardData({ ...wizardData, signedDate: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-2">Expiry Date *</label>
                      <input
                        type="date"
                        value={wizardData.expiryDate}
                        onChange={(e) => setWizardData({ ...wizardData, expiryDate: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="tiaCompleted"
                      checked={wizardData.tiaCompleted}
                      onChange={(e) => setWizardData({ ...wizardData, tiaCompleted: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="tiaCompleted" className="text-sm text-slate-300">
                      TIA Completed (Transfer Impact Assessment)
                    </label>
                  </div>
                  {!wizardData.tiaCompleted && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-amber-400 text-xs">
                      ⚠ Transfer Impact Assessment required for SCC-based transfers to high-risk destinations per GDPR Art. 46. Transfers may still be reviewed without a completed TIA.
                    </div>
                  )}
                  <div className="bg-slate-700/50 rounded-lg p-4 mt-4">
                    <h4 className="text-sm font-semibold text-white mb-3">Registration Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Partner:</span>
                        <span className="text-white">{wizardData.partnerName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Country:</span>
                        <span className="text-white">
                          {COUNTRY_NAMES[wizardData.countryCode] || wizardData.countryCode}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">SCC Module:</span>
                        <span className="text-white">{wizardData.sccModule}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">DPA ID:</span>
                        <span className="text-white">{wizardData.dpaId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">TIA Status:</span>
                        <span className="text-white">{wizardData.tiaCompleted ? 'Completed' : 'Pending'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleWizardSubmit}
                      disabled={!wizardData.signedDate || !wizardData.expiryDate}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {wizardRenewRegistry ? 'Renew SCC' : 'Register SCC'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm shadow-lg z-[60]">
            {toastMessage}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function SCCRegistryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-slate-400">Loading...</div></div>}>
      <SCCRegistryPageContent />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
