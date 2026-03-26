'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import { Shield, Globe, AlertTriangle, ArrowLeft, ExternalLink, Mail, Clock, Cpu, CheckCircle, XCircle, FileText } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.veridion-nexus.eu';

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  minimal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', label: 'Minimal Risk' },
  limited: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25', label: 'Limited Risk' },
  high: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25', label: 'High Risk' },
  unacceptable: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25', label: 'Unacceptable Risk' },
};

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.agent_id as string;
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/public/registry/agents/${agentId}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Agent not found in public registry' : 'Failed to load agent');
          return;
        }
        const json = await res.json();
        setAgent(json.data);
      } catch {
        setError('Failed to connect to registry');
      } finally {
        setLoading(false);
      }
    }
    if (agentId) load();
  }, [agentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <SiteHeader active="registry" />
        <div className="flex-1 flex items-center justify-center pt-16">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <SiteHeader active="registry" />
        <div className="flex-1 flex items-center justify-center pt-16">
          <div className="text-center">
            <Shield className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">{error || 'Agent not found'}</h2>
            <Link href="/registry" className="text-emerald-400 hover:text-emerald-300 text-sm">
              &larr; Back to Registry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const risk = agent.eu_ai_act?.risk_level || 'minimal';
  const riskStyle = RISK_COLORS[risk] || RISK_COLORS.minimal;
  const al = agent.accountability_ledger;

  return (
    <div className="min-h-screen bg-slate-900">
      <SiteHeader active="registry" />

      <div className="pt-24 pb-16 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link href="/registry" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Registry
        </Link>

        {/* Header */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Cpu className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                {agent.provider?.organization && (
                  <p className="text-sm text-slate-400 mt-0.5">
                    by {agent.provider.organization}
                    {agent.provider.url && (
                      <a href={agent.provider.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-emerald-400 hover:text-emerald-300">
                        <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    )}
                  </p>
                )}
                <p className="text-xs text-slate-500 font-mono mt-1">{agent.agent_id}</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase border ${riskStyle.bg} ${riskStyle.text} ${riskStyle.border}`}>
              {riskStyle.label}
            </span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{agent.description}</p>
          {agent.url && (
            <a href={agent.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 mt-3">
              <ExternalLink className="w-3.5 h-3.5" /> {agent.url}
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* EU AI Act Classification */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              EU AI Act Classification
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Risk Level</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase border ${riskStyle.bg} ${riskStyle.text} ${riskStyle.border}`}>
                  {risk}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Processes Personal Data</span>
                {agent.eu_ai_act?.processes_personal_data ? (
                  <span className="flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="w-3 h-3" /> Yes</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" /> No</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Automated Decision Making</span>
                {agent.eu_ai_act?.automated_decision_making ? (
                  <span className="flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="w-3 h-3" /> Yes</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" /> No</span>
                )}
              </div>
            </div>
          </div>

          {/* Deployment & Data Residency */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              Deployment &amp; Data Residency
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Data Residency</span>
                <span className="text-xs text-white font-medium">{agent.deployment?.data_residency || 'Not specified'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Deployment Region</span>
                <span className="text-xs text-white font-medium">{agent.deployment?.region || 'Not specified'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Environment</span>
                <span className="text-xs text-white font-medium">{agent.deployment?.environment || 'Not specified'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Version</span>
                <span className="text-xs text-white font-mono">v{agent.version}</span>
              </div>
            </div>
          </div>

          {/* Accountability Ledger Status */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Audit Trail (Art. 12)
            </h2>
            {al?.active ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">Accountability Ledger Active</span>
                </div>
                <p className="text-xs text-slate-400">
                  Tool calls are logged to a tamper-evident, SHA-256 hash-chained audit trail.
                </p>
                {al.last_event_at && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    Last event: {new Date(al.last_event_at).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-400">No audit trail connected</span>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              Contact
            </h2>
            <div className="space-y-3">
              {agent.contact_email ? (
                <a href={`mailto:${agent.contact_email}`} className="text-sm text-emerald-400 hover:text-emerald-300">
                  {agent.contact_email}
                </a>
              ) : (
                <p className="text-xs text-slate-500">No DPO contact provided</p>
              )}
              {agent.a2a_card_url && (
                <div>
                  <span className="text-xs text-slate-400 block mb-1">A2A Agent Card</span>
                  <a href={agent.a2a_card_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> {agent.a2a_card_url}
                  </a>
                </div>
              )}
              <div className="pt-2 border-t border-slate-700">
                <span className="text-xs text-slate-500">
                  Listed: {agent.listed_at ? new Date(agent.listed_at).toLocaleDateString() : 'N/A'}
                  {' · '}
                  Registered: {new Date(agent.registered_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tools Permitted */}
        {agent.tools_permitted && Array.isArray(agent.tools_permitted) && agent.tools_permitted.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mt-6">
            <h2 className="text-sm font-semibold text-white mb-3">Permitted Tools</h2>
            <div className="flex flex-wrap gap-2">
              {agent.tools_permitted.map((tool: string, i: number) => (
                <span key={i} className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-700 text-slate-300 border border-slate-600">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Veridion Nexus. EU AI Act &bull; GDPR Art. 44-49 Compliance.</p>
      </footer>
    </div>
  );
}
