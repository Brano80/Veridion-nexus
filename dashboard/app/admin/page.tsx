'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '../components/DashboardLayout';
import {
  Users, Clock, ArrowUpCircle, RefreshCw, Trash2,
  Plus, Search, Shield, Activity, X, AlertTriangle,
} from 'lucide-react';
import { getCurrentUser, isAdmin, CurrentUser } from '../utils/api';

interface Tenant {
  id: string;
  name: string;
  plan: string;
  mode: string;
  api_key_prefix: string;
  is_admin: boolean;
  trial_expires_at: string | null;
  trial_status: string;
  rate_limit_per_minute: number;
  evaluations_24h: number;
  created_at: string;
  deleted_at: string | null;
}

const PROXY = '/api/admin-proxy';

async function adminFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${PROXY}/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  // Admin panel should never show trial expired modal (admin tenant never expires)
  // But we still check for 402 to handle edge cases gracefully
  if (res.status === 402) {
    console.warn('Admin tenant received 402 - this should not happen');
  }
  return res;
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

const nextPlan: Record<string, string> = {
  free_trial: 'pro',
  pro: 'enterprise',
};

function isExpiringSoon(tenant: Tenant): boolean {
  if (!tenant.trial_expires_at) return false;
  const daysLeft = (new Date(tenant.trial_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysLeft <= 7 && daysLeft > 0;
}

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterMode, setFilterMode] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', plan: 'free_trial', mode: 'shadow', trial_days: 30 });
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [rotateTarget, setRotateTarget] = useState<Tenant | null>(null);
  const [rotating, setRotating] = useState(false);

  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Check admin status via frontend user context first
  // setCheckingAuth(false) before auth check so loadTenants can run; avoid redirect before user loads
  useEffect(() => {
    getCurrentUser().then((user) => {
      setCurrentUser(user);
      setCheckingAuth(false);
      if (!isAdmin(user)) {
        setAuthFailed(true);
      }
    });
  }, []);

  const loadTenants = useCallback(async () => {
    // Don't load if user is not admin
    if (!isAdmin(currentUser)) {
      return;
    }

    try {
      const res = await adminFetch('tenants');
      // Only treat 403/401 as auth failures, not 500 (server errors)
      if (res.status === 403 || res.status === 401) {
        setAuthFailed(true);
        return;
      }
      if (!res.ok) {
        // For other errors, log but don't redirect
        console.error('Failed to load tenants:', res.status);
        return;
      }
      const data = await res.json();
      setTenants(data);
    } catch (error) {
      // Network errors shouldn't trigger redirect
      console.error('Failed to load tenants:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!checkingAuth && isAdmin(currentUser)) {
      loadTenants();
      const interval = setInterval(loadTenants, 30_000);
      return () => clearInterval(interval);
    }
  }, [checkingAuth, currentUser, loadTenants]);

  useEffect(() => {
    if (!checkingAuth && !isAdmin(currentUser)) {
      const t = setTimeout(() => router.push('/?error=admin_access_required'), 0);
      return () => clearTimeout(t);
    }
  }, [checkingAuth, currentUser, router]);

  useEffect(() => {
    if (successBanner) {
      const t = setTimeout(() => setSuccessBanner(null), 8000);
      return () => clearTimeout(t);
    }
  }, [successBanner]);

  const filtered = tenants.filter((t) => {
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPlan !== 'all' && t.plan !== filterPlan) return false;
    if (filterMode !== 'all' && t.mode !== filterMode) return false;
    return true;
  });

  const totalTenants = tenants.length;
  const activeTrials = tenants.filter((t) => t.plan === 'free_trial' && t.trial_status === 'active').length;
  const proTenants = tenants.filter((t) => t.plan === 'pro').length;
  const totalEvals = tenants.reduce((sum, t) => sum + t.evaluations_24h, 0);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await adminFetch('tenants', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessBanner(`Tenant created. API key prefix: ${data.api_key_prefix} — share the full key securely.`);
        setShowCreateModal(false);
        setCreateForm({ name: '', plan: 'free_trial', mode: 'shadow', trial_days: 30 });
        await loadTenants();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminFetch(`tenants/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadTenants();
    } finally {
      setDeleting(false);
    }
  }

  async function handleRotate() {
    if (!rotateTarget) return;
    setRotating(true);
    try {
      const res = await adminFetch(`tenants/${rotateTarget.id}/rotate-api-key`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSuccessBanner(`API key rotated for ${rotateTarget.name}. New prefix: ${data.api_key_prefix}`);
        setRotateTarget(null);
        await loadTenants();
      }
    } finally {
      setRotating(false);
    }
  }

  async function handleExtendTrial(tenant: Tenant) {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);
    await adminFetch(`tenants/${tenant.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ trial_expires_at: newExpiry.toISOString() }),
    });
    await loadTenants();
  }

  async function handleUpgradePlan(tenant: Tenant) {
    const next = nextPlan[tenant.plan];
    if (!next) return;
    await adminFetch(`tenants/${tenant.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan: next }),
    });
    await loadTenants();
  }

  if (checkingAuth || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-slate-400 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {checkingAuth ? 'Verifying admin access...' : 'Loading tenants...'}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">TENANT MANAGEMENT</h1>
          <span className="inline-block mt-2 text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
            Internal — Admin access only
          </span>
        </div>

        {/* Success Banner */}
        {successBanner && (
          <div className="bg-emerald-900/30 border border-emerald-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-emerald-400 text-sm">{successBanner}</span>
            <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-emerald-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">TOTAL TENANTS</div>
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">{totalTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Active (non-deleted)</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">ACTIVE TRIALS</div>
              <Clock className="w-4 h-4 text-yellow-500" />
            </div>
            <div className={`text-2xl font-bold ${activeTrials === 0 ? 'text-slate-400' : 'text-yellow-400'}`}>{activeTrials}</div>
            <div className="text-xs text-slate-500 mt-1">Free trial, not expired</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">PRO TENANTS</div>
              <Shield className="w-4 h-4 text-emerald-500" />
            </div>
            <div className={`text-2xl font-bold ${proTenants === 0 ? 'text-slate-400' : 'text-emerald-400'}`}>{proTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Paid plans</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">EVALUATIONS (24H)</div>
              <Activity className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white">{totalEvals}</div>
            <div className="text-xs text-slate-500 mt-1">All tenants combined</div>
          </div>
        </div>

        {/* Filters & Actions Bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Plans</option>
            <option value="free_trial">Free Trial</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Modes</option>
            <option value="shadow">Shadow</option>
            <option value="enforce">Enforce</option>
          </select>
          <div className="flex-1" />
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Tenant
          </button>
        </div>

        {/* Tenant Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Plan</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Mode</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Trial Status</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Evals (24h)</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">API Key Prefix</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Created</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    {tenants.length === 0 ? 'No tenants found' : 'No tenants match filters'}
                  </td>
                </tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-white font-medium">
                    {t.name}
                    {t.is_admin && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800">
                        ADMIN
                      </span>
                    )}
                    {isExpiringSoon(t) && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded ml-2">
                        Expiring soon
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded border ${planBadge[t.plan] || 'text-slate-400'}`}>
                      {t.plan.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded border ${modeBadge[t.mode] || 'text-slate-400'}`}>
                      {t.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded border ${trialBadge[t.trial_status] || 'text-slate-400'}`}>
                      {t.trial_status}
                    </span>
                    {t.trial_expires_at && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        {new Date(t.trial_expires_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-white tabular-nums">{t.evaluations_24h}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{t.api_key_prefix}...</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleExtendTrial(t)}
                        title="Extend trial +30 days"
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-yellow-400 transition-colors"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      {nextPlan[t.plan] && (
                        <button
                          onClick={() => handleUpgradePlan(t)}
                          title={`Upgrade to ${nextPlan[t.plan]}`}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setRotateTarget(t)}
                        title="Rotate API key"
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        disabled={t.is_admin}
                        title={t.is_admin ? 'Cannot delete admin tenant' : 'Delete tenant'}
                        className={`p-1.5 rounded transition-colors ${
                          t.is_admin
                            ? 'text-slate-600 cursor-not-allowed'
                            : 'hover:bg-slate-700 text-slate-400 hover:text-red-400'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Create New Tenant</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-600"
                  placeholder="Company name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Plan</label>
                  <select
                    value={createForm.plan}
                    onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-600"
                  >
                    <option value="free_trial">Free Trial</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Mode</label>
                  <select
                    value={createForm.mode}
                    onChange={(e) => setCreateForm({ ...createForm, mode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-600"
                  >
                    <option value="shadow">Shadow</option>
                    <option value="enforce">Enforce</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Trial days (0 = no expiry)</label>
                <input
                  type="number"
                  value={createForm.trial_days}
                  onChange={(e) => setCreateForm({ ...createForm, trial_days: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-600"
                  min={0}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name.trim() || creating}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {creating ? 'Creating...' : 'Create Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-bold text-white">Delete Tenant</h2>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              Delete <strong className="text-white">{deleteTarget.name}</strong>? This will soft-delete the tenant. Their data is retained.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotate API Key Confirmation Modal */}
      {rotateTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Rotate API Key</h2>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              Rotate API key for <strong className="text-white">{rotateTarget.name}</strong>? The old key will stop working immediately.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setRotateTarget(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                disabled={rotating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {rotating ? 'Rotating...' : 'Rotate Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
