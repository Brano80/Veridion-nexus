'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { fetchTransferRecords, TransferRecord } from '@/app/lib/acm-api';
import { ArrowRight, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { COUNTRY_NAMES } from '../../config/countries';

const MECHANISM_LABELS: Record<string, { label: string; color: string }> = {
  adequacy:   { label: 'Adequacy',   color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25' },
  scc:        { label: 'SCC',        color: 'text-blue-400 bg-blue-500/15 border-blue-500/25' },
  bcr:        { label: 'BCR',        color: 'text-purple-400 bg-purple-500/15 border-purple-500/25' },
  dpf:        { label: 'DPF',        color: 'text-amber-400 bg-amber-500/15 border-amber-500/25' },
  derogation: { label: 'Derogation', color: 'text-orange-400 bg-orange-500/15 border-orange-500/25' },
  blocked:    { label: 'Blocked',    color: 'text-red-400 bg-red-500/15 border-red-500/25' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase();
}

export default function TransfersPage() {
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRecords();
    const interval = setInterval(loadRecords, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadRecords() {
    try {
      const data = await fetchTransferRecords();
      setRecords(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.destination_country.toLowerCase().includes(q) ||
      r.origin_country.toLowerCase().includes(q) ||
      (r.agent_name || '').toLowerCase().includes(q) ||
      r.transfer_mechanism.toLowerCase().includes(q) ||
      countryName(r.destination_country).toLowerCase().includes(q)
    );
  });

  const schremsCount = records.filter((r) => r.schrems_iii_risk).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">ACM Transfers</h1>
          <p className="text-xs text-slate-500">
            GDPR Art. 44–49 — cross-border data transfer records created by the ACM proxy
          </p>
          <p className="text-sm text-slate-400 mt-2">
            {records.length} transfer{records.length !== 1 ? 's' : ''}
            {schremsCount > 0 && (
              <span className="text-red-400"> · {schremsCount} Schrems III risk</span>
            )}
          </p>
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="Filter by country, agent, mechanism…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-700"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="w-12 h-12 text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-1">No Transfers Found</h2>
            <p className="text-slate-400">
              {search ? 'No transfers match your search.' : 'No cross-border data transfers have been recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-slate-400">
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Mechanism</th>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Data Categories</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filtered.map((r) => {
                    const mech = MECHANISM_LABELS[r.transfer_mechanism] || {
                      label: r.transfer_mechanism,
                      color: 'text-slate-400 bg-slate-700 border-slate-600',
                    };
                    const destCode = r.destination_country.toUpperCase();
                    const originCode = r.origin_country.toUpperCase();

                    return (
                      <tr key={r.transfer_id} className="hover:bg-slate-750 transition-colors">
                        {/* Route */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-white">
                            {originCode.length === 2 && (
                              <img
                                src={`https://flagcdn.com/16x12/${originCode.toLowerCase()}.png`}
                                alt=""
                                className="w-4 h-3 object-cover rounded-sm"
                              />
                            )}
                            <span>{originCode}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            {destCode.length === 2 && (
                              <img
                                src={`https://flagcdn.com/16x12/${destCode.toLowerCase()}.png`}
                                alt=""
                                className="w-4 h-3 object-cover rounded-sm"
                              />
                            )}
                            <span>{countryName(destCode)}</span>
                          </div>
                        </td>
                        {/* Mechanism */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${mech.color}`}>
                            {mech.label}
                          </span>
                        </td>
                        {/* Agent */}
                        <td className="px-4 py-3 text-slate-300 truncate max-w-[160px]">
                          {r.agent_name || r.agent_id || '—'}
                        </td>
                        {/* Data categories */}
                        <td className="px-4 py-3 text-slate-400 max-w-[200px]">
                          {Array.isArray(r.data_categories) && r.data_categories.length > 0
                            ? r.data_categories.join(', ')
                            : '—'}
                        </td>
                        {/* Risk */}
                        <td className="px-4 py-3">
                          {r.schrems_iii_risk ? (
                            <span className="flex items-center gap-1 text-red-400">
                              <AlertTriangle className="w-3 h-3" />
                              Schrems III
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle className="w-3 h-3" />
                              OK
                            </span>
                          )}
                        </td>
                        {/* Timestamp */}
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {formatDate(r.transfer_timestamp || r.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
