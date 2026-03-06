'use client';

import { Shield, Clock, Mail, CheckCircle } from 'lucide-react';

export default function TrialExpiredModal() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          Your trial has ended
        </h2>
        <p className="text-slate-400 text-center text-sm mb-6">
          Your 30-day Sovereign Shield trial has expired. Your evidence records and audit data are preserved — upgrade to continue enforcement.
        </p>

        {/* What they had */}
        <div className="bg-slate-700/50 rounded-xl p-4 mb-6 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            What's included in Pro
          </p>
          {[
            'Runtime ALLOW/BLOCK/REVIEW enforcement',
            'Cryptographic evidence sealing',
            'SCC Registry with TIA tracking',
            'Human oversight review queue',
            'PDF audit export',
            'Shadow Mode',
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-sm text-slate-300">
                {feature}
              </span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="text-center mb-6">
          <span className="text-3xl font-black text-white">
            €199
          </span>
          <span className="text-slate-400 text-sm"> / month</span>
          <p className="text-xs text-slate-500 mt-1">
            Cancel anytime. EU VAT may apply.
          </p>
        </div>

        {/* CTA */}
        <a
          href="mailto:hello@veridion-nexus.eu?subject=Upgrade%20to%20Pro%20—%20Sovereign%20Shield"
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-6 rounded-xl transition-colors text-sm"
        >
          <Mail className="w-4 h-4" />
          Contact us to upgrade — hello@veridion-nexus.eu
        </a>

        {/* Footer note */}
        <p className="text-xs text-slate-500 text-center mt-4">
          Your data is safe. Evidence records are retained per GDPR Art. 30 requirements.
        </p>

      </div>
    </div>
  );
}
