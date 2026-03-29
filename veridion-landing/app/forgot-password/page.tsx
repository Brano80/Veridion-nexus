'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.veridion-nexus.eu';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-7 h-7 text-emerald-400" />
            <h1 style={{ fontFamily: 'Inter, sans-serif' }}>
              <span className="text-xl font-black italic uppercase text-white" style={{ letterSpacing: '-0.05em' }}>
                VERIDION
              </span>{' '}
              <span className="text-base font-semibold italic lowercase" style={{ color: '#10b981', filter: 'drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))' }}>
                nexus
              </span>
            </h1>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5 text-center">
            Forgot your password?
          </h2>

          {done ? (
            <p className="text-sm text-slate-300 text-center leading-relaxed">
              If that email is registered, you&apos;ll receive a reset link shortly.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-sm text-white font-semibold rounded-lg transition-colors"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-500">
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost')
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`
                  : 'https://app.veridion-nexus.eu/login'}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Back to sign in
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-5">
          &copy; 2026 Veridion Nexus
        </p>
      </div>
    </div>
  );
}
