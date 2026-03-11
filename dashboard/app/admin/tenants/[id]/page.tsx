'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '../../../components/DashboardLayout';
import {
  ArrowLeft, User, Activity, ArrowRightLeft, FileText, ClipboardCheck,
  RefreshCw, AlertTriangle,
} from 'lucide-react';
import { getCurrentUser, isAdmin, getAuthHeaders } from '../../../utils/api';

const PROXY = '/api/admin-proxy';

async function adminFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${PROXY}/${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (res.status === 402) {
    console.warn('Admin tenant received 402 - this should not happen');
  }
  return res;
}

interface TenantDetail {
  account: {
    name: string;
    plan: string;
    mode: string;
    trialStatus: string;
    trialExpiry: string | null;
    createdAt: string;
    apiKeyPrefix: string;
  };
  activity: {
    evalsThisMonth: number;
    evalsTotal: number;
    lastActivityAt: string | null;
  };
  transferSummary: {
    total: number;
    blocked: number;
    allowed: number;
    pendingReview: number;
  };
  sccRegistry: Array<{
    partnerName: string;
    country: string;
    expiry: string | null;
    module: string | null;
  }>;
  reviewQueue: {
    pendingCount: number;
    overdueCount: number;
  };
}

const planBadge: Record<string, string> = {
  free_trial: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  pro: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  enterprise: 'bg-blue-900/40 text-blue-400 border-blue-800',
};

const modeBadge: Record<string, string> = {
  shadow: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  enforce: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
};

const trialBadge: Record<string, string> = {
  active: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  expired: 'bg-red-900/40 text-red-400 border-red-800',
};

export default function TenantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    getCurrentUser().then((user) => {
      setCheckingAuth(false);
      if (!isAdmin(user)) {
        router.push('/?error=admin_access_required');
      }
    });
  }, [router]);

  useEffect(() => {
    if (!id || checkingAuth) return;

    async function load() {
      try {
        const res = await adminFetch(`tenants/${id}`);
        if (res.status === 403 || res.status === 401) {
          router.push('/?error=admin_access_required');
          return;
        }
        if (!res.ok) {
          if (res.status === 404) {
            setError('Tenant not found');
          } else {
            const err = await res.text().catch(() => 'Unknown error');
            setError(err);
          }
          setLoading(false);
          return;
        }
        const data = await res.json();
        setDetail(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load tenant');
      } finally {
        setLoading(false);
      }
    }

    if (!checkingAuth) {
      load();
    }
  }, [id, checkingAuth, router]);

  if (checkingAuth || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-slate-400 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {checkingAuth ? 'Verifying admin access...' : 'Loading tenant...'}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !detail) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </Link>
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error || 'Tenant not found'}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const { account, activity, transferSummary, sccRegistry, reviewQueue } = detail;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">{account.name}</h1>
              <span className="text-xs text-slate-500">Tenant detail</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Account */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Account</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="text-white font-medium">{account.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Plan</dt>
                <dd>
                  <span className={`text-xs px-2 py-1 rounded border ${planBadge[account.plan] || 'text-slate-400'}`}>
                    {account.plan.replace('_', ' ')}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Mode</dt>
                <dd>
                  <span className={`text-xs px-2 py-1 rounded border ${modeBadge[account.mode] || 'text-slate-400'}`}>
                    {account.mode}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Trial status</dt>
                <dd>
                  <span className={`text-xs px-2 py-1 rounded border ${trialBadge[account.trialStatus] || 'text-slate-400'}`}>
                    {account.trialStatus}
                  </span>
                  {account.trialExpiry && (
                    <span className="ml-2 text-slate-400 text-xs">
                      Expires {new Date(account.trialExpiry).toLocaleDateString()}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-300">{new Date(account.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">API key prefix</dt>
                <dd className="font-mono text-slate-300">{account.apiKeyPrefix}...</dd>
              </div>
            </dl>
          </div>

          {/* Activity */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Activity</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Evals this month</dt>
                <dd className="text-white font-medium tabular-nums">{activity.evalsThisMonth}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Evals total</dt>
                <dd className="text-white font-medium tabular-nums">{activity.evalsTotal}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last activity</dt>
                <dd className="text-slate-300">
                  {activity.lastActivityAt
                    ? new Date(activity.lastActivityAt).toLocaleString()
                    : '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Transfer Summary */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRightLeft className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Transfer Summary</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-slate-500 text-xs mb-1">Total</dt>
                <dd className="text-white font-medium tabular-nums">{transferSummary.total}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs mb-1">Blocked</dt>
                <dd className="text-red-400 font-medium tabular-nums">{transferSummary.blocked}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs mb-1">Allowed</dt>
                <dd className="text-emerald-400 font-medium tabular-nums">{transferSummary.allowed}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs mb-1">Pending review</dt>
                <dd className="text-yellow-400 font-medium tabular-nums">{transferSummary.pendingReview}</dd>
              </div>
            </div>
          </div>

          {/* Review Queue */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Review Queue</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Pending items</dt>
                <dd className="text-white font-medium tabular-nums">{reviewQueue.pendingCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Overdue</dt>
                <dd className={`font-medium tabular-nums ${reviewQueue.overdueCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {reviewQueue.overdueCount}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* SCC Registry */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">SCC Registry</h2>
            <span className="text-slate-500 text-sm">(active)</span>
          </div>
          {sccRegistry.length === 0 ? (
            <p className="text-slate-500 text-sm">No active SCCs</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Partner</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Country</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Expiry</th>
                    <th className="text-left px-4 py-2 text-slate-400 font-medium">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {sccRegistry.map((scc, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="px-4 py-3 text-white">{scc.partnerName}</td>
                      <td className="px-4 py-3 text-slate-300">{scc.country}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {scc.expiry ? new Date(scc.expiry).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{scc.module || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
