'use client';

import { useState } from 'react';
import { Shield, Menu, X, ChevronDown, ChevronUp, ArrowRight, CheckCircle, Globe, Lock, FileCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* SECTION 1 — Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a] border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <div className="flex items-center">
              <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
                <span className="text-xl font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
                <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
              </h1>
            </div>

            {/* Right: Desktop Nav */}
            <div className="hidden md:flex items-center gap-6">
              <Link href="/docs" className="text-slate-300 hover:text-white transition-colors text-sm">
                Documentation
              </Link>
              <a 
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-300 hover:text-white transition-colors text-sm"
              >
                Sign In
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-800 py-4 space-y-3">
              <Link href="/docs" className="block text-slate-300 hover:text-white transition-colors text-sm" onClick={() => setMobileMenuOpen(false)}>
                Documentation
              </Link>
              <a 
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-300 hover:text-white transition-colors text-sm"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* SECTION 2 — Hero */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 min-h-screen flex items-center overflow-hidden" style={{
        background: 'radial-gradient(ellipse at center, #0a1628 0%, #080f1a 70%, #050810 100%)',
      }}>
        {/* Animated Grid Background */}
        <div className="absolute inset-0 opacity-[0.15]" style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: 'perspective(1000px) rotateX(60deg)',
          transformOrigin: 'center center',
          animation: 'gridMove 20s linear infinite',
        }}></div>

        {/* Floating Signal Elements */}
        <div className="absolute top-32 left-[10%] signal-badge" style={{ animationDelay: '0s' }}>
          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full backdrop-blur-sm">
            <span className="text-[10px] font-mono text-emerald-400 tracking-wider">[ EVALUATING... ]</span>
          </div>
        </div>
        <div className="absolute top-48 right-[15%] signal-badge" style={{ animationDelay: '1.5s', transform: 'rotate(-5deg)' }}>
          <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full backdrop-blur-sm">
            <span className="text-[10px] font-mono text-red-400 tracking-wider">[ BLOCK → CN ]</span>
          </div>
        </div>
        <div className="absolute bottom-40 left-[20%] signal-badge" style={{ animationDelay: '3s', transform: 'rotate(3deg)' }}>
          <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full backdrop-blur-sm">
            <span className="text-[10px] font-mono text-green-400 tracking-wider">[ ALLOW → DE ]</span>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          {/* Top Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-8">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">GDPR Chapter V Runtime Enforcement</span>
          </div>

          {/* Headline with Glow */}
          <div className="relative mb-6">
            <div className="absolute inset-0 blur-3xl opacity-20" style={{
              background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.4) 0%, transparent 70%)',
              transform: 'translateY(20px)',
            }}></div>
            <h1 className="relative text-3xl md:text-5xl font-black text-white leading-tight">
              Enforce Cross-Border Data Transfer Policy
              <span className="block text-emerald-400 mt-2">In Real Time</span>
            </h1>
          </div>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Every API call evaluated. Every decision sealed in cryptographic evidence. 
            Support demonstrable compliance with GDPR Art. 44-49 before data leaves your infrastructure.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/signup"
              className="hero-signup-btn inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-base font-semibold transition-all shadow-lg shadow-emerald-500/20"
            >
              Sign Up
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-base font-semibold transition-colors border border-white/20"
            >
              See How It Works
            </a>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-700/50 rounded-lg bg-slate-900/30 backdrop-blur-sm">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-slate-300">No credit card required</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-700/50 rounded-lg bg-slate-900/30 backdrop-blur-sm">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-slate-300">30-day free trial</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-700/50 rounded-lg bg-slate-900/30 backdrop-blur-sm">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-slate-300">Cancel anytime</span>
            </div>
          </div>
        </div>

        {/* CSS Animations */}
        <style jsx>{`
          @keyframes gridMove {
            0% {
              transform: perspective(1000px) rotateX(60deg) translateY(0);
            }
            100% {
              transform: perspective(1000px) rotateX(60deg) translateY(60px);
            }
          }

          @keyframes signalPulse {
            0%, 100% {
              opacity: 0.6;
              transform: translateY(0) scale(1);
            }
            50% {
              opacity: 1;
              transform: translateY(-8px) scale(1.05);
            }
          }

          .signal-badge {
            animation: signalPulse 4s ease-in-out infinite;
          }

          .hero-signup-btn:hover {
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.5), 0 0 40px rgba(16, 185, 129, 0.3);
            transform: translateY(-1px);
          }
        `}</style>
      </section>

      {/* SECTION 3 — Problem Statement (White) */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-4">The Problem</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Cross-Border Transfers Are Invisible
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Every API call to OpenAI, Anthropic, or any US-based service transfers personal data outside the EU. 
              GDPR Chapter V requires a legal basis for each transfer, but most applications have no visibility.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-6 shadow-sm">
              <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Visibility</h3>
              <p className="text-sm text-slate-600">
                You cannot demonstrate compliance with transfers you cannot see. Without runtime instrumentation, there is no record of which transfers occurred, where data went, or whether adequate safeguards were in place.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 shadow-sm">
              <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Manual Audits Are Too Late</h3>
              <p className="text-sm text-slate-600">
                By the time a DPA or auditor requests evidence, it is too late to create it. GDPR Art. 30 requires records of processing activities, and retroactive documentation does not satisfy the accountability principle under Art. 5(2).
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 shadow-sm">
              <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">A DPA Is Not Enough</h3>
              <p className="text-sm text-slate-600">
                A Data Processing Agreement establishes the contractual framework, but GDPR Art. 5(2) requires you to demonstrate compliance per transfer. A DPA alone cannot provide the per-transfer audit trail regulators expect.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 shadow-sm">
              <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Enforcement Without Observability</h3>
              <p className="text-sm text-slate-600">
                Without runtime evaluation, transfers to non-adequate countries proceed unchecked. You cannot enforce what you cannot observe. Shadow Mode lets you see exactly what would be enforced before you enable blocking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Solution Overview (Light Grey) */}
      <section id="features" className="bg-[#f8fafc] py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-4">The Solution</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Runtime Enforcement + Cryptographic Evidence
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              A single API call evaluates every transfer, returns ALLOW, BLOCK, or REVIEW, and seals every decision in cryptographic evidence.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200">
              <Globe className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Real-Time Monitoring</h3>
              <p className="text-base text-slate-600">
                Every transfer your application submits is evaluated before it proceeds. Country classification, SCC validation, and legal basis checks happen synchronously at the point of transfer.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200">
              <Lock className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Runtime Enforcement</h3>
              <p className="text-base text-slate-600">
                Block transfers to non-adequate countries without a valid SCC. Require human review for SCC-required destinations. Return ALLOW for EU/EEA and adequate countries automatically.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200">
              <FileCheck className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Cryptographic Evidence</h3>
              <p className="text-base text-slate-600">
                Every decision is sealed with a cryptographic hash and linked in an append-only chain. Export PDF reports for auditors and DPAs. Verify chain integrity at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 — How It Works (White) */}
      <section id="how-it-works" className="bg-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-4">How It Works</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Three Steps to Runtime Enforcement
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Integrate via REST API or MCP Server.
            </p>
          </div>

          <div className="space-y-8">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl font-bold">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Call Before Every Transfer</h3>
                <p className="text-base text-slate-600">
                  Before calling OpenAI, Anthropic, or any external API, call{' '}
                  <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono text-slate-900">POST /api/v1/shield/evaluate</code>{' '}
                  with the destination country, partner name, data categories, and purpose. Sovereign Shield returns ALLOW, BLOCK, or REVIEW.
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl font-bold">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Enforce the Decision</h3>
                <p className="text-base text-slate-600">
                  If ALLOW, proceed. If BLOCK, stop the transfer and return an error to the caller. If REVIEW, queue the transfer for human oversight — do not proceed until a decision is made.
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl font-bold">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Evidence Is Automatic</h3>
                <p className="text-base text-slate-600">
                  Every evaluation is cryptographically sealed in your audit trail. Export PDF reports, verify chain integrity, and provide structured, time-bound evidence to auditors and DPAs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — Features Grid (Light Grey) */}
      <section className="bg-[#f8fafc] py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-4">Complete Infrastructure</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Everything You Need for Demonstrable Compliance
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Support demonstrable compliance with GDPR Chapter V.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Country Classification</h3>
              <p className="text-sm text-slate-600">
                Automatic classification of destinations: EU/EEA, Adequate, SCC-required, and Blocked. Reflects current adequacy decisions including the EU-US Data Privacy Framework and Brazil (January 2026).
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">SCC Registry</h3>
              <p className="text-sm text-slate-600">
                Register Standard Contractual Clauses (C2C, C2P, P2P, P2C) per partner and destination. Pending reviews are auto-approved when a matching SCC is registered.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Human Oversight</h3>
              <p className="text-sm text-slate-600">
                Review queue for SCC-required transfers. Approve or reject with sealed evidence. 
                Supports EU AI Act Art. 14 and GDPR Art. 22.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Shadow Mode</h3>
              <p className="text-sm text-slate-600">
                Observe real policy decisions before enabling enforcement. Transfers are not blocked, but every decision is recorded in your audit trail — so you can see exactly what would have been enforced.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Evidence Vault</h3>
              <p className="text-sm text-slate-600">
                Append-only, cryptographically hash-chained audit trail. Export PDF reports for auditors and DPAs. Chain integrity verifiable at any time. Designed to support GDPR Art. 30 record-keeping obligations.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Transfer Log</h3>
              <p className="text-sm text-slate-600">
                Complete record of all evaluated transfers. Filter by destination, partner, and decision status. CSV export available. Shadow mode evaluations are clearly distinguished from enforced decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7 — CTA (White) */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-emerald-500 rounded-2xl p-8 md:p-12 text-white shadow-lg shadow-emerald-500/20">
            <p className="text-sm md:text-base mb-6 text-emerald-50">
              Paid plans launching Q3 2026 — design partners receive preferential pricing.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-600 text-lg font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-md"
            >
              Sign Up
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-sm">No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-sm">No commitment — cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8 — FAQ (Light Grey) */}
      <section id="faq" className="bg-[#f8fafc] py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-4">FAQ</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Common Questions
            </h2>
          </div>

          <div className="space-y-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {[
              {
                q: 'What is a cross-border data transfer under GDPR?',
                a: 'Any transfer of personal data to a country outside the EU/EEA requires a legal basis under GDPR Chapter V (Art. 44-49). This includes API calls that include personal data — names, emails, IDs — to US-based AI providers like OpenAI or Anthropic.',
              },
              {
                q: 'Does having a DPA with OpenAI satisfy GDPR Art. 5(2)?',
                a: 'A Data Processing Agreement establishes the contractual framework, but GDPR Art. 5(2) requires you to demonstrate compliance per transfer. Sovereign Shield creates a cryptographically sealed evidence record for every evaluated transfer, giving you the audit trail a DPA alone cannot provide.',
              },
              {
                q: 'What is Shadow Mode?',
                a: 'Shadow Mode lets you observe Sovereign Shield&apos;s decisions without enforcing them. Every transfer is evaluated and sealed, but the system always returns ALLOW to your application. Use it to understand your transfer risk profile before enabling enforcement.',
              },
              {
                q: 'How long does evaluation take?',
                a: 'Sovereign Shield returns a decision in under 100ms. The evaluation is synchronous — your application receives ALLOW, BLOCK, or REVIEW before the transfer proceeds.',
              },
              {
                q: 'What happens when a transfer is REVIEW?',
                a: 'A REVIEW decision means the transfer requires human oversight — typically because an SCC exists but hasn&apos;t been validated for that specific partner. The transfer is queued in the Human Oversight dashboard for a DPO or compliance officer to approve or reject.',
              },
              {
                q: 'Is Sovereign Shield legal advice?',
                a: 'No. Sovereign Shield enforces policy and creates evidence. It does not replace legal counsel. Adequacy decisions and SCC validity can change — consult a DPO or privacy lawyer for your specific situation.',
              },
            ].map((item, index) => (
              <div
                key={index}
                className={`border-b border-slate-200 last:border-b-0 ${openFaq === index ? 'bg-slate-50' : ''}`}
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full flex items-center justify-between gap-4 text-left p-6 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-lg font-semibold text-slate-900 flex-1">{item.q}</span>
                  {openFaq === index ? (
                    <ChevronUp className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6 text-base text-slate-600 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 9 — Footer (Dark) */}
      <footer className="bg-[#0f172a] py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {/* Left */}
            <div className="space-y-3">
              <div className="mb-2">
                <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
                  <span className="text-lg font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
                  <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
                </h1>
              </div>
              <p className="text-sm text-slate-400">
                Sovereign Shield — GDPR Chapter V Runtime Enforcement
              </p>
              <p className="text-xs text-slate-500">
                © 2026 Veridion Nexus. Built in the EU.
              </p>
            </div>

            {/* Center Links */}
            <div className="space-y-2">
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/login` 
                  : 'https://app.veridion-nexus.eu/login'}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                Dashboard
              </a>
              <a
                href="#faq"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                Documentation
              </a>
              <a
                href={process.env.NEXT_PUBLIC_DASHBOARD_URL && !process.env.NEXT_PUBLIC_DASHBOARD_URL.includes('localhost') 
                  ? `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/adequate-countries` 
                  : 'https://app.veridion-nexus.eu/adequate-countries'}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                Adequate Countries
              </a>
              <a
                href="#"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                Privacy Policy
              </a>
            </div>

            {/* Right */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <span>Data centers:</span>
                <span>Hetzner (EU)</span>
                <span>🇩🇪</span>
              </div>
              <a
                href="https://veridion-nexus.eu"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-400 hover:text-sky-400 transition-colors text-sm"
              >
                veridion-nexus.eu
              </a>
              <div className="bg-slate-800 border border-slate-700 rounded-full px-3 py-1 inline-block text-xs text-slate-300">
                GDPR Art. 44-49 Infrastructure Supporting Demonstrable Compliance
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
