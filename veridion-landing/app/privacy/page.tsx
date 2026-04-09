'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Main Content */}
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-3">Privacy Policy</h1>
            <p className="text-slate-600 text-lg">Last updated: 8 March 2026</p>
            <p className="text-slate-500 text-sm mt-2 italic">
              This privacy policy fulfills our obligations under GDPR Art. 13 (information to be provided when personal data are collected from the data subject).
            </p>
          </div>

          {/* Section 1 — Who We Are */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Who We Are</h2>
            <p className="text-slate-700 leading-relaxed">
              Veridion Nexus operates Sovereign Shield, a GDPR Chapter V runtime enforcement and evidence service. For questions about this policy or data requests, contact us at:{' '}
              <a href="mailto:privacy@veridion-nexus.eu" className="text-emerald-600 hover:text-emerald-700 underline">
                privacy@veridion-nexus.eu
              </a>
            </p>
          </section>

          {/* Section 2 — What Data We Collect and Why */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">What Data We Collect and Why</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Account data</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  When you register, we collect your email address, company name, and a bcrypt-hashed password. We use this to create and manage your account.
                </p>
                <p className="text-slate-600 text-sm italic">
                  Legal basis: Art. 6(1)(b) GDPR — performance of a contract.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">API usage data</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  When you call our API, we store the transfer evaluation requests you submit — including destination country, partner name, data categories, and the resulting decision (ALLOW/BLOCK/REVIEW). This data forms your evidence vault and is the core service you signed up for.
                </p>
                <p className="text-slate-600 text-sm italic">
                  Legal basis: Art. 6(1)(b) GDPR — performance of a contract.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Technical data</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  We store your API key hash (never the raw key), tenant identifier, enforcement mode, and trial expiry date. We also log IP addresses for rate limiting (5 requests per IP per hour on registration).
                </p>
                <p className="text-slate-600 text-sm italic">
                  Legal basis: Art. 6(1)(f) GDPR — legitimate interest in service security and abuse prevention.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Email communications</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  We send a welcome email upon registration containing your API key. We do not send marketing emails.
                </p>
                <p className="text-slate-600 text-sm italic">
                  Legal basis: Art. 6(1)(b) GDPR — performance of a contract.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 — Where Your Data Is Stored */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Where Your Data Is Stored</h2>
            <p className="text-slate-700 leading-relaxed">
              All data is stored on servers operated by Hetzner Online GmbH, located in the European Union (Germany/Finland). No personal data is transferred outside the EU/EEA as part of our infrastructure.
            </p>
          </section>

          {/* Section 4 — How Long We Keep Your Data */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">How Long We Keep Your Data</h2>
            <ul className="space-y-2 text-slate-700 leading-relaxed list-disc list-inside">
              <li>Account and API usage data: retained for the duration of your account plus 12 months after deletion request or trial expiry</li>
              <li>Evidence vault records: retained for the duration of your account — these records support your GDPR Art. 30 obligations and are not deleted during active use</li>
              <li>Rate limiting logs: deleted within 24 hours</li>
            </ul>
          </section>

          {/* Section 5 — Data We Do Not Collect */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Data We Do Not Collect</h2>
            <p className="text-slate-700 leading-relaxed">
              We do not collect payment card data (no payment processing is currently implemented). We do not use cookies for tracking. We do not use analytics services. We do not sell or share your data with third parties for commercial purposes.
            </p>
          </section>

          {/* Section 6 — Your Rights Under GDPR */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Your Rights Under GDPR</h2>
            <p className="text-slate-700 leading-relaxed mb-4">
              As a data subject under GDPR, you have the right to:
            </p>
            <ul className="space-y-3 text-slate-700 leading-relaxed">
              <li className="flex items-start">
                <span className="font-semibold mr-2">Access (Art. 15)</span>
                <span>— Request a copy of all personal data we hold about you</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">Rectification (Art. 16)</span>
                <span>— Request correction of inaccurate or incomplete data</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">Erasure (Art. 17)</span>
                <span>— Request deletion of your data (subject to legal retention requirements)</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">Portability (Art. 20)</span>
                <span>— Receive your data in a structured, machine-readable format</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">Restriction (Art. 18)</span>
                <span>— Request limitation of processing in certain circumstances</span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">Object (Art. 21)</span>
                <span>— Object to processing based on legitimate interests</span>
              </li>
            </ul>
            <p className="text-slate-700 leading-relaxed mt-4">
              To exercise any of these rights, contact:{' '}
              <a href="mailto:privacy@veridion-nexus.eu" className="text-emerald-600 hover:text-emerald-700 underline">
                privacy@veridion-nexus.eu
              </a>
              . We will respond within one month (30 days) as required by GDPR Art. 12(3).
            </p>
          </section>

          {/* Section 7 — Security */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Security</h2>
            <p className="text-slate-700 leading-relaxed">
              Passwords are stored as bcrypt hashes and never in plaintext. API keys are stored as SHA-256 hashes — the raw key is shown once at registration and never stored. All data in transit is encrypted via TLS (managed by Caddy). Database backups are encrypted at rest on Hetzner infrastructure.
            </p>
          </section>

          {/* Section 8 — Changes to This Policy */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Changes to This Policy</h2>
            <p className="text-slate-700 leading-relaxed">
              We may update this policy as the service evolves. Material changes will be communicated via email to registered users. The date at the top of this page reflects the latest revision.
            </p>
          </section>

          {/* Section 9 — Supervisory Authority */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Supervisory Authority</h2>
            <p className="text-slate-700 leading-relaxed">
              You have the right to lodge a complaint with your national data protection authority. If you are based in the EU, you may contact the supervisory authority in your country of residence. A list of EU DPAs is available at:{' '}
              <a href="https://edpb.europa.eu" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-700 underline">
                edpb.europa.eu
              </a>
            </p>
          </section>

          {/* Final Note Box */}
          <div className="border-l-4 border-amber-400 bg-amber-50 p-6 rounded-r-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-slate-900 text-sm leading-relaxed">
                This privacy policy was prepared based on the current technical implementation of Sovereign Shield. It has not been reviewed by legal counsel. If you have specific compliance requirements, we recommend independent legal review before relying on this document.
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
