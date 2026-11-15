import React from 'react';
import type { SampleRegion, AnalysisResult } from '../services/api';

interface RegionInfoPanelProps {
  region: SampleRegion | null;
  analysisResult: AnalysisResult | null;
  loading: boolean;
  onAnalyze: (filename: string) => void;
  onDownload: () => void;
  onOpenWorkspace: () => void;
  onClose: () => void;
}

export default function RegionInfoPanel({
  region,
  analysisResult,
  loading,
  onAnalyze,
  onDownload,
  onOpenWorkspace,
  onClose,
}: RegionInfoPanelProps) {
  if (!region) return null;

  return (
    <div className="absolute top-20 right-6 w-84 z-20 rounded-2xl bg-[#0b1329]/95 backdrop-blur-md border border-slate-800/90 p-4 text-slate-100 shadow-2xl animate-fadeIn">
      <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400">
            Selected Region
          </span>
          <h2 className="text-base font-bold text-white flex items-center gap-1.5 mt-0.5">
            <span>📍</span> {region.name}
          </h2>
          <p className="text-xs text-slate-400">
            {region.country} • {region.event_date}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800/60 transition"
        >
          ✕
        </button>
      </div>

      <p className="text-xs text-slate-300 mt-3 leading-relaxed">
        {region.description}
      </p>

      <div className="mt-3 text-[11px] text-slate-400 space-y-1 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 font-mono">
        <div><strong className="text-slate-300">SAR GeoTIFF:</strong> {region.sar_file}</div>
        <div><strong className="text-slate-300">Ground Truth:</strong> {region.label_file}</div>
        <div><strong className="text-slate-300">Coordinates:</strong> {region.lat.toFixed(2)}°, {region.lon.toFixed(2)}°</div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={() => onAnalyze(region.sar_file)}
          disabled={loading}
          className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
            loading
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-cyan-900/30'
          }`}
        >
          {loading ? (
            <>
              <span className="animate-spin text-sm">⏳</span>
              <span>Running U-Net Model…</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Run U-Net Segmentation</span>
            </>
          )}
        </button>

        {analysisResult && (
          <>
            <button
              onClick={onOpenWorkspace}
              className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-sky-300 bg-sky-950/60 hover:bg-sky-900/50 border border-sky-800/60 flex items-center justify-center gap-1.5 transition"
            >
              <span>🔬</span> Open 4-Panel Analysis Workspace
            </button>

            <button
              onClick={onDownload}
              title="GeoJSON stores the geographical boundaries of predicted water regions. It can be opened in QGIS or ArcGIS for further geographic analysis."
              className="w-full py-2 px-3 rounded-xl text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center gap-1.5 transition group"
            >
              <span>🌐</span>
              <span>Export Flood Boundaries (GeoJSON)</span>
            </button>
            <p className="text-[10px] text-slate-400 px-1 leading-snug">
              Optional GIS vector export for spatial analysis in QGIS or ArcGIS.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
