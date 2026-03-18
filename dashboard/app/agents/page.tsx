'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { fetchEvidenceEventsWithMeta, fetchAgents, rotateAgentKey, EvidenceEvent, AgentCard } from '../utils/api';
import { Cpu, AlertTriangle, RefreshCw, Shield, X, FileText, Eye, Plus, Key, Copy } from 'lucide-react';
import RegisterAgentModal from './RegisterAgentModal';

const INTERNAL_SOURCES = ['human-oversight', 'sovereign-shield'];

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
  const merged = new Map<string, AgentInfo>();

  // Add all registered agents first (by name, case-insensitive key)
  for (const card of registeredCards) {
    const key = card.name.toLowerCase();
    const stats = statsMap.get(key);
    merged.set(key, {
      name: card.name,
      totalTransfers: stats?.totalTransfers ?? 0,
      lastActivity: stats?.lastActivity ?? '',
      allowCount: stats?.allowCount ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
      blockCount: stats?.blockCount ?? 0,
      isActive: stats?.lastActivity ? new Date(stats.lastActivity).getTime() > twentyFourHoursAgo : false,
    });
  }

  // Add unregistered agents from events that aren't already in the map
  for (const [key, stats] of statsMap) {
    if (!merged.has(key)) {
      stats.isActive = stats.lastActivity ? new Date(stats.lastActivity).getTime() > twentyFourHoursAgo : false;
      merged.set(key, stats);
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.totalTransfers - a.totalTransfers;
  });
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerModalName, setRegisterModalName] = useState('');
  const [toast, setToast] = useState('');
  const [cardPanel, setCardPanel] = useState<AgentCard | null>(null);
  const [rotatedKey, setRotatedKey] = useState('');
  const [rotatedKeyCopied, setRotatedKeyCopied] = useState(false);
  const [rotating, setRotating] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [{ events }, { agents: regAgents }] = await Promise.all([
        fetchEvidenceEventsWithMeta({ limit: 5000 }),
        fetchAgents(),
      ]);
      setRegisteredAgents(regAgents);
      setAgents(mergeAgents(events, regAgents));
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  function handleRegisterSuccess() {
    setToast('Agent registered successfully');
    loadAll();
    setTimeout(() => setToast(''), 4000);
  }

  async function handleRotateKey(agentId: string) {
    if (!confirm('This will invalidate the current API key. Continue?')) return;
    setRotating(agentId);
    try {
      const result = await rotateAgentKey(agentId);
      setRotatedKey(result.agent_api_key);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Key rotation failed');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setRotating(null);
    }
  }

  async function copyRotatedKey() {
    try {
      await navigator.clipboard.writeText(rotatedKey);
      setRotatedKeyCopied(true);
      setTimeout(() => setRotatedKeyCopied(false), 2000);
    } catch { /* ignore */ }
  }

  function isRegistered(agentName: string): boolean {
    return registeredAgents.some(r => r.name.toLowerCase() === agentName.toLowerCase());
  }

  function getRegisteredCard(agentName: string): AgentCard | undefined {
    return registeredAgents.find(r => r.name.toLowerCase() === agentName.toLowerCase());
  }

  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.isActive).length;
  const registeredCount = registeredAgents.length;
  const unregisteredCount = totalAgents - agents.filter(a => isRegistered(a.name)).length;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-right">
            <Shield className="w-4 h-4" />
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-emerald-400" />
              Agents
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              AI agents and systems interacting with Veridion Nexus
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRegisterModalName(''); setRegisterModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register New Agent
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Banner — only if unregistered agents exist */}
        {unregisteredCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-400">
                  {unregisteredCount} unregistered agent{unregisteredCount !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Register your agents to enforce per-agent data policies and generate A2A-compatible compliance documentation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-white">{totalAgents}</div>
            <div className="text-xs text-slate-400 mt-1">Agents Detected</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-400">{activeAgents}</div>
            <div className="text-xs text-slate-400 mt-1">Active (last 24h)</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-400">{registeredCount}</div>
            <div className="text-xs text-slate-400 mt-1">Registered</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-amber-400">{unregisteredCount}</div>
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
            {agents.map((agent) => {
              const registered = isRegistered(agent.name);
              const card = getRegisteredCard(agent.name);
              const trustLevel = card?.['x-veridion']?.trust_level ?? 0;

              return (
                <div
                  key={agent.name}
                  className={`bg-slate-800 border rounded-lg p-5 flex flex-col gap-4 ${
                    registered ? 'border-emerald-500/30' : 'border-slate-700'
                  }`}
                >
                  {/* Top row: name + status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        registered ? 'bg-emerald-500/15' : 'bg-slate-700'
                      }`}>
                        <Cpu className={`w-5 h-5 ${registered ? 'text-emerald-400' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{agent.name}</div>
                        <div className="text-xs text-slate-500">
                          Last active: {agent.lastActivity ? formatTimeAgo(agent.lastActivity) : (registered ? 'No activity yet' : '—')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {registered && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium border bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
                          REGISTERED
                        </span>
                      )}
                      {registered && trustLevel > 0 && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium border bg-blue-500/15 text-blue-400 border-blue-500/25">
                          Trust Level {trustLevel}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        agent.isActive
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/25'
                      }`}>
                        {agent.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
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

                  {/* Action row */}
                  <div className="pt-2 border-t border-slate-700 flex items-center gap-2">
                    {registered ? (
                      <>
                        <button
                          onClick={() => card && setCardPanel(card)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Agent Card
                        </button>
                        <button
                          disabled
                          title="Coming soon"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-500 cursor-not-allowed"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Policy History
                        </button>
                        {card?.['x-veridion']?.agent_id && (
                          <button
                            onClick={() => handleRotateKey(card!['x-veridion'].agent_id)}
                            disabled={rotating === card!['x-veridion'].agent_id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                          >
                            <Key className="w-3.5 h-3.5" />
                            {rotating === card!['x-veridion'].agent_id ? 'Rotating...' : 'Rotate Key'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => { setRegisterModalName(agent.name); setRegisterModalOpen(true); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                      >
                        Register Agent
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Registration Modal */}
      <RegisterAgentModal
        open={registerModalOpen}
        agentName={registerModalName}
        onClose={() => setRegisterModalOpen(false)}
        onSuccess={handleRegisterSuccess}
      />

      {/* Agent Card Side Panel */}
      {cardPanel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setCardPanel(null)}>
          <div
            className="w-full max-w-lg bg-slate-800 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">A2A Agent Card</h2>
              <button onClick={() => setCardPanel(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(cardPanel, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Rotated Key Reveal Modal */}
      {rotatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                New Agent API Key
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-400">
                    This key will only be shown once. Store it securely — it cannot be recovered. The previous key has been invalidated.
                  </p>
                </div>
              </div>
              <div className="relative">
                <pre className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-emerald-400 font-mono break-all pr-12">
                  {rotatedKey}
                </pre>
                <button
                  onClick={copyRotatedKey}
                  className="absolute top-2 right-2 p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {rotatedKeyCopied && (
                <p className="text-xs text-emerald-400">Copied to clipboard</p>
              )}
            </div>
            <div className="flex items-center justify-end p-5 border-t border-slate-700">
              <button
                onClick={() => { setRotatedKey(''); setRotatedKeyCopied(false); }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
