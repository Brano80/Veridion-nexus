'use client';

import DashboardLayout from '../components/DashboardLayout';
import { ADEQUATE_COUNTRY_LIST, SCC_REQUIRED_COUNTRY_LIST, BLOCKED_COUNTRY_LIST } from '../config/countries';
import { Shield, Globe, Info } from 'lucide-react';

function CountryCard({
  country,
  badgeLabel,
  badgeClass,
  borderHoverClass,
  legalBasis,
  actionLink,
}: {
  country: { name: string; code: string; flag: string; note?: string; badgeLabel?: string };
  badgeLabel: string;
  badgeClass: string;
  borderHoverClass: string;
  legalBasis?: string;
  actionLink?: string;
}) {
  const displayBadgeLabel = country.badgeLabel || badgeLabel;
  return (
    <div
      className={`p-4 bg-slate-700/50 rounded-lg border border-slate-600 transition-colors ${borderHoverClass}`}
    >
      <div>
        <div className="text-sm font-medium text-white">{country.name}</div>
        <div className="text-xs text-slate-400">{country.code}</div>
        {country.note && (
          <div className="text-xs text-slate-500 mt-1 italic">{country.note}</div>
        )}
      </div>
      <div className="mt-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${badgeClass}`}>
          {displayBadgeLabel}
        </span>
        {legalBasis && (
          <div className="text-xs text-slate-500 mt-1">{legalBasis}</div>
        )}
      </div>
      {actionLink && (
        <a 
          href={actionLink}
          className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
        >
          Register SCC → 
        </a>
      )}
    </div>
  );
}

