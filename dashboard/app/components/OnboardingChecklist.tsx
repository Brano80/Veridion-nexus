'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { fetchAgents, EvidenceEvent, AgentCard } from '../utils/api';

const STORAGE_KEY = 'onboarding_dismissed';

function eventIsReviewOrBlock(e: EvidenceEvent): boolean {
  const et = (e.eventType || '').toUpperCase();
  if (
    et === 'DATA_TRANSFER_BLOCKED' ||
    et === 'TRANSFER_EVALUATION_BLOCKED' ||
    et === 'AGENT_POLICY_VIOLATION' ||
    e.verificationStatus === 'BLOCK'
  ) {
    return true;
  }
  if (
    et === 'DATA_TRANSFER_REVIEW' ||
    et === 'TRANSFER_EVALUATION_REVIEW' ||
    e.verificationStatus === 'REVIEW'
  ) {
    return true;
  }
  return false;
}

type Props = {
  events: EvidenceEvent[];
  enforcementMode: 'shadow' | 'enforce';
};

export default function OnboardingChecklist({ events, enforcementMode }: Props) {
  const [storageReady, setStorageReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [agents, setAgents] = useState<AgentCard[]>([]);

  useEffect(() => {
    setStorageReady(true);
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === 'true') {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchAgents();
        if (!cancelled) setAgents(r.agents ?? []);
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = useMemo(() => {
    const s1 = true;
    const s2 = agents.length > 0;
    const s3 = events.length > 0;
    const s4 = events.some(eventIsReviewOrBlock);
    const s5 = enforcementMode === 'enforce';
    return { s1, s2, s3, s4, s5 };
  }, [agents.length, events, enforcementMode]);

  const completeCount = [steps.s1, steps.s2, steps.s3, steps.s4, steps.s5].filter(Boolean).length;
  const progressPct = (completeCount / 5) * 100;

  function handleDismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!storageReady || dismissed) return null;

  return (
    <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 transition-colors z-10"
        aria-label="Dismiss getting started checklist"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="mb-4 pr-8">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs text-slate-400">{completeCount}/5 steps complete</span>
        </div>
        <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="mb-4 pr-6">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <span aria-hidden>🚀</span> Get Started with Sovereign Shield
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Complete these steps to start enforcing GDPR transfer policy for your AI agents.
        </p>
      </div>

      <ul className="space-y-3">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </span>
          <span className="text-sm text-white">1. Account created</span>
        </li>

        <li className="flex items-start gap-3">
          {steps.s2 ? (
            <>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm text-white">2. Register your first agent</span>
            </>
          ) : (
            <>
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-500 bg-slate-800" />
              <span className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
                2. Register your first agent
                <Link href="/agents" className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-0.5">
                  →
                </Link>
              </span>
            </>
          )}
        </li>

        <li className="flex items-start gap-3">
          {steps.s3 ? (
            <>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm text-white">3. Make your first evaluate() call</span>
            </>
          ) : (
            <>
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-500 bg-slate-800" />
              <span className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
                3. Make your first evaluate() call
                <a
                  href="/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  →
                </a>
              </span>
            </>
          )}
        </li>

        <li className="flex items-start gap-3">
          {steps.s4 ? (
            <>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm text-white">4. Review your first transfer</span>
            </>
          ) : (
            <>
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-500 bg-slate-800" />
              <span className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
                4. Review your first transfer
                <Link href="/review-queue" className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-0.5">
                  →
                </Link>
              </span>
            </>
          )}
        </li>

        <li className="flex items-start gap-3">
          {steps.s5 ? (
            <>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm text-white">5. Enable enforcement mode</span>
            </>
          ) : (
            <>
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-500 bg-slate-800" />
              <span className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
                5. Enable enforcement mode
                <Link href="/settings" className="text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-0.5">
                  →
                </Link>
              </span>
            </>
          )}
        </li>
      </ul>
    </div>
  );
}
