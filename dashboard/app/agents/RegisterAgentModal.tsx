'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Plus, Search, Check } from 'lucide-react';
import { registerAgent } from '../utils/api';
import { COUNTRY_NAMES } from '../config/countries';

const DATA_CATEGORIES = [
  'email', 'name', 'phone_number', 'address', 'financial_data',
  'health_data', 'biometric_data', 'location_data', 'behavioral_data',
];

const ALL_COUNTRIES = Object.entries(COUNTRY_NAMES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

interface Props {
  open: boolean;
  agentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RegisterAgentModal({ open, agentName, onClose, onSuccess }: Props) {
  const [name, setName] = useState(agentName);
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [url, setUrl] = useState('');
  const [providerOrg, setProviderOrg] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [partnerInput, setPartnerInput] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const countryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(agentName);
  }, [agentName]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!open) return null;

  function toggleCategory(cat: string) {
    setCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  }

  function toggleCountry(code: string) {
    setCountries(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function addPartner() {
    const val = partnerInput.trim();
    if (val && !partners.includes(val)) {
      setPartners(prev => [...prev, val]);
    }
    setPartnerInput('');
  }

  function removePartner(p: string) {
    setPartners(prev => prev.filter(x => x !== p));
  }

  const filteredCountries = ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  async function handleSubmit() {
    setError('');
    if (!name.trim()) { setError('Agent name is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    if (categories.length === 0) { setError('Select at least one data category'); return; }
    if (countries.length === 0) { setError('Select at least one destination country'); return; }
    if (partners.length === 0) { setError('Add at least one partner'); return; }

    setSubmitting(true);
    try {
      await registerAgent({
        name: name.trim(),
        description: description.trim(),
        version: version.trim() || '1.0.0',
        url: url.trim() || undefined,
        provider_org: providerOrg.trim() || undefined,
        allowed_data_categories: categories,
        allowed_destination_countries: countries,
        allowed_partners: partners,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Register Agent</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Agent Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Customer Support Bot"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Purpose and function of this agent"
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Version + URL row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Version</label>
              <input
                type="text"
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Agent URL</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Provider Organisation</label>
            <input
              type="text"
              value={providerOrg}
              onChange={e => setProviderOrg(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Data Categories */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Allowed Data Categories *</label>
            <div className="flex flex-wrap gap-2">
              {DATA_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    categories.includes(cat)
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {categories.includes(cat) && <Check className="w-3 h-3 inline mr-1" />}
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Countries */}
          <div ref={countryRef}>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Allowed Destination Countries *</label>
            {countries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {countries.map(code => (
                  <span key={code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    {code} — {COUNTRY_NAMES[code] || code}
                    <button type="button" onClick={() => toggleCountry(code)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <div className="flex items-center bg-slate-900 border border-slate-600 rounded-lg overflow-hidden focus-within:border-emerald-500">
                <Search className="w-4 h-4 text-slate-500 ml-3 shrink-0" />
                <input
                  type="text"
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  onFocus={() => setCountryDropdownOpen(true)}
                  placeholder="Search countries..."
                  className="w-full px-2 py-2 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
              {countryDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg max-h-48 overflow-y-auto shadow-xl">
                  {filteredCountries.map(c => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCountry(c.code)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-800 transition-colors ${
                        countries.includes(c.code) ? 'text-emerald-400' : 'text-slate-300'
                      }`}
                    >
                      <span>{c.code} — {c.name}</span>
                      {countries.includes(c.code) && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-500">No countries found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Partners */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Allowed Partners *</label>
            {partners.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {partners.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/25">
                    {p}
                    <button type="button" onClick={() => removePartner(p)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={partnerInput}
                onChange={e => setPartnerInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPartner(); } }}
                placeholder="Type partner name and press Enter"
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={addPartner}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Registering...' : 'Register Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
