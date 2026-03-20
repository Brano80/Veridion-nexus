'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  X,
  Check,
  Copy,
  AlertTriangle,
  Key,
  ChevronRight,
  ChevronLeft,
  Download,
  Info,
  Shield,
  Globe,
  Ban,
} from 'lucide-react';
import { registerAgent, fetchSCCRegistries, type AgentCard } from '../utils/api';
import { COUNTRY_NAMES, getCountryTransferStatus, type CountryTransferTier } from '../config/countries';

const GDPR = {
  art6: 'https://gdpr-info.eu/chapter-2/#article-6-gdpr',
  art9: 'https://gdpr-info.eu/chapter-2/#article-9-gdpr',
  art30: 'https://gdpr-info.eu/chapter-4/#article-30-gdpr',
};

const DATA_CATEGORY_DEFS: { id: string; label: string; description: string; special?: boolean }[] = [
  { id: 'email', label: 'email', description: 'Email addresses' },
  { id: 'name', label: 'name', description: 'Full or partial names' },
  { id: 'phone_number', label: 'phone', description: 'Phone numbers' },
  { id: 'address', label: 'address', description: 'Physical addresses' },
  { id: 'financial_data', label: 'financial_data', description: 'Account numbers, transactions, balances' },
  { id: 'health_data', label: 'health_data', description: 'Medical or health information (special category)', special: true },
  { id: 'id_documents', label: 'id_documents', description: 'Passport, ID card, national insurance numbers' },
  { id: 'ip_address', label: 'ip_address', description: 'IP addresses and device identifiers' },
  { id: 'user_content', label: 'user_content', description: 'Free-text content submitted by users' },
  { id: 'behavioral_data', label: 'behavioral_data', description: 'Usage patterns, preferences, clickstreams' },
  { id: 'biometric_data', label: 'biometric_data', description: 'Fingerprints, facial recognition (special category)', special: true },
];

const LEGAL_BASES: { value: string; label: string; note?: string }[] = [
  { value: 'art_6_1_b', label: 'Contractual necessity (Art. 6(1)(b))' },
  { value: 'art_6_1_f', label: 'Legitimate interests (Art. 6(1)(f))', note: 'requires balancing test' },
  { value: 'art_6_1_c', label: 'Legal obligation (Art. 6(1)(c))' },
  { value: 'art_6_1_a', label: 'Consent (Art. 6(1)(a))' },
  { value: 'art_6_1_d', label: 'Vital interests (Art. 6(1)(d))' },
  { value: 'art_6_1_e', label: 'Public task (Art. 6(1)(e))' },
];

const SERVICE_TYPES = [
  { value: 'llm_provider', label: 'LLM Provider' },
  { value: 'cloud_storage', label: 'Cloud Storage' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'crm', label: 'CRM' },
  { value: 'other', label: 'Other' },
] as const;

const AUTONOMY_LEVELS = [
  {
    value: 1,
    title: 'Level 1 — Agent proposes, human operates',
    body: 'Agent generates suggestions only. All actions require human approval.',
  },
  {
    value: 2,
    title: 'Level 2 — Agent proposes, human approves',
    body: 'Agent recommends actions. Human reviews and confirms before execution.',
  },
  {
    value: 3,
    title: 'Level 3 — Agent operates, human monitors',
    body: 'Agent acts autonomously. Human receives notifications and can intervene.',
  },
  {
    value: 4,
    title: 'Level 4 — Agent operates, human observes',
    body: 'Fully autonomous. Human reviews logs periodically.',
  },
];

const REVIEW_FLAGS: { id: string; label: string }[] = [
  { id: 'review_decisions', label: 'All REVIEW decisions (SCC required transfers)' },
  { id: 'special_category_transfers', label: 'Transfers containing special category data' },
  { id: 'scc_country_transfers', label: 'Transfers to SCC-required countries' },
  { id: 'volume_threshold', label: 'Transfers exceeding volume threshold' },
  { id: 'first_transfer_new_destination', label: 'First transfer to any new destination' },
];

export type PartnerRow = {
  id: string;
  name: string;
  serviceType: (typeof SERVICE_TYPES)[number]['value'];
  hasDpa: boolean;
};

