'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.veridion-nexus.eu';

const DASHBOARD_LOGIN =
  process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost')
    ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login`
    : 'https://app.veridion-nexus.eu/login';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (!t) {
      router.replace('/forgot-password');
      return;
    }
    setToken(t);
    setReady(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === 'password_too_short') {
          setError('Password must be at least 8 characters');
        } else {
          setError('This link has expired or already been used');
        }
        return;
      }
      setSuccess(true);
    } catch {
      setError('This link has expired or already been used');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (success) {
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
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center space-y-4">
            <p className="text-sm text-slate-300">
              Password reset.{' '}
              <a
                href={DASHBOARD_LOGIN}
                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-medium"
              >
                Sign in
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </p>
          </div>
          <p className="text-center text-xs text-slate-600 mt-5">
            &copy; 2026 Veridion Nexus
          </p>
        </div>
      </div>
    );
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
            Set a new password
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirm" className="block text-xs font-medium text-slate-300 mb-1">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-sm text-white font-semibold rounded-lg transition-colors"
            >
              {submitting ? 'Saving…' : 'Reset password'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-500">
              <a href="/forgot-password" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                Request a new link
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
