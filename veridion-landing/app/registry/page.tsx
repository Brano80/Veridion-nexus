'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Shield, Search, Globe, AlertTriangle, ChevronLeft, ChevronRight, Users, Database, Lock, ArrowRight } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.veridion-nexus.eu';

interface RegistryAgent {
  agent_id: string;
  name: string;
  description: string;
  version: string;
  url: string | null;
  provider: { organization: string | null; url: string | null };
  eu_ai_act: { risk_level: string; processes_personal_data: boolean; automated_decision_making: boolean };
  deployment: { environment: string | null; region: string | null; data_residency: string | null };
  listed_at: string | null;
  registered_at: string;
}

interface RegistryStats {
  total_listed: number;
  processes_personal_data: number;
  by_risk_level: { level: string; count: number }[];
  by_region: { region: string; count: number }[];
  by_data_residency: { residency: string; count: number }[];
}

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  minimal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  limited: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' },
  high: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
  unacceptable: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25' },
};

function RiskBadge({ level }: { level: string }) {
  const colors = RISK_COLORS[level] || RISK_COLORS.minimal;
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
      {level}
    </span>
  );
}

export default function RegistryPage() {
  const [agents, setAgents] = useState<RegistryAgent[]>([]);
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/public/registry/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (riskFilter) params.set('eu_ai_act_risk_level', riskFilter);
      if (regionFilter) params.set('deployment_region', regionFilter);
      params.set('page', String(page));
      params.set('limit', '12');
      const res = await fetch(`${API_URL}/api/public/registry/agents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [query, riskFilter, regionFilter, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchAgents();
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
            <Shield className="w-3.5 h-3.5" />
            EU AI Act Art. 12 &bull; GDPR Art. 30
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            AI Agent Compliance Registry
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Discover AI agents with verified compliance profiles. Search by risk classification,
            data residency, and regulatory status.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
              <Users className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.total_listed}</div>
              <div className="text-xs text-slate-400">Registered Agents</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
              <Database className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.processes_personal_data}</div>
              <div className="text-xs text-slate-400">Process Personal Data</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
              <Globe className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.by_region.length}</div>
              <div className="text-xs text-slate-400">Deployment Regions</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
              <Lock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-white">{stats.by_risk_level.find(r => r.level === 'high')?.count || 0}</div>
              <div className="text-xs text-slate-400">High-Risk Systems</div>
            </div>
          </div>
        )}

        {/* Search + Filters */}
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents by name, provider, or description..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <select
            value={riskFilter}
            onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Risk Levels</option>
            <option value="minimal">Minimal</option>
            <option value="limited">Limited</option>
            <option value="high">High</option>
            <option value="unacceptable">Unacceptable</option>
          </select>
          <select
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Regions</option>
            <option value="EU">EU</option>
            <option value="US">US</option>
            <option value="APAC">APAC</option>
          </select>
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>

        {/* Results */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Loading registry...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 bg-slate-800 border border-slate-700 rounded-lg">
            <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No agents found</h3>
            <p className="text-slate-400 text-sm mb-6">
              {query || riskFilter || regionFilter
                ? 'Try adjusting your search filters.'
                : 'Be the first to list your AI agent in the public compliance registry.'}
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              Register Your Agent <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-4">{total} agent{total !== 1 ? 's' : ''} found</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {agents.map((agent) => (
                <Link
                  key={agent.agent_id}
                  href={`/registry/${agent.agent_id}`}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-5 hover:border-emerald-500/40 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                        {agent.name}
                      </h3>
                      {agent.provider.organization && (
                        <p className="text-xs text-slate-500 mt-0.5">{agent.provider.organization}</p>
                      )}
                    </div>
                    <RiskBadge level={agent.eu_ai_act.risk_level} />
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{agent.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {agent.deployment.data_residency && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {agent.deployment.data_residency}
                      </span>
                    )}
                    {agent.eu_ai_act.processes_personal_data && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Personal data
                      </span>
                    )}
                    <span className="ml-auto">v{agent.version}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span className="text-sm text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <div className="mt-16 text-center bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-10">
          <h2 className="text-2xl font-bold text-white mb-3">Register Your AI Agent</h2>
          <p className="text-slate-400 mb-6 max-w-lg mx-auto">
            Get a public compliance profile, EU AI Act classification, and make your agent
            discoverable to DPOs and compliance officers across the EU.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-medium transition-colors"
          >
            Get Started — Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Veridion Nexus. EU AI Act &bull; GDPR Art. 44-49 Compliance.</p>
      </footer>
    </div>
  );
}
