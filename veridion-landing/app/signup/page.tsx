'use client';

import { useState } from 'react';
import { Eye, EyeOff, Copy, Check, ExternalLink, AlertTriangle, Shield } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface SignupResult {
  tenant_id: string;
  api_key_raw: string;
  api_key_prefix: string;
  trial_expires_at: string;
  email: string;
}

export default function SignupPage() {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [result, setResult] = useState<SignupResult | null>(null);
  const [copied, setCopied] = useState(false);

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    if (companyName.trim().length < 2) {
      newErrors.companyName = 'Company name is required (minimum 2 characters)';
    }
    if (!email.includes('@') || !email.includes('.')) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError('');
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const messages: Record<string, string> = {
          company_name_required: 'Company name is required (minimum 2 characters)',
          invalid_email: 'Please enter a valid email address',
          password_too_short: 'Password must be at least 8 characters',
          email_taken: 'An account with this email already exists',
          rate_limit_exceeded: 'Too many attempts. Please try again in an hour.',
        };
        setServerError(messages[data.error] || data.message || 'Something went wrong');
        return;
      }

      setResult(data);
      setStep('success');
    } catch {
      setServerError('Unable to connect to the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.api_key_raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback: select text
    }
  }

  if (step === 'success' && result) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Brand */}
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

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-xl font-bold text-white mb-1">Welcome to Sovereign Shield</h2>
              <p className="text-slate-400">Your 30-day free trial has started.</p>
            </div>

            {/* API Key Display */}
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-medium">Your API Key</label>
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-4 flex items-center justify-between gap-3">
                <code className="text-emerald-400 font-mono text-sm break-all flex-1">
                  {result.api_key_raw}
                </code>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-300" />
                  )}
                </button>
              </div>
              <div className="flex items-start gap-2 mt-3 text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">Save this key — you won&apos;t see it again.</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                We&apos;ve also emailed it to <strong className="text-slate-300">{result.email}</strong>
              </p>
            </div>

            {/* Trial info */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-400">
              <div className="flex justify-between">
                <span>Trial expires</span>
                <span className="text-white">{new Date(result.trial_expires_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Plan</span>
                <span className="text-yellow-400">Free Trial</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
              >
                Sign In to Dashboard
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href="https://docs.veridion-nexus.eu"
                className="flex items-center justify-center gap-2 w-full py-3 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 font-medium rounded-lg transition-colors"
              >
                Read the docs
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Footer */}
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
        {/* Logo */}
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

        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-5 text-center">
            Start your free trial
          </h2>

          {serverError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="companyName" className="block text-xs font-medium text-slate-300 mb-1">
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); setErrors(prev => { const n = {...prev}; delete n.companyName; return n; }); }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                placeholder="Acme Corp"
              />
              {errors.companyName && <p className="text-red-400 text-xs mt-1">{errors.companyName}</p>}
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors(prev => { const n = {...prev}; delete n.email; return n; }); }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                placeholder="you@company.com"
                autoComplete="email"
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors(prev => { const n = {...prev}; delete n.password; return n; }); }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-sm text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? 'Creating account...' : 'Start Free Trial'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Sign in
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-5">
          &copy; 2026 Veridion Nexus
        </p>
      </div>
    </div>
  );
}
