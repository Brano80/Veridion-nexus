'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { fetchEvidenceEventsWithMeta, EvidenceEvent } from '../utils/api';
import { Cpu, AlertTriangle, RefreshCw } from 'lucide-react';

interface AgentInfo {
  name: string;
  totalTransfers: number;
  lastActivity: string;
  allowCount: number;
  reviewCount: number;
  blockCount: number;
  isActive: boolean;
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildAgents(events: EvidenceEvent[]): AgentInfo[] {
  const map = new Map<string, AgentInfo>();
  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const e of events) {
    const source = (e.sourceSystem || e.source_system || '').trim();
    if (!source) continue;

    let agent = map.get(source);
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
      map.set(source, agent);
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

  for (const agent of map.values()) {
    if (agent.lastActivity) {
      agent.isActive = new Date(agent.lastActivity).getTime() > twentyFourHoursAgo;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.totalTransfers - a.totalTransfers;
  });
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAgents() {
    try {
      const { events } = await fetchEvidenceEventsWithMeta({ limit: 5000 });
      setAgents(buildAgents(events));
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAgents();
    setRefreshing(false);
  }

  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.isActive).length;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-emerald-400" />
              Agents
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              AI agents and systems interacting with Sovereign Shield
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">Unregistered agents detected</p>
              <p className="text-xs text-slate-400 mt-1">
                Register your agents to enforce per-agent data policies and generate A2A-compatible compliance documentation.
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-white">{totalAgents}</div>
            <div className="text-xs text-slate-400 mt-1">Agents Detected</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-400">{activeAgents}</div>
            <div className="text-xs text-slate-400 mt-1">Active (last 24h)</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-amber-400">{totalAgents}</div>
            <div className="text-xs text-slate-400 mt-1">Unregistered</div>
          </div>
        </div>

        {/* Agent Cards */}
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No agents detected yet.</p>
            <p className="text-sm text-slate-500 mt-1">Send transfers through the API to see agents appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="bg-slate-800 border border-slate-700 rounded-lg p-5 flex flex-col gap-4"
              >
                {/* Top row: name + status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{agent.name}</div>
                      <div className="text-xs text-slate-500">
                        Last active: {agent.lastActivity ? formatTimeAgo(agent.lastActivity) : '—'}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                    agent.isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/25'
                  }`}>
                    {agent.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-400">
                    <span className="text-white font-semibold">{agent.totalTransfers}</span> transfers
                  </div>
                  <div className="flex items-center gap-1.5">
                    {agent.allowCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        {agent.allowCount} ALLOW
                      </span>
                    )}
                    {agent.reviewCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        {agent.reviewCount} REVIEW
                      </span>
                    )}
                    {agent.blockCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                        {agent.blockCount} BLOCK
                      </span>
                    )}
                  </div>
                </div>

                {/* Register button */}
                <div className="pt-2 border-t border-slate-700">
                  <button
                    disabled
                    title="Coming soon"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-500 cursor-not-allowed"
                  >
                    Register Agent
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