function newPartnerRow(): PartnerRow {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`,
    name: '',
    serviceType: 'llm_provider',
    hasDpa: false,
  };
}

interface Props {
  open: boolean;
  agentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TIER_LABEL: Record<CountryTransferTier, string> = {
  eu: 'EU/EEA — adequate protection',
  adequate: 'Adequate country',
  scc: 'SCC required — register SCC',
  blocked: 'Blocked — no legal transfer mechanism',
};

function GdprA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
      {children}
    </a>
  );
}

export default function RegisterAgentWizard({ open, agentName, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState({
    name: '',
    description: '',
    version: '1.0.0',
    url: '',
    providerOrg: '',
  });
  const [dataPolicy, setDataPolicy] = useState({
    categories: [] as string[],
    processingPurpose: '',
    legalBasis: '' as string,
  });
  const [transfer, setTransfer] = useState({
    countries: [] as string[],
    partners: [newPartnerRow()] as PartnerRow[],
  });
  const [oversight, setOversight] = useState({
    autonomyLevel: 2 as number,
    humanReviewFor: [] as string[],
    dpiaDone: false,
    dpiaDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ card: AgentCard; rawJson: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [sccRegistries, setSccRegistries] = useState<Awaited<ReturnType<typeof fetchSCCRegistries>>>([]);

  const countryRows = useMemo(() => {
    return Object.entries(COUNTRY_NAMES)
      .map(([code, name]) => ({
        code,
        name,
        tier: getCountryTransferStatus(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const groupedCountries = useMemo(() => {
    const eu: typeof countryRows = [];
    const adq: typeof countryRows = [];
    const scc: typeof countryRows = [];
    const blocked: typeof countryRows = [];
    for (const row of countryRows) {
      if (row.tier === 'blocked') blocked.push(row);
      else if (row.tier === 'eu') eu.push(row);
      else if (row.tier === 'adequate') adq.push(row);
      else scc.push(row);
    }
    return { eu, adequate: adq, scc, blocked };
  }, [countryRows]);

  useEffect(() => {
    if (!open) return;
    setIdentity((prev) => ({
      ...prev,
      name: agentName,
    }));
  }, [agentName, open]);

  useEffect(() => {
    if (!open) return;
    fetchSCCRegistries()
      .then(setSccRegistries)
      .catch(() => setSccRegistries([]));
  }, [open]);

  const resetAll = useCallback(() => {
    setStep(1);
    setIdentity({ name: '', description: '', version: '1.0.0', url: '', providerOrg: '' });
    setDataPolicy({ categories: [], processingPurpose: '', legalBasis: '' });
    setTransfer({ countries: [], partners: [newPartnerRow()] });
    setOversight({ autonomyLevel: 2, humanReviewFor: [], dpiaDone: false, dpiaDate: '' });
    setError('');
    setSuccess(null);
    setKeyCopied(false);
    setIdCopied(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetAll();
    }
  }, [open, resetAll]);

  const specialSelected = dataPolicy.categories.some((c) =>
    ['health_data', 'biometric_data'].includes(c),
  );

  function toggleCountry(code: string, tier: CountryTransferTier) {
    if (tier === 'blocked') return;
    setTransfer((t) => ({
      ...t,
      countries: t.countries.includes(code) ? t.countries.filter((c) => c !== code) : [...t.countries, code],
    }));
  }

  function partnerSccHint(p: PartnerRow): { needsScc: boolean; registered: boolean; countryLabel: string } | null {
    const name = p.name.trim();
    if (!name) return null;
    const sccDest = transfer.countries.filter((c) => getCountryTransferStatus(c) === 'scc');
    if (sccDest.length === 0) return null;
    const active = sccRegistries.filter((r) => r.status === 'active');
    const nameMatch = (a: string, b: string) =>
      a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
    const registered = active.some(
      (r) =>
        nameMatch(r.partnerName, name) &&
        sccDest.some((c) => (r.destinationCountry || '').toUpperCase() === c.toUpperCase()),
    );
    return { needsScc: true, registered, countryLabel: sccDest.join(', ') };
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!identity.name.trim()) return 'Agent name is required';
      if (!identity.description.trim()) return 'Description is required';
    }
    if (s === 2) {
      if (dataPolicy.categories.length === 0) return 'Select at least one allowed data category';
      if (!dataPolicy.processingPurpose.trim()) return 'Processing purpose is required';
      if (!dataPolicy.legalBasis) return 'Select a legal basis';
    }
    if (s === 3) {
      if (transfer.countries.length === 0) return 'Select at least one destination country';
      const validPartners = transfer.partners.filter((p) => p.name.trim());
      if (validPartners.length === 0) return 'Add at least one partner / data processor';
    }
    if (s === 4) {
      if (!oversight.autonomyLevel) return 'Select an autonomy level';
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setStep((x) => Math.min(5, x + 1));
  }

  function goBack() {
    setError('');
    setStep((x) => Math.max(1, x - 1));
  }

  async function submitRegister() {
    setError('');
    setSubmitting(true);
    const validPartners = transfer.partners.filter((p) => p.name.trim());
    const policy_metadata = {
      processing_purpose: dataPolicy.processingPurpose.trim(),
      legal_basis: dataPolicy.legalBasis,
      autonomy_level: oversight.autonomyLevel,
      human_review_for: oversight.humanReviewFor,
      has_dpia: oversight.dpiaDone,
      dpia_date: oversight.dpiaDone && oversight.dpiaDate ? oversight.dpiaDate : null,
      partners_detail: validPartners.map((p) => ({
        name: p.name.trim(),
        service_type: p.serviceType,
        has_dpa: p.hasDpa,
      })),
    };
    try {
      const result = await registerAgent({
        name: identity.name.trim(),
        description: identity.description.trim(),
        version: identity.version.trim() || '1.0.0',
        url: identity.url.trim() || undefined,
        provider_org: identity.providerOrg.trim() || undefined,
        allowed_data_categories: dataPolicy.categories,
        allowed_destination_countries: transfer.countries,
        allowed_partners: validPartners.map((p) => p.name.trim()),
        policy_metadata,
      });
      const key = result?.['x-veridion']?.agent_api_key as string | undefined;
      const rawJson = JSON.stringify(result, null, 2);
      if (key) {
        const redacted = JSON.parse(JSON.stringify(result));
        if (redacted['x-veridion']) delete redacted['x-veridion'].agent_api_key;
        setSuccess({ card: result, rawJson: JSON.stringify(redacted, null, 2) });
      } else {
        onSuccess();
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  function downloadCard() {
    if (!success) return;
    const blob = new Blob([success.rawJson], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agent-card-${success.card['x-veridion']?.agent_id || 'agent'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const agentId = success?.card['x-veridion']?.agent_id as string | undefined;
  const agentKey = success?.card['x-veridion']?.agent_api_key as string | undefined;

  async function copyText(text: string, which: 'id' | 'key') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'id') {
        setIdCopied(true);
        setTimeout(() => setIdCopied(false), 2000);
      } else {
        setKeyCopied(true);
        setTimeout(() => setKeyCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  }

  function handleSuccessClose() {
    setSuccess(null);
    onSuccess();
    onClose();
  }

  if (!open) return null;

  if (success) {
    const snippet = `# Veridion Nexus — agent credentials (keep secret)
export VERIDION_NEXUS_AGENT_ID="${agentId ?? ''}"
export VERIDION_NEXUS_AGENT_API_KEY="${agentKey ?? ''}"

# Example: evaluate transfer (use your session JWT from the dashboard login)
curl -sS -X POST "https://api.veridion-nexus.eu/api/v1/shield/evaluate" \\
  -H "Authorization: Bearer $TENANT_JWT" \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id":"'"$VERIDION_NEXUS_AGENT_ID"'","agent_api_key":"'"$VERIDION_NEXUS_AGENT_API_KEY"'",...}'`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl my-8">
          <div className="flex items-center justify-between p-5 border-b border-slate-700">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              Agent registered
            </h2>
            <button type="button" onClick={handleSuccessClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-400">
              Store these credentials securely. The API key is shown only once.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-500">Agent ID</label>
              <div className="flex gap-2 mt-1">
                <code className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-emerald-400 font-mono break-all">
                  {agentId}
                </code>
                <button
                  type="button"
                  onClick={() => agentId && copyText(agentId, 'id')}
                  className="shrink-0 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {idCopied && <p className="text-xs text-emerald-400 mt-1">Copied</p>}
            </div>
            {agentKey && (
              <div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-400">
                      This key will only be shown once. It cannot be recovered — rotate from Agents if lost.
                    </p>
                  </div>
                </div>
                <label className="text-xs font-medium text-slate-500">Agent API Key</label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-emerald-400 font-mono break-all">
                    {agentKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(agentKey, 'key')}
                    className="shrink-0 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {keyCopied && <p className="text-xs text-emerald-400 mt-1">Copied</p>}
              </div>
            )}
            <button
              type="button"
              onClick={downloadCard}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium w-full justify-center"
            >
              <Download className="w-4 h-4" />
              Download Agent Card (JSON)
            </button>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Add to your code</label>
              <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono">
                {snippet}
              </pre>
            </div>
          </div>
          <div className="flex justify-end p-5 border-t border-slate-700">
            <button
              type="button"
              onClick={handleSuccessClose}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  const steps = ['Identity', 'Data Policy', 'Transfer', 'Oversight', 'Review'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl my-4">
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Register New Agent</h2>
            <p className="text-xs text-slate-500 mt-1">
              Policy registration for <GdprA href={GDPR.art30}>GDPR Art. 30</GdprA> and oversight alignment.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-700/80 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[280px] sm:min-w-0 gap-1">
            {steps.map((label, i) => {
              const n = i + 1;
              const active = step === n;
              const done = step > n;
              return (
                <div key={label} className="flex items-center flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (n < step) setStep(n);
                    }}
                    disabled={n > step}
                    className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-1.5 sm:px-2 py-1.5 text-left min-w-0 flex-1 ${
                      active ? 'bg-emerald-500/20 ring-1 ring-emerald-500/40' : done ? 'opacity-90' : 'opacity-60'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        active ? 'bg-emerald-500 text-white' : done ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-600 text-slate-300'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </span>
                    <span className={`hidden sm:block text-[11px] font-medium truncate ${active ? 'text-white' : 'text-slate-400'}`}>
                      {label}
                    </span>
                  </button>
                  {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 hidden sm:block" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/25 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-white">Agent Identity</h3>
                <p className="text-sm text-slate-400 mt-0.5">Basic identification for your AI agent</p>
              </div>
              <Field
                label="Agent Name *"
                help="Human-readable name shown in the dashboard and audit exports"
                input={
                  <input
                    value={identity.name}
                    onChange={(e) => setIdentity((s) => ({ ...s, name: e.target.value }))}
                    placeholder='e.g. "Customer Support Bot"'
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                }
              />
              <Field
                label="Description *"
                help={
                  <>
                    Describe what this agent does. This appears in your <GdprA href={GDPR.art30}>GDPR Art. 30</GdprA> record.
                  </>
                }
                input={
                  <textarea
                    value={identity.description}
                    onChange={(e) => setIdentity((s) => ({ ...s, description: e.target.value }))}
                    placeholder='e.g. "Handles customer support tickets via OpenAI"'
                    rows={4}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y min-h-[100px]"
                  />
                }
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Version"
                  help="Semantic version. Update when agent behaviour or policy changes."
                  input={
                    <input
                      value={identity.version}
                      onChange={(e) => setIdentity((s) => ({ ...s, version: e.target.value }))}
                      placeholder="1.0.0"
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  }
                />
                <Field
                  label="Agent Endpoint URL"
                  help="URL where this agent is hosted. Optional but recommended for A2A compatibility."
                  input={
                    <input
                      value={identity.url}
                      onChange={(e) => setIdentity((s) => ({ ...s, url: e.target.value }))}
                      placeholder="https://api.acme.com/agents/support"
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  }
                />
              </div>
              <Field
                label="Provider / Owner"
                help="Team or department responsible for this agent."
                input={
                  <input
                    value={identity.providerOrg}
                    onChange={(e) => setIdentity((s) => ({ ...s, providerOrg: e.target.value }))}
                    placeholder='e.g. "Acme Financial Services"'
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                }
              />
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-white">Data Policy</h3>
                <p className="text-sm text-slate-400 mt-0.5">Define what personal data this agent is permitted to process</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Allowed Data Categories *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DATA_CATEGORY_DEFS.map((def) => {
                    const checked = dataPolicy.categories.includes(def.id);
                    return (
                      <label
                        key={def.id}
                        className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-600 bg-slate-900/50 hover:border-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDataPolicy((d) => ({
                              ...d,
                              categories: checked ? d.categories.filter((c) => c !== def.id) : [...d.categories, def.id],
                            }))
                          }
                          className="mt-1 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="min-w-0">
                          <span className="text-sm font-mono text-emerald-400/90">{def.label}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">{def.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {specialSelected && (
                  <div className="mt-3 flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Special category data (<GdprA href={GDPR.art9}>Art. 9 GDPR</GdprA>) requires explicit legal basis and enhanced
                      safeguards. Ensure a DPIA has been completed.
                    </span>
                  </div>
                )}
              </div>
              <Field
                label="Processing Purpose *"
                help={
                  <>
                    Describe the specific purpose for processing. Required for <GdprA href={GDPR.art30}>GDPR Art. 30</GdprA> record.
                  </>
                }
                input={
                  <textarea
                    value={dataPolicy.processingPurpose}
                    onChange={(e) => setDataPolicy((d) => ({ ...d, processingPurpose: e.target.value }))}
                    placeholder='e.g. "Customer support ticket summarisation"'
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y"
                  />
                }
              />
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Legal Basis *</label>
                <div className="space-y-2">
                  {LEGAL_BASES.map((lb) => (
                    <label
                      key={lb.value}
                      className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${
                        dataPolicy.legalBasis === lb.value ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-600 bg-slate-900/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="legal_basis"
                        checked={dataPolicy.legalBasis === lb.value}
                        onChange={() => setDataPolicy((d) => ({ ...d, legalBasis: lb.value }))}
                        className="mt-1 border-slate-500 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-200">
                        {lb.label}
                        {lb.note && <span className="text-slate-500 text-xs"> — {lb.note}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  See <GdprA href={GDPR.art6}>Art. 6 GDPR</GdprA> for lawful processing.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Transfer Policy</h3>
                <p className="text-sm text-slate-400 mt-0.5">Define where this agent is permitted to send personal data</p>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" />
                Classifications match the{' '}
                <Link href="/adequate-countries" className="text-emerald-400 hover:underline">
                  Adequate Countries
                </Link>{' '}
                reference.
              </p>

              {(['eu', 'adequate', 'scc'] as const).map((groupKey) => {
                const title =
                  groupKey === 'eu'
                    ? 'EU / EEA'
                    : groupKey === 'adequate'
                      ? 'Adequate (non-EU)'
                      : 'SCC required';
                const list =
                  groupKey === 'eu'
                    ? groupedCountries.eu
                    : groupKey === 'adequate'
                      ? groupedCountries.adequate
                      : groupedCountries.scc;
                return (
                  <div key={groupKey}>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                      {groupKey === 'eu' && <span>🟢</span>}
                      {groupKey === 'adequate' && <span>🟢</span>}
                      {groupKey === 'scc' && <span>🟡</span>}
                      {title}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {list.map((row) => {
                        const sel = transfer.countries.includes(row.code);
                        return (
                          <button
                            key={row.code}
                            type="button"
                            title={`${row.name} — ${TIER_LABEL[row.tier]}`}
                            onClick={() => toggleCountry(row.code, row.tier)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              sel
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-900/80 text-slate-400 border-slate-600 hover:border-slate-500'
                            }`}
                          >
                            <span className="font-mono">{row.code}</span>
                            <span className="hidden sm:inline truncate max-w-[120px]">{row.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div>
                <h4 className="text-xs font-semibold text-red-400/90 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5" />
                  Blocked — cannot select
                </h4>
                <div className="flex flex-wrap gap-2 opacity-50">
                  {groupedCountries.blocked.map((row) => (
                    <span
                      key={row.code}
                      title="Cannot be selected — no organisational transfer mechanism under this policy"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-red-500/20 bg-slate-900/50 text-slate-500 cursor-not-allowed"
                    >
                      🔴 {row.code} {row.name}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Allowed Partners / Data Processors *</label>
                {transfer.partners.map((p) => {
                  const hint = partnerSccHint(p);
                  return (
                    <div key={p.id} className="mb-3 p-4 rounded-lg border border-slate-600 bg-slate-900/40 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          placeholder='Partner name e.g. "OpenAI"'
                          value={p.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setTransfer((t) => ({
                              ...t,
                              partners: t.partners.map((x) => (x.id === p.id ? { ...x, name: v } : x)),
                            }));
                          }}
                          className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                        <select
                          value={p.serviceType}
                          onChange={(e) => {
                            const v = e.target.value as PartnerRow['serviceType'];
                            setTransfer((t) => ({
                              ...t,
                              partners: t.partners.map((x) => (x.id === p.id ? { ...x, serviceType: v } : x)),
                            }));
                          }}
                          className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:border-emerald-500 focus:outline-none"
                        >
                          {SERVICE_TYPES.map((st) => (
                            <option key={st.value} value={st.value}>
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.hasDpa}
                          onChange={(e) =>
                            setTransfer((t) => ({
                              ...t,
                              partners: t.partners.map((x) => (x.id === p.id ? { ...x, hasDpa: e.target.checked } : x)),
                            }))
                          }
                          className="rounded border-slate-500 text-emerald-500"
                        />
                        Has DPA? — Data Processing Agreement in place
                      </label>
                      {hint && hint.needsScc && !hint.registered && (
                        <div className="text-xs text-amber-400 flex gap-2 items-start">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>
                            No active SCC found for <strong>{p.name.trim() || 'partner'}</strong> (destinations: {hint.countryLabel}
                            ).{' '}
                            <Link href="/scc-registry" className="underline text-emerald-400">
                              Register an SCC
                            </Link>{' '}
                            before enabling enforcement.
                          </span>
                        </div>
                      )}
                      {transfer.partners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setTransfer((t) => ({ ...t, partners: t.partners.filter((x) => x.id !== p.id) }))}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove partner
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setTransfer((t) => ({ ...t, partners: [...t.partners, newPartnerRow()] }))}
                  className="text-sm text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  + Add partner
                </button>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-white">Autonomy & Oversight</h3>
                <p className="text-sm text-slate-400 mt-0.5">Human oversight requirements (AEPD-style framework)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Autonomy Level *</label>
                <div className="space-y-2">
                  {AUTONOMY_LEVELS.map((lvl) => (
                    <label
                      key={lvl.value}
                      className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${
                        oversight.autonomyLevel === lvl.value ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-600 bg-slate-900/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="autonomy"
                        checked={oversight.autonomyLevel === lvl.value}
                        onChange={() => setOversight((o) => ({ ...o, autonomyLevel: lvl.value }))}
                        className="mt-1 border-slate-500 text-emerald-500"
                      />
                      <span>
                        <span className="text-sm font-medium text-white block">{lvl.title}</span>
                        <span className="text-xs text-slate-500">{lvl.body}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Higher autonomy levels require stronger evidence of compliance per AEPD February 2026 guidance.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Human Review Required For</label>
                <div className="space-y-2">
                  {REVIEW_FLAGS.map((rf) => {
                    const checked = oversight.humanReviewFor.includes(rf.id);
                    return (
                      <label key={rf.id} className="flex gap-2 items-start text-sm text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setOversight((o) => ({
                              ...o,
                              humanReviewFor: checked
                                ? o.humanReviewFor.filter((x) => x !== rf.id)
                                : [...o.humanReviewFor, rf.id],
                            }))
                          }
                          className="mt-0.5 rounded border-slate-500 text-emerald-500"
                        />
                        {rf.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="p-4 rounded-lg border border-slate-600 bg-slate-900/40">
                <p className="text-xs text-slate-500 mb-3">
                  A Data Protection Impact Assessment is recommended when processing special category data or operating at Level 3–4
                  autonomy.
                </p>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oversight.dpiaDone}
                    onChange={(e) => setOversight((o) => ({ ...o, dpiaDone: e.target.checked }))}
                    className="rounded border-slate-500 text-emerald-500"
                  />
                  DPIA completed
                </label>
                {oversight.dpiaDone && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-500">Date</label>
                    <input
                      type="date"
                      value={oversight.dpiaDate}
                      onChange={(e) => setOversight((o) => ({ ...o, dpiaDate: e.target.value }))}
                      className="mt-1 block w-full sm:w-auto px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Review & Confirm</h3>
                <p className="text-sm text-slate-400 mt-0.5">Review the agent policy before registering</p>
              </div>
              <SummaryCard title="Agent Identity" icon={<Shield className="w-4 h-4 text-emerald-400" />}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500 text-xs">Name</dt>
                    <dd className="text-white">{identity.name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 text-xs">Version</dt>
                    <dd className="text-white">{identity.version}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 text-xs">Description</dt>
                    <dd className="text-slate-200 whitespace-pre-wrap">{identity.description || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 text-xs">Endpoint</dt>
                    <dd className="text-slate-300 font-mono text-xs">{identity.url || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 text-xs">Provider / Owner</dt>
                    <dd className="text-slate-200">{identity.providerOrg || '—'}</dd>
                  </div>
                </dl>
              </SummaryCard>
              <SummaryCard title="Data Policy" icon={<Key className="w-4 h-4 text-blue-400" />}>
                <p className="text-xs text-slate-500 mb-2">
                  Categories: {dataPolicy.categories.join(', ') || '—'}
                </p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{dataPolicy.processingPurpose}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Legal basis: {LEGAL_BASES.find((l) => l.value === dataPolicy.legalBasis)?.label || dataPolicy.legalBasis}
                </p>
              </SummaryCard>
              <SummaryCard title="Transfer Policy" icon={<Globe className="w-4 h-4 text-amber-400" />}>
                <p className="text-xs text-slate-500 mb-1">Destinations</p>
                <p className="text-sm text-slate-200">{transfer.countries.join(', ') || '—'}</p>
                <p className="text-xs text-slate-500 mt-3 mb-1">Partners</p>
                <ul className="text-sm text-slate-300 list-disc list-inside space-y-1">
                  {transfer.partners
                    .filter((p) => p.name.trim())
                    .map((p) => (
                      <li key={p.id}>
                        {p.name} ({SERVICE_TYPES.find((s) => s.value === p.serviceType)?.label}) — DPA: {p.hasDpa ? 'yes' : 'no'}
                      </li>
                    ))}
                </ul>
                {transfer.partners.filter((p) => p.name.trim()).some((p) => partnerSccHint(p)?.needsScc && !partnerSccHint(p)?.registered) && (
                  <p className="text-xs text-amber-400 mt-2 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    SCC registration may be required for one or more partners — see Transfer step.
                  </p>
                )}
              </SummaryCard>
              <SummaryCard title="Autonomy & Oversight" icon={<Info className="w-4 h-4 text-violet-400" />}>
                <p className="text-sm text-slate-200">
                  {AUTONOMY_LEVELS.find((a) => a.value === oversight.autonomyLevel)?.title}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Human review: {oversight.humanReviewFor.length ? oversight.humanReviewFor.join(', ') : 'None selected'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  DPIA: {oversight.dpiaDone ? `Yes — ${oversight.dpiaDate || 'no date'}` : 'Not declared'}
                </p>
              </SummaryCard>
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-600 text-xs text-slate-400 leading-relaxed">
                By registering this agent, you confirm that the declared policy reflects the actual processing activities and that
                appropriate legal bases and safeguards are in place. This registration creates an immutable record under{' '}
                <GdprA href={GDPR.art30}>GDPR Art. 30</GdprA>.
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-5 border-t border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2 justify-end">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step < 5 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submitRegister}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Registering…' : 'Register Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  input,
}: {
  label: string;
  help: React.ReactNode;
  input: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1">{label}</label>
      {input}
      <p className="text-[11px] text-slate-500 mt-1.5">{help}</p>
    </div>
  );
}

function SummaryCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      {children}
    </div>
  );
}
