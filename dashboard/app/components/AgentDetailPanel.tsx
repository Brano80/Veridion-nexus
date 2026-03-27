'use client';

/**
 * Slide-over panel: full agent detail (stats, ID, JSON, Rotate / Delete).
 */

import { useState, useEffect } from 'react';
import {
  X,
  Key,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Shield,
  Activity,
  Clock,
  Hash,
  AlertTriangle,
} from 'lucide-react';

interface AgentInfo {
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

interface Props {
  agent: AgentInfo | null;
  onClose: () => void;
  onRotateKey: (agentId: string) => Promise<string | null>;
  onDelete: (agentId: string) => Promise<void>;
  rotatedKey: string | null;
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

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center rounded-lg border px-4 py-3 ${color}`}>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="mt-0.5 text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
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
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(rotatedKey);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    if (rotatedKey) {
      setNewKey(rotatedKey);
      setKeySaved(false);
    }
  }, [rotatedKey]);

  if (!agent) return null;

  const isRegistered = !!agent.agentId;
  const xVeridion = agent.card?.['x-veridion'] as Record<string, unknown> | undefined;
  const rawTrust = xVeridion?.trust_level;
  const trustNum =
    typeof rawTrust === 'number' ? rawTrust : rawTrust != null ? Number(rawTrust) : NaN;
  const showTrust = Number.isFinite(trustNum) && trustNum > 0;

  const copyId = () => {
    if (agent.agentId) {
      navigator.clipboard.writeText(agent.agentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleRotate = async () => {
    if (!agent.agentId) return;
    if (!confirm(`Rotate API key for "${agent.name}"? The current key will stop working immediately.`))
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
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between border-b border-slate-700 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{agent.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  agent.isActive
                    ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700'
                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                }`}
              >
                <Activity className="w-3 h-3" />
                {agent.isActive ? 'Active' : 'Inactive'}
              </span>
              {isRegistered && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-900/60 text-blue-400 border border-blue-700">
                  <Shield className="w-3 h-3" />
                  Registered
                </span>
              )}
              {showTrust && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-emerald-900/40 text-emerald-400 border-emerald-700">
                  Trust {trustNum}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Last activity: </span>
              <span className="text-slate-200">{formatTimeAgo(agent.lastActivity)}</span>
            </div>

            {isRegistered && (
              <div className="flex items-start gap-2 text-slate-400">
                <Hash className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs">Agent ID</span>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="text-xs text-slate-300 font-mono break-all">{agent.agentId}</code>
                    <button
                      type="button"
                      onClick={copyId}
                      className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {copied ? (
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
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">
              Transfer Activity
            </p>
            <div className="grid grid-cols-4 gap-2">
              <StatBadge
                label="Total"
                value={agent.totalTransfers}
                color="border-slate-700 text-slate-300"
              />
              <StatBadge
                label="Allow"
                value={agent.allowCount}
                color="border-emerald-800 text-emerald-400"
              />
              <StatBadge
                label="Review"
                value={agent.reviewCount}
                color="border-yellow-800 text-yellow-400"
              />
              <StatBadge
                label="Block"
                value={agent.blockCount}
                color="border-red-900 text-red-400"
              />
            </div>
            {agent.reviewCount > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                {agent.reviewCount} transfer{agent.reviewCount !== 1 ? 's' : ''} pending review
              </div>
            )}
          </div>

          {newKey && !keySaved && (
            <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                New API Key — copy now, shown once only
              </p>
              <div className="flex items-center gap-2 bg-slate-800 rounded px-3 py-2">
                <code className="text-xs text-amber-300 font-mono flex-1 break-all">{newKey}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="shrink-0 text-slate-400 hover:text-white"
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
                className="mt-3 w-full rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-medium py-2 transition-colors"
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
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                {showJson ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showJson ? 'Hide' : 'View'} Agent Card JSON
              </button>
              {showJson && (
                <pre className="mt-2 rounded-lg bg-slate-800 border border-slate-700 p-3 text-xs text-slate-300 font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(agent.card, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {isRegistered && (
          <div className="border-t border-slate-700 px-6 py-4 flex gap-3">
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotating}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium py-2 transition-colors disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              {rotating ? 'Rotating…' : 'Rotate Key'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-800 bg-red-950/40 text-red-400 hover:bg-red-900/40 text-sm font-medium py-2 transition-colors disabled:opacity-50"
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
