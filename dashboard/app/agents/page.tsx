'use client';

/**
 * Agents page — redesigned (ACM / Sovereign Shield design system).
 * Data merge logic matches Veridion evidence event types and INTERNAL_SOURCES filtering.
 */

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { Cpu, RefreshCw, Plus, Shield, Activity, Users, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/app/components/DashboardLayout';
import RegisterAgentModal from '@/app/agents/RegisterAgentModal';
import AgentDetailPanel from '@/app/components/AgentDetailPanel';
import {
  fetchEvidenceEventsWithMeta,
  fetchAgents,
  rotateAgentKey,
  deleteAgent,
  EvidenceEvent,
  type AgentCard,
} from '@/app/utils/api';

const INTERNAL_SOURCES = ['human-oversight', 'sovereign-shield'];

export interface AgentInfo {
  name: string;
  agentId?: string;
  totalTransfers: number;
  lastActivity: string;
  allowCount: number;
  reviewCount: number;
  blockCount: number;
  isActive: boolean;
  card?: Record<string, unknown>;
}

function buildStatsFromEvents(events: EvidenceEvent[]): Map<string, AgentInfo> {
  const map = new Map<string, AgentInfo>();

  for (const e of events) {
    const source = (e.sourceSystem || '').trim();
    if (!source || INTERNAL_SOURCES.includes(source.toLowerCase())) continue;

    let agent = map.get(source.toLowerCase());
    if (!agent) {
      agent = {
        name: source,
        totalTransfers: 0,
        lastActivity: '',
        allowCount: 0,
        reviewCount: 0,
        blockCount: 0,
        isActive: false,
      };
      map.set(source.toLowerCase(), agent);
    }

    agent.totalTransfers++;

    const ts = e.occurredAt || e.createdAt || '';
    if (ts && (!agent.lastActivity || new Date(ts) > new Date(agent.lastActivity))) {
      agent.lastActivity = ts;
    }

    const et = (e.eventType || '').toUpperCase();
    if (et.includes('BLOCKED') || et.includes('REJECTED')) {
      agent.blockCount++;
    } else if (et.includes('REVIEW')) {
      agent.reviewCount++;
    } else {
      agent.allowCount++;
    }
  }

  return map;
}

function mergeAgents(events: EvidenceEvent[], registeredCards: AgentCard[]): AgentInfo[] {
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const statsMap = buildStatsFromEvents(events);
  const statsByAgentId = new Map<string, AgentInfo>();
  for (const e of events) {
    const agentId = e.payload?.agent_id || e.payload?.agentId;
    if (!agentId) continue;
    const source = (e.sourceSystem || '').trim();
    if (!source || INTERNAL_SOURCES.includes(source.toLowerCase())) continue;
    const stats = statsMap.get(source.toLowerCase());
    if (stats) {
      const existing = statsByAgentId.get(agentId);
      if (!existing || stats.totalTransfers > (existing?.totalTransfers ?? 0)) {
        statsByAgentId.set(agentId, { ...stats });
      }
    }
  }
  const merged = new Map<string, AgentInfo>();
  const registeredNames = new Set<string>();

  for (const card of registeredCards) {
    const agentId = card['x-veridion']?.agent_id;
    const key = agentId ?? card.name.toLowerCase().trim();
    registeredNames.add(card.name.toLowerCase().trim());
    let stats = statsMap.get(card.name.toLowerCase().trim());
    if (!stats && agentId) {
      const byId = statsByAgentId.get(agentId);
      if (byId) stats = byId;
    }
    merged.set(key, {
      name: card.name,
      agentId,
      totalTransfers: stats?.totalTransfers ?? 0,
      lastActivity: stats?.lastActivity ?? '',
      allowCount: stats?.allowCount ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
      blockCount: stats?.blockCount ?? 0,
      isActive: true,
      card: card as unknown as Record<string, unknown>,
    });
  }

  for (const [key, stats] of statsMap) {
    if (registeredNames.has(key)) continue;
    stats.isActive = stats.lastActivity
      ? new Date(stats.lastActivity).getTime() > twentyFourHoursAgo
      : false;
    merged.set(`_unreg:${key}`, stats);
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.totalTransfers - a.totalTransfers;
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'slate',
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const accentClasses: Record<string, string> = {
    emerald: 'border-emerald-800/50 text-emerald-400',
    amber: 'border-amber-800/50 text-amber-400',
    red: 'border-red-800/50 text-red-400',
    slate: 'border-slate-700 text-slate-300',
  };

  return (
    <div className={`bg-slate-800 border rounded-lg p-4 ${accentClasses[accent]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 opacity-60" />
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function AgentListCard({
  agent,
  onClick,
}: {
  agent: AgentInfo;
  onClick: () => void;
}) {
  const xVeridion = agent.card?.['x-veridion'] as Record<string, unknown> | undefined;
  const trustLevel = xVeridion?.trust_level as number | undefined;
  const isRegistered = !!agent.agentId;
  const hasReviews = agent.reviewCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left bg-slate-800 border rounded-lg p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 hover:border-slate-500 hover:bg-slate-700/60 ${
        hasReviews ? 'border-amber-800/60' : 'border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{agent.name}</p>
            {isRegistered && (
              <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                {agent.agentId!.slice(0, 14)}…
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors text-sm">→</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
            isRegistered
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
              : 'bg-slate-700 text-slate-500 border-slate-600'
          }`}
        >
          <Shield className="w-3 h-3" />
          {isRegistered ? 'Registered' : 'Unregistered'}
        </span>

        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
            agent.isActive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-800/50'
              : 'bg-slate-700 text-slate-500 border-slate-600'
          }`}
        >
          {agent.isActive ? 'Active' : 'Inactive'}
        </span>

        {trustLevel !== undefined && trustLevel !== null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-slate-700/60 text-slate-300 border-slate-600">
            Trust {trustLevel}
          </span>
        )}

        {hasReviews && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border bg-amber-500/10 text-amber-400 border-amber-800/50">
            <AlertTriangle className="w-3 h-3" />
            {agent.reviewCount} review{agent.reviewCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    try {
      const [eventsRes, registeredRes] = await Promise.all([
        fetchEvidenceEventsWithMeta({ limit: 5000 }),
        fetchAgents(),
      ]);
      const events = eventsRes?.events ?? [];
      const regAgents = registeredRes?.agents ?? [];
      setAgents(mergeAgents(events, regAgents));
    } catch (err) {
      console.error('loadAll error:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleRotateKey = async (agentId: string): Promise<string | null> => {
    try {
      const res = await rotateAgentKey(agentId);
      const key = res?.agent_api_key ?? null;
      setRotatedKey(key);
      showToast('API key rotated — save it now.');
      return key;
    } catch {
      showToast('Key rotation failed.');
      return null;
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
      setSelectedAgent(null);
      await loadAll();
      showToast('Agent deleted.');
    } catch {
      showToast('Delete failed.');
    }
  };

  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.isActive).length;
  const registeredAgents = agents.filter((a) => !!a.agentId).length;
  const pendingReviews = agents.reduce((sum, a) => sum + a.reviewCount, 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">AI System Registry</h1>
            <p className="text-xs text-slate-500">
              Registered agents and detected AI systems across your tenant
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register Agent
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Cpu} label="Total Agents" value={totalAgents} accent="slate" />
          <StatCard
            icon={Activity}
            label="Active (24h)"
            value={activeAgents}
            accent={activeAgents > 0 ? 'emerald' : 'slate'}
          />
          <StatCard icon={Users} label="Registered" value={registeredAgents} accent="slate" />
          <StatCard
            icon={AlertTriangle}
            label="Pending Reviews"
            value={pendingReviews}
            accent={pendingReviews > 0 ? 'amber' : 'slate'}
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-slate-700 bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <Cpu className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No agents detected yet.</p>
            <p className="mt-1 text-xs text-slate-500">Register an agent or wait for activity.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentListCard
                key={agent.agentId ?? `unreg-${agent.name}`}
                agent={agent}
                onClick={() => {
                  setSelectedAgent(agent);
                  setRotatedKey(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onRotateKey={handleRotateKey}
          onDelete={handleDelete}
          rotatedKey={rotatedKey}
        />
      )}

      <RegisterAgentModal
        open={registerOpen}
        agentName=""
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => {
          setRegisterOpen(false);
          handleRefresh();
          showToast('Agent registered successfully.');
        }}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-emerald-600 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </DashboardLayout>
  );
}
