'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cpu, RefreshCw, Plus, Shield } from 'lucide-react';
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

interface AgentInfo {
  name: string;
  agentId?: string;
  totalTransfers: number;
  lastActivity: string;
  allowCount: number;
  reviewCount: number;
  blockCount: number;
  isActive: boolean;
  /** Present when the agent is registered — used for JSON panel + trust level */
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

function AgentListCard({
  agent,
  onClick,
}: {
  agent: AgentInfo;
  onClick: () => void;
}) {
  const xVeridion = agent.card?.['x-veridion'] as Record<string, unknown> | undefined;
  const rawTrust = xVeridion?.trust_level;
  const trustNum =
    typeof rawTrust === 'number' ? rawTrust : rawTrust != null ? Number(rawTrust) : NaN;
  const showTrust = Number.isFinite(trustNum) && trustNum > 0;
  const isRegistered = !!agent.agentId;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-slate-700 bg-slate-800 p-5 hover:border-slate-500 hover:bg-slate-800/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-slate-700 p-2 group-hover:bg-slate-600 transition-colors">
          <Cpu className="w-5 h-5 text-slate-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{agent.name}</p>
          {isRegistered && (
            <p className="mt-0.5 text-xs text-slate-500 font-mono truncate">
              {agent.agentId!.slice(0, 12)}…
            </p>
          )}
        </div>
        <span className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors text-lg leading-none mt-0.5">
          →
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
            isRegistered
              ? 'bg-blue-900/50 text-blue-400 border-blue-700'
              : 'bg-slate-700 text-slate-400 border-slate-600'
          }`}
        >
          <Shield className="w-3 h-3" />
          {isRegistered ? 'Registered' : 'Unregistered'}
        </span>

        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
            agent.isActive
              ? 'bg-emerald-900/50 text-emerald-400 border-emerald-700'
              : 'bg-slate-700 text-slate-400 border-slate-600'
          }`}
        >
          {agent.isActive ? 'Active' : 'Inactive'}
        </span>

        {showTrust && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-emerald-900/40 text-emerald-400 border-emerald-700">
            Trust {trustNum}
          </span>
        )}

        {agent.reviewCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border bg-yellow-900/30 text-yellow-400 border-yellow-800">
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
      const [{ events }, { agents: regAgents }] = await Promise.all([
        fetchEvidenceEventsWithMeta({ limit: 5000 }),
        fetchAgents(),
      ]);
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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-slate-400" />
            <h1 className="text-xl font-semibold text-white">Agents</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm text-white font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register Agent
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Agents', value: totalAgents },
            { label: 'Active (24h)', value: activeAgents },
            { label: 'Registered', value: registeredAgents },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-3xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-slate-700 bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-12 text-center">
            <Cpu className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No agents detected yet.</p>
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
