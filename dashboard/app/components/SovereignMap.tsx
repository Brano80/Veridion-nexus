'use client';

import React, { useState, useEffect, useMemo } from 'react';
import WorldMap from './WorldMap';
import { EvidenceEvent, SCCRegistry } from '../utils/api';
import {
  EU_EEA_COUNTRIES,
  SCC_REQUIRED_COUNTRIES,
  BLOCKED_COUNTRIES,
  ADEQUATE_COUNTRIES,
  COUNTRY_NAMES,
  TOPOJSON_COUNTRY_NAMES,
  SMALL_COUNTRY_MARKERS,
  getCountryCodeFromName,
} from '../config/countries';
import { evidenceEventIsDecided } from '../utils/evidenceDecided';

interface SovereignMapProps {
  evidenceEvents?: EvidenceEvent[];
  sccRegistries?: SCCRegistry[];
  decidedEvidenceIds?: Set<string>;
  isLoading?: boolean;
  onCountryClick?: (country: any) => void;
}

interface CountryData {
  code: string;
  name: string;
  status: 'adequate_protection' | 'scc_required' | 'blocked';
  sccDisplay?: 'fill' | 'border'; // 'fill' = full orange, 'border' = orange border only
  transfers: number;
}

function hasValidSCCForPartner(
  sccRegistries: SCCRegistry[],
  partnerName: string,
  countryCode: string
): boolean {
  const partnerNorm = (partnerName || '').trim().toLowerCase();
  const countryNorm = countryCode.toUpperCase();
  if (!partnerNorm) return false;

  return sccRegistries.some((scc) => {
    if (scc.status !== 'active' && scc.status !== 'Valid') return false;
    const sccCountryRaw = getCountryCodeFromName(scc.destinationCountry) || (scc.destinationCountry.length === 2 ? scc.destinationCountry : '');
    const sccCountry = sccCountryRaw.toUpperCase();
    if (!sccCountry || sccCountry !== countryNorm) return false;
    if (scc.expiryDate && new Date(scc.expiryDate) <= new Date()) return false;
    const sccPartner = (scc.partnerName || '').trim().toLowerCase();
    return sccPartner === partnerNorm || sccPartner.includes(partnerNorm) || partnerNorm.includes(sccPartner);
  });
}