export default function AdequateCountriesPage() {
  const adequateCount = ADEQUATE_COUNTRY_LIST.length;
  const sccRequiredCount = SCC_REQUIRED_COUNTRY_LIST.length;
  const blockedCount = BLOCKED_COUNTRY_LIST.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Country Classifications</h1>
          <p className="text-slate-400 text-sm">
            EU adequacy, SCC-required, and blocked destinations
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Based on EU Commission adequacy decisions where applicable. Lists may not be exhaustive or current; check official Commission sources. Last reviewed: March 2026.
          </p>
        </div>

        {/* KPI Summary Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">ADEQUATE</div>
              <Shield className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-white">{adequateCount}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">SCC REQUIRED</div>
              <Globe className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-white">{sccRequiredCount}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">DPF CERTIFIED (US)</div>
              <Shield className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-white">Partial</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-400 font-medium">BLOCKED</div>
              <Shield className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-white">{blockedCount}</div>
          </div>
        </div>

        {/* Brazil Adequacy Callout */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white">⚡ NEW — Brazil Adequacy Decision</span>
              </div>
              <p className="text-xs text-slate-400">
                The EU Commission adopted an adequacy decision for Brazil in January 2026 under Art. 45 GDPR. Transfers to Brazil no longer require SCCs. Brazil has been moved to the Adequate Countries list.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* EU-Recognised Adequate Countries */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-1">EU-Recognised Adequate Countries</h2>
            <p className="text-slate-400 text-sm mb-2">
              Valid EU Commission adequacy decisions (Art. 45)
            </p>
            <a href="https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 mb-4 inline-block">
              Official Commission adequacy list →
            </a>
            <div className="grid grid-cols-1 gap-3 flex-1">
              {ADEQUATE_COUNTRY_LIST.map((country) => (
                <CountryCard
                  key={country.code}
                  country={country}
                  badgeLabel="Adequate Protection"
                  badgeClass="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  borderHoverClass="hover:border-green-500/50"
                  legalBasis="Art. 45"
                />
              ))}
            </div>
          </div>

          {/* SCC Required countries */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-1">SCC Required Countries</h2>
            <p className="text-slate-400 text-sm mb-4">
              Transfers allowed with Standard Contractual Clauses
            </p>
            <div className="grid grid-cols-1 gap-3 flex-1">
              {SCC_REQUIRED_COUNTRY_LIST.map((country) => (
                <CountryCard
                  key={country.code}
                  country={country}
                  badgeLabel="SCC Required"
                  badgeClass="bg-orange-500/20 text-orange-400"
                  borderHoverClass="hover:border-orange-500/50"
                  legalBasis="Art. 46(2)(c)"
                  actionLink={`/scc-registry?country=${country.code}`}
                />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-400">
                * US transfers to DPF-certified organizations may qualify under Art. 45 adequacy decision (EU-US Data Privacy Framework).
              </p>
            </div>
          </div>

          {/* Blocked Countries */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-1">Blocked Countries</h2>
            <p className="text-slate-400 text-sm mb-4">
              No transfer permitted under organisational policy (GDPR does not prohibit any country by name; a legal basis is required)
            </p>
            <div className="grid grid-cols-1 gap-3 flex-1">
              {BLOCKED_COUNTRY_LIST.map((country) => (
                <CountryCard
                  key={country.code}
                  country={country}
                  badgeLabel="Blocked"
                  badgeClass="bg-red-500/15 text-red-400 border border-red-500/25"
                  borderHoverClass="hover:border-red-500/50"
                  legalBasis="Art. 49 — No standard basis"
                />
              ))}
            </div>
          </div>
        </div>

        {/* DPF Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">EU-US Data Privacy Framework (DPF)</h2>
              <p className="text-slate-400 text-sm">Art. 45 adequacy for certified US companies</p>
            </div>
            <span className="px-3 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/25">
              ACTIVE — Under legal review
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            {/* Left Column - What is DPF? */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">What is DPF?</h3>
              <ul className="text-xs text-slate-400 space-y-2">
                <li>• Adopted July 2023, replaces Privacy Shield (invalidated Schrems II, 2020)</li>
                <li>• US companies self-certify with US Dept of Commerce</li>
                <li>• Certified companies: transfers permitted under Art. 45 (no SCC needed)</li>
                <li>• Non-certified US companies: SCC still required under Art. 46(2)(c)</li>
              </ul>
              <a 
                href="https://www.dataprivacyframework.gov/list" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 mt-3 inline-block"
              >
                Check DPF certification registry →
              </a>
            </div>

            {/* Right Column - Schrems III Risk */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-white mb-2">Schrems III Risk</h3>
              <ul className="text-xs text-slate-400 space-y-2">
                <li>• NOYB and Max Schrems have filed legal challenges against DPF</li>
                <li>• ECJ review expected; if invalidated, reverts to SCC-only for all US transfers</li>
                <li>• Recommendation: maintain SCCs alongside DPF reliance as contingency</li>
              </ul>
              <a 
                href="https://noyb.eu" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 mt-3 inline-block"
              >
                Monitor: noyb.eu →
              </a>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-400">
              Sovereign Shield evaluates US transfers as SCC-required by default. If your US partner is DPF-certified, you may override the legal basis in your SCC registry entry.
            </p>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2">
          <p className="text-sm text-slate-400">
            <strong className="text-white">Note:</strong> EU-Recognised adequate countries permit transfers under GDPR Article 45 without additional safeguards.
            SCC-required countries need appropriate safeguards under Art. 46 (e.g. Standard Contractual Clauses, BCRs). In specific cases, derogations under Art. 49 may apply. Blocked countries are not permitted as transfer destinations under current organisational policy; the GDPR does not prohibit transfers to any specific country by name.
          </p>
          <p className="text-xs text-slate-400">
            Other Art. 46 transfer mechanisms — including Binding Corporate Rules (BCR) and approved codes of conduct — may also provide a valid basis for cross-border transfers where applicable.
          </p>
          <p className="text-xs text-slate-500">
            This page is for illustration and policy reference only. It does not constitute legal advice. Verify current adequacy and safeguard requirements with official sources and legal counsel.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
