'use client';

/**
 * AgentDetailPanel — redesigned slide-over (ACM / Sovereign Shield design system).
 */

import { useState, useEffect } from 'react';
import {
  X,
  Key,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  ShieldCheck,
  Activity,
  ArrowRightLeft,
} from 'lucide-react';
import type { AgentInfo } from '@/app/agents/page';
import { patchAgent } from '@/app/utils/api';

interface Props {
  agent: AgentInfo;
  onClose: () => void;
  onRotateKey: (agentId: string) => Promise<string | null>;
  onDelete: (agentId: string) => Promise<void>;
  rotatedKey: string | null;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatTimeAgo(iso: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MiniStat({
  label,
  value,
  accent = 'slate',
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const colors: Record<string, string> = {
    emerald: 'border-emerald-800/50 text-emerald-400',
    amber: 'border-amber-800/50 text-amber-400',
    red: 'border-red-800/50 text-red-400',
    slate: 'border-slate-600 text-slate-300',
  };
  return (
    <div className={`bg-slate-900 border rounded-lg px-3 py-2.5 text-center ${colors[accent]}`}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  );
}

export default function AgentDetailPanel({
  agent,
  onClose,
  onRotateKey,
  onDelete,
  rotatedKey,
}: Props) {
  const [showJson, setShowJson] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(rotatedKey);
  const [keySaved, setKeySaved] = useState(false);

  const xVeridion = agent.card?.['x-veridion'] as Record<string, unknown> | undefined;
  const piiFromCard = xVeridion?.pii_heuristics as
    | { arg_keys?: string[]; tool_names?: string[] }
    | null
    | undefined;

  const [piiArgKeys, setPiiArgKeys] = useState('');
  const [piiToolNames, setPiiToolNames] = useState('');
  const [piiSaving, setPiiSaving] = useState(false);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [piiSavedAt, setPiiSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (rotatedKey) {
      setNewKey(rotatedKey);
      setKeySaved(false);
    }
  }, [rotatedKey]);

  useEffect(() => {
    const ph = piiFromCard;
    setPiiArgKeys(ph?.arg_keys?.join(', ') ?? '');
    setPiiToolNames(ph?.tool_names?.join(', ') ?? '');
    setPiiError(null);
    setPiiSavedAt(null);
  }, [agent.agentId, agent.card]);

  const isRegistered = !!agent.agentId;
  const trustLevel = xVeridion?.trust_level as number | undefined;

  const piiUsingDefaults =
    piiFromCard == null ||
    (!piiFromCard.arg_keys?.length && !piiFromCard.tool_names?.length);

  const handleSavePii = async () => {
    if (!agent.agentId) return;
    setPiiSaving(true);
    setPiiError(null);
    try {
      const ak = splitCsv(piiArgKeys);
      const tn = splitCsv(piiToolNames);
      const payload =
        ak.length === 0 && tn.length === 0
          ? null
          : { arg_keys: ak, tool_names: tn };
      await patchAgent(agent.agentId, { pii_heuristics: payload } as any);
      setPiiSavedAt(Date.now());
    } catch (e) {
      setPiiError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPiiSaving(false);
    }
  };

  const copyId = () => {
    if (!agent.agentId) return;
    navigator.clipboard.writeText(agent.agentId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleRotate = async () => {
    if (!agent.agentId) return;
    if (!confirm(`Rotate API key for "${agent.name}"? The current key stops working immediately.`))
      return;
    setRotating(true);
    const key = await onRotateKey(agent.agentId);
    setNewKey(key);
    setKeySaved(false);
    setRotating(false);
  };

  const handleDelete = async () => {
    if (!agent.agentId) return;
    if (!confirm(`Permanently delete "${agent.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await onDelete(agent.agentId);
    setDeleting(false);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-xl flex flex-col bg-slate-900 border-l border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-700 bg-slate-900">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{agent.name}</h2>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                  agent.isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-800/50'
                    : 'bg-slate-800 text-slate-500 border-slate-600'
                }`}
              >
                <Activity className="w-3 h-3" />
                {agent.isActive ? 'Active' : 'Inactive'}
              </span>

              {isRegistered && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border bg-blue-500/10 text-blue-400 border-blue-500/25">
                  <ShieldCheck className="w-3 h-3" />
                  Registered
                </span>
              )}

              {trustLevel !== undefined && trustLevel !== null && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-slate-800 text-slate-300 border-slate-600">
                  Trust {trustLevel}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-slate-400">Last activity</span>
              <span className="text-slate-200 font-medium ml-auto">{formatTimeAgo(agent.lastActivity)}</span>
            </div>

            {isRegistered && (
              <div className="flex items-start gap-2.5 text-sm">
                <Hash className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-400 mb-1">Agent ID</p>
                  <div className="flex items-center gap-2 bg-slate-900 rounded px-3 py-2 border border-slate-700">
                    <code className="text-xs text-slate-300 font-mono flex-1 break-all">{agent.agentId}</code>
                    <button
                      type="button"
                      onClick={copyId}
                      className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {idCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Activity
            </p>
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="Total" value={agent.totalTransfers} accent="slate" />
              <MiniStat
                label="Allow"
                value={agent.allowCount}
                accent={agent.allowCount > 0 ? 'emerald' : 'slate'}
              />
              <MiniStat
                label="Review"
                value={agent.reviewCount}
                accent={agent.reviewCount > 0 ? 'amber' : 'slate'}
              />
              <MiniStat
                label="Block"
                value={agent.blockCount}
                accent={agent.blockCount > 0 ? 'red' : 'slate'}
              />
            </div>

            {agent.reviewCount > 0 && (
              <p className="mt-2.5 text-xs text-slate-500">
                {agent.reviewCount} transfer{agent.reviewCount !== 1 ? 's' : ''} pending review
              </p>
            )}
          </div>

          {isRegistered && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  PII detection (MCP proxy)
                </p>
                {piiUsingDefaults && (
                  <span className="text-[11px] text-slate-500 border border-slate-600 rounded px-2 py-0.5">
                    Using defaults
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Comma-separated lists. When set, these replace the built-in PII argument keys and write-style tool
                heuristics for this agent. Leave both empty and save to use defaults.
              </p>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500 mb-1 block">PII argument keys</span>
                  <input
                    type="text"
                    value={piiArgKeys}
                    onChange={(e) => setPiiArgKeys(e.target.value)}
                    placeholder="e.g. email, name, ssn"
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500 mb-1 block">PII tool names</span>
                  <input
                    type="text"
                    value={piiToolNames}
                    onChange={(e) => setPiiToolNames(e.target.value)}
                    placeholder="e.g. cv_parser, send_email"
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </label>
              </div>
              {piiError && <p className="text-xs text-red-400">{piiError}</p>}
              {piiSavedAt != null && !piiError && (
                <p className="text-xs text-emerald-400">Saved. Refresh the page to sync the JSON card view.</p>
              )}
              <button
                type="button"
                onClick={() => void handleSavePii()}
                disabled={piiSaving}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
              >
                {piiSaving ? 'Saving…' : 'Save PII settings'}
              </button>
            </div>
          )}

          {newKey && !keySaved && (
            <div className="bg-amber-500/10 border border-amber-800/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                New API Key — copy now, shown once only
              </p>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-3 py-2">
                <code className="text-xs text-amber-300 font-mono flex-1 break-all">{newKey}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors"
                >
                  {keyCopied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setKeySaved(true)}
                className="mt-3 w-full rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium py-2 transition-colors"
              >
                I have saved this key
              </button>
            </div>
          )}

          {agent.card && (
            <div>
              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <span>View Agent Card JSON</span>
                {showJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showJson && (
                <pre className="mt-2 rounded-lg bg-slate-900 border border-slate-700 p-4 text-xs text-slate-300 font-mono overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(agent.card, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {isRegistered && (
          <div className="border-t border-slate-700 px-6 py-4 bg-slate-900 flex gap-3">
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotating}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              {rotating ? 'Rotating…' : 'Rotate Key'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-900/60 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting…' : 'Delete Agent'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
