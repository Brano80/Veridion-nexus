'use client';

import React, { useState, useEffect } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface CountryData {
  code: string;
  name: string;
  status: 'adequate_protection' | 'scc_required' | 'blocked';
  sccDisplay?: 'fill' | 'border'; // 'fill' = full orange, 'border' = orange border only
  transfers?: number;
  mechanisms?: number;
}

interface WorldMapProps {
  countries?: CountryData[];
  markers?: { lat: number; lng: number; code: string; name: string; color: string }[];
  isLoading?: boolean;
  onCountryClick?: (country: CountryData) => void;
}

// Fill: muted pastel colors — professional compliance dashboard style
const getCountryFill = (countryData: CountryData | null): string => {
  if (!countryData) return '#334155';
  const isRed = countryData.status === 'blocked';
  const isOrangeFill = countryData.status === 'scc_required' && countryData.sccDisplay === 'fill';
  const isGreen = countryData.status === 'adequate_protection';
  if (isRed) return '#fca5a580';       // muted pastel red
  if (isOrangeFill) return '#fdba7480'; // muted pastel orange
  if (isGreen) return '#86efac80';     // muted pastel green
  return '#334155';
};

// Stroke: muted orange for orange-border state (SCC Covered), else default
const getCountryStroke = (countryData: CountryData | null): string => {
  if (!countryData) return '#64748b';
  const isOrangeBorder = countryData.status === 'scc_required' && countryData.sccDisplay === 'border';
  return isOrangeBorder ? '#fdba74' : '#64748b';
};

const getCountryStrokeWidth = (countryData: CountryData | null): number => {
  if (!countryData) return 0.5;
  const isOrangeBorder = countryData.status === 'scc_required' && countryData.sccDisplay === 'border';
  return isOrangeBorder ? 2 : 0.5;
};

const formatStatus = (countryData: CountryData | null): string => {
  if (!countryData) return 'Unknown';
  switch (countryData.status) {
    case 'adequate_protection':
      return 'Adequate Protection';
    case 'scc_required':
      return countryData.sccDisplay === 'fill' ? 'SCC Required (Unresolved)' : 'SCC Required (Covered)';
    case 'blocked':
      return 'Blocked (24h)';
    default:
      return 'Unknown';
  }
};

const WorldMap: React.FC<WorldMapProps> = ({ countries = [], markers = [], isLoading, onCountryClick }) => {
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [countryMap, setCountryMap] = useState<Map<string, CountryData>>(new Map());

  useEffect(() => {
    // Build countryMap keyed by name - TopoJSON uses "name" property
    // Use case-insensitive matching for robustness
    const map = new Map<string, CountryData>();
    countries.forEach(country => {
      // Store both exact and lowercase versions for matching
      map.set(country.name, country);
      map.set(country.name.toLowerCase(), country);
    });
    setCountryMap(map);
  }, [countries]);

  const getCountryData = (countryName: string | undefined): CountryData | null => {
    if (!countryName || typeof countryName !== 'string') return null;
    // Try exact match first, then case-insensitive
    return countryMap.get(countryName) || countryMap.get(countryName.toLowerCase()) || null;
  };

  const handleMouseEnter = (geo: any, event: React.MouseEvent) => {
    const countryName = geo.properties.name;
    const countryData = getCountryData(countryName);

    if (countryData) {
      const rect = (event.target as SVGElement).getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      });

      setTooltipContent(`${countryData.name}\nStatus: ${formatStatus(countryData)}\nTransfers: ${countryData.transfers || 0}\nMechanisms: ${countryData.mechanisms || 0}`);
    }
  };

  const handleMouseLeave = () => {
    setTooltipContent(null);
    setTooltipPosition(null);
  };

  const handleCountryClick = (geo: any) => {
    const countryName = geo.properties.name;
    const countryData = getCountryData(countryName);

    if (countryData && onCountryClick) {
      onCountryClick(countryData);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-slate-400">Loading world map...</div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      <div className="mb-2">
        <span className="text-sm font-semibold text-white">TRANSFER MAP</span>
      </div>
      
      <div className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden relative" style={{ height: '400px' }}>
        <ComposableMap
          projectionConfig={{
            scale: 150,
            center: [0, 20],
          }}
          className="w-full h-full"
        >
          <ZoomableGroup center={[0, 20]} zoom={1.35}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const countryName = geo.properties.name;
                  const countryData = getCountryData(countryName);
                  const isOrangeBorder = countryData?.status === 'scc_required' && countryData?.sccDisplay === 'border';
                  const fillColor = getCountryFill(countryData);
                  const strokeColor = getCountryStroke(countryData);
                  const strokeWidth = getCountryStrokeWidth(countryData);
                  const fill = isOrangeBorder ? 'transparent' : fillColor;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      onMouseEnter={(event) => handleMouseEnter(geo, event)}
                      onMouseLeave={handleMouseLeave}
                      onClick={() => handleCountryClick(geo)}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", opacity: 0.8 },
                        pressed: { outline: "none" }
                      }}
                    />
                  );
                })
              }
            </Geographies>
            {markers.map((marker) => (
              <Marker key={marker.code} coordinates={[marker.lng, marker.lat]}>
                <circle r={8} fill={marker.color} fillOpacity={0.3} />
                <circle r={5} fill={marker.color} stroke="#1e293b" strokeWidth={1.5} />
                <text textAnchor="middle" y={-12} fontSize={8} fill="#e2e8f0">
                  {marker.name}
                </text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#86efac80' }}></div>
          <span className="text-xs text-slate-300">Adequate Protection</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fdba7480' }}></div>
          <span className="text-xs text-slate-300">SCC Required (Unresolved)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 bg-transparent" style={{ borderColor: '#fdba74' }}></div>
          <span className="text-xs text-slate-300">SCC Required (Covered)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fca5a580' }}></div>
          <span className="text-xs text-slate-300">Blocked transfers (24h)</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltipContent && tooltipPosition && (
        <div
          className="fixed z-50 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white shadow-lg pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <pre className="whitespace-pre-wrap font-mono">{tooltipContent}</pre>
        </div>
      )}
    </div>
  );
};

export default WorldMap;
