import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { SampleRegion, AnalysisResult } from '../services/api';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface SearchedLocation {
  name: string;
  lat: number;
  lon: number;
}

interface GlobeViewProps {
  regions: SampleRegion[];
  activeRegion: string | null;
  onRegionClick: (id: string) => void;
  analysisResult: AnalysisResult | null;
  basemapMode?: 'satellite' | 'dark' | 'streets';
  opacity?: number;
}

function MapController({
  activeRegionData,
  analysisResult,
  searchedLocation,
}: {
  activeRegionData: SampleRegion | null;
  analysisResult: AnalysisResult | null;
  searchedLocation: SearchedLocation | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (searchedLocation) {
      map.flyTo([searchedLocation.lat, searchedLocation.lon], 7, { duration: 1.8 });
      return;
    }

    if (analysisResult?.geojson && analysisResult.geojson.features?.length > 0) {
      try {
        const geoLayer = L.geoJSON(analysisResult.geojson);
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 12, duration: 1.6 });
          return;
        }
      } catch {
        // Fall back to active region
      }
    }

    if (activeRegionData) {
      map.flyTo([activeRegionData.lat, activeRegionData.lon], 7, {
        duration: 1.8,
      });
    }
  }, [activeRegionData, analysisResult, searchedLocation, map]);

  return null;
}

