'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '../components/DashboardLayout';
import { fetchAcmStats, AcmStats } from '@/app/lib/acm-api';
import { Activity, AlertTriangle, ArrowRightLeft, Eye, ShieldCheck, TrendingDown } from 'lucide-react';

export default function AcmOverviewPage() {
  const [stats, setStats] = useState<AcmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const data = await fetchAcmStats();
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">ACM Overview</h1>
          <p className="text-xs text-slate-500">
            Agent Compliance Manager — EU AI Act Art. 12 logging · Art. 14 human oversight · GDPR Art. 44–49 transfers
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading…</div>
        ) : error ? (
          <div className="py-12 text-center text-red-400">{error}</div>
        ) : stats ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                icon={Eye}
                label="Pending Oversight"
                value={stats.oversight_pending}
                href="/acm/oversight?status=pending"
                accent={stats.oversight_pending > 0 ? 'amber' : 'emerald'}
              />
              <StatCard
                icon={ShieldCheck}
                label="Decided Reviews"
                value={stats.oversight_decided}
                href="/acm/oversight?status=decided"
                accent="slate"
              />
              <StatCard
                icon={ArrowRightLeft}
                label="Total Transfers"
                value={stats.transfers_total}
                href="/acm/transfers"
                accent="slate"
              />
              <StatCard
                icon={AlertTriangle}
                label="Schrems III Risk"
                value={stats.transfers_schrems_risk}
                href="/acm/transfers"
                accent={stats.transfers_schrems_risk > 0 ? 'red' : 'emerald'}
              />
              <StatCard
                icon={Activity}
                label="Tool Call Events"
                value={stats.tool_call_events_total}
                accent="slate"
              />
              <StatCard
                icon={TrendingDown}
                label="Degraded Sessions"
                value={stats.trust_degraded_sessions}
                accent={stats.trust_degraded_sessions > 0 ? 'amber' : 'emerald'}
              />
            </div>

            {/* Quick actions */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/acm/oversight?status=pending"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-colors"
                >
                  Review Pending Oversight ({stats.oversight_pending})
                </Link>
                <Link
                  href="/acm/transfers"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 transition-colors"
                >
                  View All Transfers
                </Link>
              </div>
            </div>

            {/* Regulatory context */}
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Regulatory Mapping</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <span className="text-emerald-400 font-medium">EU AI Act Art. 12</span> — Tool call event logging with hash-chain integrity
                </div>
                <div>
                  <span className="text-emerald-400 font-medium">EU AI Act Art. 14</span> — Human oversight of AI-assisted decisions (Oversight Queue)
                </div>
                <div>
                  <span className="text-emerald-400 font-medium">GDPR Art. 44–49</span> — Cross-border data transfer records &amp; legal basis tracking
                </div>
                <div>
                  <span className="text-emerald-400 font-medium">Schrems III</span> — DPF-reliant transfers without backup mechanism flagged
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  accent = 'slate',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href?: string;
  accent?: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const accentClasses = {
    emerald: 'border-emerald-800/50 text-emerald-400',
    amber: 'border-amber-800/50 text-amber-400',
    red: 'border-red-800/50 text-red-400',
    slate: 'border-slate-700 text-slate-300',
  };

  const content = (
    <div className={`bg-slate-800 border rounded-lg p-4 ${accentClasses[accent]} ${href ? 'hover:bg-slate-750 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 opacity-60" />
        <span className="text-2xl font-bold">{value.toLocaleString()}</span>
      </div>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export const dynamic = 'force-dynamic';
