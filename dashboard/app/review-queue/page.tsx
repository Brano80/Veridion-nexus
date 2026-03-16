'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '../components/DashboardLayout';
import {
  fetchReviewQueuePending,
  ReviewQueueItem,
} from '../utils/api';
import { CheckCircle } from 'lucide-react';
import { COUNTRY_NAMES } from '../config/countries';

function getCountryFromAction(action: string): { code: string; name: string } {
  if (!action) return { code: '—', name: 'Unknown' };
  const parts = action.split('_');
  const code = (parts[parts.length - 1] || '').toUpperCase();
  if (!code || code.length !== 2) return { code: '—', name: 'Unknown' };
  const name = COUNTRY_NAMES[code] || code;
  return { code, name };
}

function formatSlaRemaining(createdAt: string): { text: string; badgeClass: string; borderClass: string } {
  const created = new Date(createdAt).getTime();
  const deadline = created + 24 * 60 * 60 * 1000; // +24 hours
  const now = Date.now();

  if (now >= deadline) {
    return {
      text: '⏱ SLA EXPIRED — pending auto-block',
      badgeClass: 'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25',
      borderClass: 'border-l-4 border-l-red-500/60',
    };
  }

  const ms = deadline - now;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  const isApproaching = hours < 2;
  const badgeClass = isApproaching
    ? 'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25'
    : 'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
  const borderClass = isApproaching ? 'border-l-4 border-l-amber-500/60' : 'border-l-4 border-l-slate-600';

  return {
    text: `⏱ ${hours}h ${minutes}m remaining`,
    badgeClass,
    borderClass,
  };
}

function isOverdue(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const deadline = created + 24 * 60 * 60 * 1000; // +24 hours
  return Date.now() >= deadline;
}

function humanReadableAction(action: string): string {
  if (!action) return '—';
  if (action.toLowerCase().includes('transfer') && action.toLowerCase().includes('data')) return 'Data Transfer';
  return action.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [, setTick] = useState(0); // Force re-render every minute for SLA

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  function groupByDestinationPartner(raw: ReviewQueueItem[]): ReviewQueueItem[] {
    const groupKey = (item: ReviewQueueItem) => {
      const code = (item.context?.destination_country_code || item.context?.destinationCountryCode || '').trim().toUpperCase();
      const partner = (item.context?.partner_name || item.context?.partnerName || item.context?.partner || '').trim().toLowerCase();
      return `${code}::${partner}`;
    };
    const grouped = new Map<string, { item: ReviewQueueItem; count: number }>();
    for (const item of raw) {
      const key = groupKey(item);
      const existing = grouped.get(key);
      const tc = item.transferCount ?? 1;
      if (existing) {
        existing.count += tc;
        if (new Date(item.created || 0) < new Date(existing.item.created || 0)) existing.item = item;
      } else {
        grouped.set(key, { item, count: tc });
      }
    }
    return Array.from(grouped.values()).map(({ item, count }) => ({ ...item, transferCount: count }));
  }

  async function loadItems() {
    try {
      const data = await fetchReviewQueuePending();
      const pendingOnly = (Array.isArray(data) ? data : []).filter(
        (item: ReviewQueueItem) => (item.status || '').toUpperCase() === 'PENDING'
      );
      setItems(groupByDestinationPartner(pendingOnly));
      setLastChecked(new Date());
    } catch (error) {
      console.error('Failed to load review queue:', error);
    } finally {
      setLoading(false);
    }
  }

  const overdueCount = items.filter(item => isOverdue(item.created)).length;
  const pendingCount = items.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Review Queue</h1>
          <p className="text-xs text-slate-500">
            Required under GDPR Art. 22 & EU AI Act Art. 14 — human oversight of automated transfer decisions
          </p>
          <p className="text-sm text-slate-400 mt-2">
            {pendingCount} pending · {overdueCount} overdue
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-1">Review Queue Clear</h2>
            <p className="text-slate-400 mb-2">No pending transfer decisions.</p>
            <p className="text-xs text-slate-500">
              Last checked: {lastChecked ? lastChecked.toLocaleString() : '—'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const { code, name } = getCountryFromAction(item.action);
              const sealId = item.sealId || item.id || item.evidenceId || '';
              const sla = formatSlaRemaining(item.created);

              return (
                <div
                  key={item.id}
                  className={`bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4 ${sla.borderClass}`}
                >
                  {/* Top row */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {code && code !== '—' && code.length === 2 && (
                        <img
                          src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
                          alt=""
                          className="w-6 h-[18px] object-cover rounded-sm"
                        />
                      )}
                      <span className="font-bold text-white">{name}</span>
                      {code !== '—' && code.length === 2 && name !== code && (
                        <span className="text-slate-500 text-xs">({code})</span>
                      )}
                      {(item.transferCount ?? 1) > 1 && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/50 text-slate-400 border border-slate-500/50">
                          ×{(item.transferCount ?? 1)} transfers
                        </span>
                      )}
                    </div>
                    <span className="px-2 py-1 bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded text-xs font-medium">
                      GDPR Art. 46 — SCC Required
                    </span>
                    <span className={sla.badgeClass}>
                      {sla.text}
                    </span>
                  </div>

                  {/* Data category + Action */}
                  <div className="text-xs text-slate-400">
                    Data category: <span className="text-white">
                      {Array.isArray(item.context?.data_categories)
                        ? item.context.data_categories.join(', ')
                        : (item.context?.data_categories || 'personal data')}
                    </span>
                    {' · '}
                    Action: <span className="text-white">{humanReadableAction(item.action)}</span>
                  </div>

                  {/* Middle - grey inset */}
                  <div className="bg-slate-900 rounded p-3 space-y-1">
                    <div className="font-mono text-xs text-emerald-400">{sealId}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(item.created).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-400">
                      Source: {item.module || item.agentId || 'sovereign-shield'}
                    </div>
                  </div>

                  {/* Bottom */}
                  <div className="flex justify-end">
                    <Link
                      href={`/transfer-detail/${sealId}`}
                      className="px-3 py-1.5 rounded border border-slate-600 text-blue-400 text-xs hover:border-blue-500 hover:bg-blue-500/10 transition-colors"
                    >
                      View Full Details →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export const dynamic = 'force-dynamic';
