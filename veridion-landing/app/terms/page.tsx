'use client';

import { useState } from 'react';
import { Menu, X, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a] border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo */}
            <Link href="/" className="flex items-center">
              <h1 className="flex items-baseline gap-1.5" style={{ fontFamily: "Inter, sans-serif" }}>
                <span className="text-xl font-black italic uppercase text-white" style={{ letterSpacing: "-0.05em", lineHeight: 0.85 }}>VERIDION</span>
                <span className="text-base font-semibold italic lowercase" style={{ color: "#10b981", letterSpacing: "-0.02em", filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))" }}>nexus</span>
              </h1>
            </Link>

            {/* Right: Desktop Nav */}
            <div className="hidden md:flex items-center gap-6">
              <Link href="/docs" className="text-slate-300 hover:text-white transition-colors text-sm">
                Documentation
              </Link>
              <Link href="/spec" className="text-slate-300 hover:text-white transition-colors text-sm">
                Spec
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
              <Link href="/spec" className="block text-slate-300 hover:text-white transition-colors text-sm" onClick={() => setMobileMenuOpen(false)}>
                Spec
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

      {/* Main Content */}
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-3">Terms of Service</h1>
            <p className="text-slate-600 text-lg">Last updated: 8 March 2026</p>
          </div>

          {/* Section 1 — Acceptance of Terms */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-700 leading-relaxed">
              By accessing or using Sovereign Shield, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the service.
            </p>
          </section>

          {/* Section 2 — Description of Service */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Description of Service</h2>
            <p className="text-slate-700 leading-relaxed">
              Sovereign Shield is a GDPR Art. 44-49 compliance evidence tool designed to help organizations monitor and document international data transfers. The service provides structured evidence support for regulatory compliance purposes. Sovereign Shield is not legal advice, and we do not guarantee compliance with any specific regulation or standard. You are responsible for ensuring your use of the service meets your legal obligations.
            </p>
          </section>

          {/* Section 3 — Free Trial */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Free Trial</h2>
            <p className="text-slate-700 leading-relaxed">
              We offer a 30-day free trial period. During the trial:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside mt-3">
              <li>The service operates in Shadow Mode only — no actual blocking of transfers occurs</li>
              <li>No credit card is required to start the trial</li>
              <li>An invite code is required for trial access</li>
              <li>At the end of the trial period, access will be suspended unless you upgrade to a paid plan</li>
            </ul>
          </section>

          {/* Section 4 — Paid Plans */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Paid Plans</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Paid plans are available starting at €199 per month (Pro plan). Payment terms:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li>You may cancel your subscription at any time</li>
              <li>No refunds are provided for partial months — cancellation takes effect at the end of the current billing period</li>
              <li>We reserve the right to change pricing with 30 days' notice to existing customers</li>
            </ul>
          </section>

          {/* Section 5 — Acceptable Use */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Acceptable Use</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              You agree to use Sovereign Shield only for legitimate business purposes. Prohibited activities include:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li>Using the service if you are not a legitimate business entity</li>
              <li>Abusing the API through excessive requests, automated attacks, or attempts to disrupt service availability</li>
              <li>Reselling or redistributing access to the service without our written permission</li>
              <li>Using the service for any illegal purpose or in violation of applicable laws</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-3">
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </section>

          {/* Section 6 — Data Processing */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Data Processing</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Under GDPR, you are the data controller for the personal data you process through Sovereign Shield. We act as a data processor. You are responsible for:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li>Accurately classifying your data categories</li>
              <li>Correctly identifying and classifying international data transfers</li>
              <li>Ensuring you have appropriate legal basis for processing personal data</li>
              <li>Complying with all applicable data protection laws</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-3">
              We process your data only as necessary to provide the service, as described in our Privacy Policy.
            </p>
          </section>

          {/* Section 7 — Limitations of Liability */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Limitations of Liability</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Sovereign Shield provides structured evidence support for compliance purposes. However:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li>We do not guarantee compliance with GDPR, EU AI Act, or any other regulation</li>
              <li>We are not liable for regulatory fines, penalties, or legal consequences arising from your use of the service</li>
              <li>The service is provided "as is" without warranties of any kind, express or implied</li>
              <li>Our total liability is limited to the amount you paid for the service in the 12 months preceding any claim</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-3">
              You are solely responsible for ensuring your compliance with applicable laws and regulations.
            </p>
          </section>

          {/* Section 8 — Termination */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Termination</h2>
            <p className="text-slate-700 leading-relaxed mb-3">
              Either party may terminate service:
            </p>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li><strong>By you:</strong> You may cancel your subscription at any time through your account settings or by contacting support</li>
              <li><strong>By us:</strong> We may suspend or terminate accounts immediately for abuse, violation of these terms, or non-payment</li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-3">
              Upon termination, your access to the service will cease. We will retain your data for 12 months after termination as described in our Privacy Policy, after which it will be deleted.
            </p>
          </section>

          {/* Section 9 — Governing Law */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Governing Law</h2>
            <p className="text-slate-700 leading-relaxed">
              These Terms of Service are governed by Slovak law. Any disputes arising from these terms or your use of the service shall be subject to the exclusive jurisdiction of the courts of Slovakia and the European Union.
            </p>
          </section>

          {/* Section 10 — Contact */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Contact</h2>
            <p className="text-slate-700 leading-relaxed">
              For questions about these Terms of Service, contact us at:{' '}
              <a href="mailto:legal@veridion-nexus.eu" className="text-emerald-600 hover:text-emerald-700 underline">
                legal@veridion-nexus.eu
              </a>
            </p>
          </section>

          {/* Final Note Box */}
          <div className="border-l-4 border-amber-400 bg-amber-50 p-6 rounded-r-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-slate-900 text-sm leading-relaxed">
                These Terms of Service were prepared based on the current technical implementation of Sovereign Shield. They have not been reviewed by legal counsel. If you have specific legal requirements, we recommend independent legal review before relying on this document.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0f172a] py-12 md:py-16 mt-16">
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
              <Link href="/docs" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Documentation
              </Link>
              <Link href="/spec" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Spec
              </Link>
              <Link href="/privacy" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Privacy Policy
              </Link>
              <Link href="/terms" className="block text-slate-400 hover:text-sky-400 transition-colors text-sm">
                Terms of Service
              </Link>
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
