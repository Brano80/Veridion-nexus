'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '../../components/DashboardLayout';
import {
  fetchOversightRecords,
  resolveOversight,
  OversightRecord,
  ResolveOversightPayload,
} from '@/app/lib/acm-api';
import { CheckCircle, XCircle, AlertTriangle, Clock, ChevronUp, Eye } from 'lucide-react';

const TRIGGER_LABELS: Record<string, string> = {
  degraded_context_trust: 'Degraded Context Trust',
  high_impact_decision: 'High-Impact Decision',
  anomaly_detected: 'Anomaly Detected',
  manual_request: 'Manual Request',
  periodic_audit: 'Periodic Audit',
};

const OUTCOME_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending:   { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
  approved:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  rejected:  { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/25' },
  escalated: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function OversightQueuePage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-12 text-center text-slate-400">Loading…</div></DashboardLayout>}>
      <OversightQueueInner />
    </Suspense>
  );
}

function OversightQueueInner() {
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get('status') as 'all' | 'pending' | 'decided') || 'pending';

  const [records, setRecords] = useState<OversightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'decided'>(initialStatus);
  const [resolving, setResolving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
    const interval = setInterval(loadRecords, 10_000);
    return () => clearInterval(interval);
  }, [filter]);

  async function loadRecords() {
    try {
      const data = await fetchOversightRecords(filter);
      setRecords(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(id: string, outcome: 'approved' | 'rejected' | 'escalated') {
    setResolving(id);
    try {
      const payload: ResolveOversightPayload = {
        reviewer_outcome: outcome,
        eu_ai_act_compliance: outcome === 'approved',
      };
      await resolveOversight(id, payload);
      await loadRecords();
      setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setResolving(null);
    }
  }

  const pendingCount = records.filter(r => !r.reviewer_outcome || r.reviewer_outcome === 'pending').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Oversight Queue</h1>
          <p className="text-xs text-slate-500">
            EU AI Act Art. 14 — human oversight of AI tool-call decisions triggered by the ACM proxy
          </p>
          <p className="text-sm text-slate-400 mt-2">
            {records.length} record{records.length !== 1 ? 's' : ''} · {pendingCount} pending
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 w-fit">
          {(['pending', 'decided', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLoading(true); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading…</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-1">
              {filter === 'pending' ? 'No Pending Reviews' : 'No Records Found'}
            </h2>
            <p className="text-slate-400">
              {filter === 'pending'
                ? 'All AI tool-call oversight reviews have been resolved.'
                : 'No oversight records match the selected filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const outcome = record.reviewer_outcome || 'pending';
              const style = OUTCOME_STYLES[outcome] || OUTCOME_STYLES.pending;
              const isPending = outcome === 'pending';
              const isExpanded = expandedId === record.id;

              return (
                <div
                  key={record.id}
                  className={`bg-slate-800 border border-slate-700 rounded-lg overflow-hidden ${
                    isPending ? 'border-l-4 border-l-amber-500/60' : ''
                  }`}
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Eye className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {record.agent_name || record.agent_id || 'Unknown Agent'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {TRIGGER_LABELS[record.review_trigger || ''] || record.review_trigger || '—'}
                          {' · '}
                          {formatDate(record.flagged_at || record.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
                        {outcome.toUpperCase()}
                      </span>
                      <ChevronUp className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        <Detail label="Oversight ID" value={record.id} mono />
                        <Detail label="Agent" value={record.agent_name || record.agent_id || '—'} />
                        <Detail label="Trigger" value={TRIGGER_LABELS[record.review_trigger || ''] || record.review_trigger || '—'} />
                        <Detail label="Outcome" value={outcome.toUpperCase()} />
                        <Detail label="Flagged At" value={formatDate(record.flagged_at)} />
                        <Detail label="Decided At" value={formatDate(record.decided_at)} />
                        <Detail label="AI Act Compliant" value={record.eu_ai_act_compliance == null ? '—' : record.eu_ai_act_compliance ? 'Yes' : 'No'} />
                        <Detail label="Reviewer" value={record.reviewer_id || '—'} />
                        {record.event_ref && (
                          <Detail label="Event Ref" value={record.event_ref} mono />
                        )}
                        {record.comments && (
                          <div className="col-span-2">
                            <Detail label="Comments" value={record.comments} />
                          </div>
                        )}
                      </div>

                      {isPending && (
                        <div className="flex gap-2 pt-2 border-t border-slate-700">
                          <button
                            onClick={() => handleResolve(record.id, 'approved')}
                            disabled={resolving === record.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleResolve(record.id, 'rejected')}
                            disabled={resolving === record.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleResolve(record.id, 'escalated')}
                            disabled={resolving === record.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Escalate
                          </button>
                          {resolving === record.id && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Clock className="w-3 h-3 animate-spin" /> Saving…
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-slate-500">{label}:</span>{' '}
      <span className={`text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export const dynamic = 'force-dynamic';