export default function GlobeView({
  regions,
  activeRegion,
  onRegionClick,
  analysisResult,
}: GlobeViewProps) {
  const [basemap, setBasemap] = useState<'satellite' | 'dark'>('satellite');
  const [floodOpacity, setFloodOpacity] = useState<number>(0.65);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<SearchedLocation | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  const activeRegionData = regions.find((r) => r.id === activeRegion) || null;
  const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY || 'cb1_5975_1_1e587898da6511cdfe4ac026';

  const cartoDarkUrl = `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`;
  const esriSatUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const esriLabelsUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if user is searching for one of our 8 supported regions first
    const matchedRegion = regions.find(
      (r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matchedRegion) {
      setSearchedLocation(null);
      setSearchNotice(null);
      onRegionClick(matchedRegion.id);
      return;
    }

    // Otherwise geocode via OpenStreetMap Nominatim
    setSearching(true);
    setSearchNotice(null);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const data = await resp.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        setSearchedLocation({
          name: item.display_name,
          lat,
          lon,
        });
        setSearchNotice(
          `Location navigated: ${item.display_name.split(',')[0]}. Note: No official Sen1Floods11 radar ground-truth pair is registered for this area. Select one of the 8 monitored disaster events to run segmentation.`
        );
      } else {
        setSearchNotice(`No coordinates found for "${searchQuery}".`);
      }
    } catch {
      setSearchNotice('Geocoding service unavailable. Please select from the 8 monitored regions.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-0 bg-[#070d19] overflow-hidden">
      {/* ── Top Floating Search Bar ── */}
      <div className="absolute top-16 left-86 z-20 w-96 max-w-[calc(100vw-360px)]">
        <form onSubmit={handleSearch} className="relative flex items-center shadow-xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any global city or country (e.g. Dhaka, Valencia, Miami)..."
            className="w-full bg-[#0b1329]/95 text-slate-100 placeholder-slate-400 text-xs px-3.5 py-2.5 rounded-xl border border-slate-700/80 focus:outline-none focus:border-sky-500 shadow-2xl backdrop-blur-md"
          />
          <button
            type="submit"
            disabled={searching}
            className="absolute right-2 px-2.5 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition"
          >
            {searching ? '...' : 'Search'}
          </button>
        </form>

        {/* Informative Scientific Notice when browsing arbitrary locations */}
        {searchNotice && (
          <div className="mt-2 bg-[#0b1329]/95 border border-amber-500/40 rounded-xl p-3 shadow-2xl text-[11px] text-amber-300 flex items-start justify-between gap-2 backdrop-blur-md animate-fadeIn">
            <div className="flex items-start gap-2">
              <span className="text-base mt-[-2px]">ℹ️</span>
              <p className="leading-snug">{searchNotice}</p>
            </div>
            <button
              onClick={() => setSearchNotice(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── High-Res Natural Earth Map Container ── */}
      <MapContainer
        center={[20.0, 0.0]}
        zoom={3}
        minZoom={2}
        className="w-full h-full"
        zoomControl={false}
      >
        {basemap === 'satellite' ? (
          <>
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri World Imagery</a>'
              url={esriSatUrl}
              maxZoom={19}
            />
            {/* Reference boundaries & place labels overlay */}
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com/">Esri Places</a>'
              url={esriLabelsUrl}
              maxZoom={19}
              opacity={0.65}
            />
          </>
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url={cartoDarkUrl}
            maxZoom={19}
          />
        )}

        <MapController
          activeRegionData={activeRegionData}
          analysisResult={analysisResult}
          searchedLocation={searchedLocation}
        />

        {/* ── Searched Location Pin (if arbitrary place searched) ── */}
        {searchedLocation && (
          <Marker
            position={[searchedLocation.lat, searchedLocation.lon]}
            icon={L.divIcon({
              className: 'searched-pin',
              html: `
                <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                  <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: rgba(245, 158, 11, 0.3); border: 2px solid #f59e0b;"></div>
                  <div style="position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
          >
            <Tooltip permanent={false} direction="top" className="custom-leaflet-tooltip">
              <div className="text-xs p-1">
                <strong>{searchedLocation.name.split(',')[0]}</strong>
                <p className="text-[10px] text-amber-400">No Sentinel-1 test chip loaded</p>
              </div>
            </Tooltip>
          </Marker>
        )}

        {/* ── Official 8 Disaster Event Markers ── */}
        {regions.map((region) => {
          const isActive = region.id === activeRegion;
          const customIcon = L.divIcon({
            className: 'custom-hazard-pin',
            html: `
              <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <div style="position: absolute; width: ${isActive ? '30px' : '18px'}; height: ${isActive ? '30px' : '18px'}; border-radius: 50%; background: ${isActive ? 'rgba(2, 132, 199, 0.4)' : 'rgba(239, 68, 68, 0.25)'}; border: 1.5px solid ${isActive ? '#0284c7' : '#ef4444'};"></div>
                <div style="position: absolute; width: ${isActive ? '12px' : '8px'}; height: ${isActive ? '12px' : '8px'}; border-radius: 50%; background: ${isActive ? '#38bdf8' : '#ef4444'}; box-shadow: 0 0 6px ${isActive ? '#38bdf8' : '#ef4444'};"></div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          return (
            <Marker
              key={region.id}
              position={[region.lat, region.lon]}
              icon={customIcon}
              eventHandlers={{
                click: () => {
                  setSearchedLocation(null);
                  setSearchNotice(null);
                  onRegionClick(region.id);
                },
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -10]}
                opacity={1}
                permanent={isActive}
                className="custom-leaflet-tooltip"
              >
                <div className="p-1 max-w-[200px]">
                  <div className="font-bold text-xs text-white flex items-center justify-between gap-2">
                    <span>{region.name}</span>
                    {isActive && (
                      <span className="text-[9px] bg-sky-600 text-white px-1.5 py-0.2 rounded font-mono">
                        SELECTED
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-300 mt-0.5">
                    {region.country} • {region.event_date}
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* ── Real Inundation Vector Polygons (Muted Scientific Blue) ── */}
        {analysisResult?.geojson && (
          <GeoJSON
            key={analysisResult.filename + (analysisResult.polygon_count || 0)}
            data={analysisResult.geojson}
            style={() => ({
              color: '#0284c7', // Natural GIS marine/flood blue
              weight: 1.5,
              opacity: 0.9,
              fillColor: '#0369a1',
              fillOpacity: floodOpacity,
            })}
            onEachFeature={(feature, layer) => {
              const area = feature.properties?.area_km2
                ? `${Number(feature.properties.area_km2).toFixed(3)} km²`
                : 'N/A';
              layer.bindPopup(`
                <div style="font-family: sans-serif; font-size: 11px; color: #0f172a; padding: 4px;">
                  <strong style="color: #0284c7; font-size: 12px;">🌊 Delineated Flood Inundation</strong><br/>
                  <b>Area:</b> ${area}<br/>
                  <b>Source:</b> Sentinel-1 C-SAR (10m)<br/>
                  <b>Model:</b> U-Net (ResNet34)
                </div>
              `);
            }}
          />
        )}
      </MapContainer>

      {/* ── Atmospheric Edge Vignette ── */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(7,13,25,0.75)]" />

      {/* ── Floating Map Controls (Top Right) ── */}
      <div className="absolute top-16 right-6 z-10 flex flex-col items-end gap-2.5">
        {/* Basemap Switcher & Opacity Slider */}
        <div className="bg-[#0b1329]/95 backdrop-blur-md border border-slate-800 rounded-xl p-2.5 shadow-2xl flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setBasemap('satellite')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                basemap === 'satellite'
                  ? 'bg-sky-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🛰️ Satellite
            </button>
            <button
              onClick={() => setBasemap('dark')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                basemap === 'dark'
                  ? 'bg-sky-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌑 Dark CARTO
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Opacity slider */}
          <div className="flex items-center gap-2 pr-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Flood Opacity</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={floodOpacity}
              onChange={(e) => setFloodOpacity(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <span className="text-[10px] text-sky-400 font-mono w-7 text-right">
              {Math.round(floodOpacity * 100)}%
            </span>
          </div>

          <button
            onClick={() => setShowLegend(!showLegend)}
            title="Toggle Map Legend"
            className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg hover:bg-slate-800 transition"
          >
            📋
          </button>
        </div>

        {/* ── Geospatial Disaster Legend ── */}
        {showLegend && (
          <div className="bg-[#0b1329]/95 backdrop-blur-md border border-slate-800 rounded-xl p-3.5 shadow-2xl w-64 text-xs space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-slate-200 tracking-wider uppercase text-[10px]">Remote Sensing Legend</span>
              <button onClick={() => setShowLegend(false)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded bg-sky-600 border border-sky-400"></span>
                <span className="text-slate-300">Detected Flood (U-Net)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 border border-white/60"></span>
                <span className="text-slate-300">Sen1Floods11 Event Marker</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-white/60"></span>
                <span className="text-slate-300">Searched Geography Pin</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 leading-tight">
              SAR observation coordinates calibrated from European Space Agency Copernicus Sentinel-1.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