const SovereignMap: React.FC<SovereignMapProps> = ({
  evidenceEvents = [],
  sccRegistries = [],
  decidedEvidenceIds = new Set(),
  isLoading,
  onCountryClick,
}) => {
  const [countries, setCountries] = useState<CountryData[]>([]);

  const processedCountries = useMemo(() => {
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const greenCountries = new Set<string>();
    const redCountries = new Set<string>();
    const orangeFillCountries = new Set<string>();
    const orangeBorderCountries = new Set<string>();

    if (!evidenceEvents || evidenceEvents.length === 0) {
      return { countries: [], markers: [] };
    }

    const isSccRequiredCountry = (code: string) =>
      SCC_REQUIRED_COUNTRIES.has(code) ||
      (!EU_EEA_COUNTRIES.has(code) && !ADEQUATE_COUNTRIES.has(code) && !BLOCKED_COUNTRIES.has(code));

    evidenceEvents.forEach((event: any) => {
      const payload = event.payload || {};
      const destCode =
        event.destinationCountryCode ||
        event.destination_country_code ||
        payload.destinationCountryCode ||
        payload.destination_country_code ||
        payload.country_code;
      const destCountry =
        event.destinationCountry ||
        event.destination_country ||
        payload.destination_country ||
        payload.destinationCountry;
      let countryCode = (destCode || '').trim().toUpperCase();
      if (!countryCode && destCountry) {
        countryCode = getCountryCodeFromName(destCountry);
      }

      if (!countryCode || countryCode === 'EU' || countryCode === 'UN' || countryCode.length !== 2) return;

      const eventTime = event.occurredAt || event.recordedAt || event.createdAt;
      if (!eventTime) return;

      const isDecided = evidenceEventIsDecided(event, decidedEvidenceIds);
      const eventTimestamp = new Date(eventTime).getTime();
      // Orange border (SCC covered): use decision time when available
      const decisionTimeRaw = event.recordedAt || event.recorded_at || event.updatedAt || event.updated_at || event.occurredAt || event.createdAt;
      const decisionTimestamp = decisionTimeRaw ? new Date(decisionTimeRaw).getTime() : eventTimestamp;

      const eventType = (event.eventType || '').toUpperCase();
      const isBlocked = eventType === 'DATA_TRANSFER_BLOCKED' || eventType === 'TRANSFER_EVALUATION_BLOCKED' || eventType === 'AGENT_POLICY_VIOLATION' || eventType.includes('BLOCK') || (event.verificationStatus || '').toUpperCase() === 'BLOCK';
      const isReview = eventType === 'DATA_TRANSFER_REVIEW' || eventType === 'TRANSFER_EVALUATION_REVIEW' || (event.verificationStatus || '').toUpperCase() === 'REVIEW';
      const isAllow = eventType === 'DATA_TRANSFER' || eventType === 'TRANSFER_EVALUATION' || (event.verificationStatus || '').toUpperCase() === 'ALLOW';

      const countryStatus = (payload.country_status || payload.countryStatus || '').toLowerCase();
      const isSccCovered = isAllow && countryStatus === 'scc_required';

      const partnerName = payload.partner_name || payload.partnerName || '';

      // Red: blocked transfers in last 24h only (event-driven) — skip decided
      if (!isDecided && isBlocked && eventTimestamp >= twentyFourHoursAgo) {
        redCountries.add(countryCode);
      }

      // Green: adequate/EU countries with transfers in last 24h (include decided)
      // Always green for EU/EEA and adequate countries regardless of stored decision
      // (Shadow Mode stores BLOCK for enforcement purposes even when decision is ALLOW)
      if (eventTimestamp >= twentyFourHoursAgo) {
        if (EU_EEA_COUNTRIES.has(countryCode) || ADEQUATE_COUNTRIES.has(countryCode)) {
          greenCountries.add(countryCode);
        }
      }

      // Orange fill: unresolved REVIEW transfers (no valid SCC for partner) in last 24h — skip decided
      const hasValidSCC = hasValidSCCForPartner(sccRegistries, partnerName, countryCode);
      if (!isDecided && isReview && isSccRequiredCountry(countryCode) && eventTimestamp >= twentyFourHoursAgo) {
        if (!hasValidSCC) {
          orangeFillCountries.add(countryCode);
        }
      }

      // Orange border: (1) ALLOW + country_status scc_required, or (2) REVIEW + valid SCC now registered
      // Case 2: user registered SCC after the transfer; event was REVIEW but SCC now covers partner/country
      if (decisionTimestamp >= twentyFourHoursAgo && isSccRequiredCountry(countryCode) && !orangeFillCountries.has(countryCode)) {
        const sccNowCovers = isSccCovered || (isReview && hasValidSCC);
        if (sccNowCovers) {
          orangeBorderCountries.add(countryCode);
        }
      }
    });

    // Route countries with decision=BLOCK to the correct color set based on GDPR status.
    // EU/EEA and adequate countries are always green (Shadow Mode stores BLOCK even for
    // allowed transfers — never let that override their inherent adequate status).
    // SCC-required countries (e.g. US) go orange, not red.
    // Only truly blocked countries (no legal basis) go red.
    evidenceEvents
      .filter((e) => {
        if (evidenceEventIsDecided(e, decidedEvidenceIds)) return false;
        const isRecent = new Date(e.occurredAt || e.recordedAt || e.createdAt).getTime() >= twentyFourHoursAgo;
        const payload = e.payload || {};
        const decision = payload.decision || (e as any).decision;
        return isRecent && decision === 'BLOCK';
      })
      .forEach((e) => {
        const payload = e.payload || {};
        const code = (
          payload.destination_country_code ||
          payload.destinationCountryCode ||
          (payload.destination_country || payload.destinationCountry
            ? getCountryCodeFromName(payload.destination_country || payload.destinationCountry || '')
            : '')
        )
          .toString()
          .trim()
          .toUpperCase();
        if (!code || code.length !== 2) return;

        if (EU_EEA_COUNTRIES.has(code) || ADEQUATE_COUNTRIES.has(code)) {
          // EU/EEA or adequate: always green, never red
          greenCountries.add(code);
        } else if (isSccRequiredCountry(code)) {
          // SCC-required country: orange (unresolved or covered), not red
          const partnerName = payload.partner_name || payload.partnerName || '';
          const hasValidSCC = hasValidSCCForPartner(sccRegistries, partnerName, code);
          if (hasValidSCC) {
            orangeBorderCountries.add(code);
          } else {
            orangeFillCountries.add(code);
          }
        } else {
          // Truly blocked (no legal basis)
          redCountries.add(code);
        }
      });

    const convertedCountries: CountryData[] = [];
    const allCountryCodes = new Set([...greenCountries, ...redCountries, ...orangeFillCountries, ...orangeBorderCountries]);

    allCountryCodes.forEach((countryCode) => {
      if (!/^[A-Z]{2}$/.test(countryCode)) return;

      let status: 'adequate_protection' | 'scc_required' | 'blocked';
      let sccDisplay: 'fill' | 'border' | undefined;

      if (redCountries.has(countryCode)) {
        status = 'blocked';
      } else if (greenCountries.has(countryCode)) {
        status = 'adequate_protection';
      } else if (orangeFillCountries.has(countryCode)) {
        status = 'scc_required';
        sccDisplay = 'fill';
      } else if (orangeBorderCountries.has(countryCode)) {
        status = 'scc_required';
        sccDisplay = 'border';
      } else {
        return;
      }

      const mappedName = TOPOJSON_COUNTRY_NAMES[countryCode] || COUNTRY_NAMES[countryCode] || countryCode;
      const transferCount = evidenceEvents.filter((e: any) => {
        const p = e.payload || {};
        const code = (p.destination_country_code || p.destinationCountryCode || getCountryCodeFromName(p.destination_country || p.destinationCountry || '')).toUpperCase();
        return code === countryCode;
      }).length;

      convertedCountries.push({
        code: countryCode,
        name: mappedName,
        status,
        sccDisplay,
        transfers: transferCount,
      });
    });

    const markers: { lat: number; lng: number; code: string; name: string; color: string }[] = [];
    const countryByCode = new Map(convertedCountries.map((c) => [c.code, c]));
    for (const [code, info] of Object.entries(SMALL_COUNTRY_MARKERS)) {
      const country = countryByCode.get(code);
      if (!country) continue;
      let color: string;
      if (country.status === 'blocked') color = '#ef4444';
      else if (country.status === 'adequate_protection') color = '#22c55e';
      else color = '#f97316';
      markers.push({ code, lat: info.lat, lng: info.lng, name: info.name, color });
    }

    return { countries: convertedCountries, markers };
  }, [evidenceEvents, sccRegistries, decidedEvidenceIds]);

  useEffect(() => {
    setCountries(processedCountries.countries);
  }, [processedCountries]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-400">Loading map...</div>
      </div>
    );
  }

  return (
    <WorldMap
      countries={countries}
      markers={processedCountries.markers}
      isLoading={isLoading}
      onCountryClick={onCountryClick}
    />
  );
};

export default SovereignMap;
