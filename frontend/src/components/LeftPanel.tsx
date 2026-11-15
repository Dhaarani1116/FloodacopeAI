import React, { useState } from 'react';
import type { SampleRegion, AnalysisResult } from '../services/api';
import { downloadPdfReport } from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeftPanelProps {
  regions: SampleRegion[];
  activeRegion: string | null;
  backendOk: boolean;
  modelLoaded?: boolean;
  loading?: boolean;
  analysisResult: AnalysisResult | null;
  activeJobId: string | null;
  onRegionSelect: (id: string) => void;
  onAnalyze?: (filename: string) => void;
  onOpenWorkspace?: () => void;
}

// ─── Region flag map ──────────────────────────────────────────────────────────

const FLAG_MAP: Record<string, string> = {
  Bolivia: '🇧🇴',
  India: '🇮🇳',
  Pakistan: '🇵🇰',
  USA: '🇺🇸',
  Ghana: '🇬🇭',
  Spain: '🇪🇸',
  Cambodia: '🇰🇭',
  Paraguay: '🇵🇾',
  Nigeria: '🇳🇬',
  Somalia: '🇸🇴',
  'Sri-Lanka': '🇱🇰',
};

export default function LeftPanel({
  regions,
  activeRegion,
  backendOk,
  modelLoaded = true,
  loading = false,
  analysisResult,
  activeJobId,
  onRegionSelect,
  onAnalyze,
  onOpenWorkspace,
}: LeftPanelProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const selectedRegion = regions.find((r) => r.id === activeRegion) || regions[0];

  const handleDownloadReport = async () => {
    if (!activeJobId) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const blob = await downloadPdfReport(activeJobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FloodScope_${selectedRegion?.id || 'event'}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setPdfError(err?.message || 'Failed to download PDF report');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePreviewReport = async () => {
    if (!activeJobId) return;
    setPreviewingPdf(true);
    setPdfError(null);
    try {
      const blob = await downloadPdfReport(activeJobId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setPdfError(err?.message || 'Failed to preview PDF report');
    } finally {
      setPreviewingPdf(false);
    }
  };

  return (
    <div
      className="absolute left-0 top-0 h-full w-80 bg-[#070d19]/95 backdrop-blur-md z-10 flex flex-col overflow-hidden text-slate-200 border-r border-slate-800/80 shadow-2xl"
    >
      {/* ── Logo & Platform Branding ── */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-800/90">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-700 to-sky-500 flex items-center justify-center text-lg shadow-md border border-sky-400/30">
            🛰️
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight tracking-wide flex items-center gap-1.5">
              <span>FloodScope</span>
              <span className="text-sky-400 font-extrabold">AI</span>
            </h1>
            <p className="text-slate-400 text-[11px]">Sentinel-1 Earth Observation</p>
          </div>
        </div>

        {/* Backend & Model Status Badges */}
        <div className="mt-3.5 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${
            backendOk
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
              : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${backendOk ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {backendOk ? 'Deep Learning Backend Active' : 'Offline Backend'}
          </span>
          <span className="text-[10px] bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded border border-slate-700/60 font-mono">
            v1.1 Real Data
          </span>
        </div>
      </div>

      {/* ── Scroll Area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* ── Official Flood Events (8 Dataset Regions) ── */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1 h-3.5 bg-sky-500 rounded-full" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Monitored Flood Events
            </h2>
            <span className="ml-auto text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
              {regions.length} Events
            </span>
          </div>

          <div className="space-y-1.5">
            {regions.map((region) => {
              const isActive = region.id === activeRegion;
              const flag = FLAG_MAP[region.country] ?? '🌍';
              return (
                <button
                  key={region.id}
                  onClick={() => onRegionSelect(region.id)}
                  className={`w-full text-left rounded-xl p-2.5 transition-all duration-150 group relative border ${
                    isActive
                      ? 'bg-sky-950/70 border-sky-500/80 shadow-md text-white'
                      : 'bg-slate-900/60 border-slate-800/70 hover:border-slate-700 hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg mt-0.5">{flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold truncate ${
                          isActive ? 'text-sky-300' : 'text-slate-200'
                        }`}>
                          {region.name}
                        </span>
                        {isActive && (
                          <span className="text-[9px] bg-sky-600 text-white font-mono px-1.5 py-0.2 rounded font-bold">
                            SELECTED
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>{region.country}</span>
                        <span className="font-mono">{region.event_date}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Generate Flood Analysis Report (Replaces Raw File Upload) ── */}
        <div className="pt-2 border-t border-slate-800/70">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1 h-3.5 bg-emerald-500 rounded-full" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Scientific Report
            </h2>
          </div>

          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <span>📄</span>
                <span>Automated PDF Flood Report</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Compiles acquisition metadata, U-Net vs Otsu comparative metrics, confusion matrix, and emergency relief findings into a formal report.
              </p>
            </div>

            {analysisResult ? (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePreviewReport}
                    disabled={previewingPdf || !activeJobId}
                    className="py-2.5 px-2 rounded-xl text-xs font-semibold bg-sky-700 hover:bg-sky-600 text-white flex items-center justify-center gap-1.5 shadow-md transition-all"
                  >
                    {previewingPdf ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>👁️</span>
                    )}
                    <span>Preview PDF</span>
                  </button>

                  <button
                    onClick={handleDownloadReport}
                    disabled={downloadingPdf || !activeJobId}
                    className="py-2.5 px-2 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center gap-1.5 shadow-md transition-all"
                  >
                    {downloadingPdf ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>📥</span>
                    )}
                    <span>Download PDF</span>
                  </button>
                </div>

                {pdfError && (
                  <p className="text-[10px] text-rose-400 leading-tight">⚠ {pdfError}</p>
                )}

                {onOpenWorkspace && (
                  <button
                    onClick={onOpenWorkspace}
                    className="w-full py-2 px-3 rounded-lg text-xs font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/50 flex items-center justify-center gap-1.5 transition"
                  >
                    <span>🔬</span> View 4-Panel Scientific Analysis
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {selectedRegion && onAnalyze && (
                  <button
                    onClick={() => onAnalyze(selectedRegion.sar_file)}
                    disabled={loading || !backendOk}
                    className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      loading || !backendOk
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white shadow-md'
                    }`}
                  >
                    {loading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Running U-Net…</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Run Segmentation to Report</span>
                      </>
                    )}
                  </button>
                )}
                <p className="text-[10px] text-slate-500 text-center leading-snug">
                  Run segmentation on the selected event to unlock comprehensive PDF and GIS outputs.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Scientific Platform Metadata Footer ── */}
      <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-900/40 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between text-slate-400">
          <span>Encoder Architecture:</span>
          <span className="font-mono text-slate-200">ResNet34 (Dual-Pol)</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Benchmark Dataset:</span>
          <span className="font-mono text-slate-200">Sen1Floods11 v1.1</span>
        </div>
        <div className="text-[10px] text-slate-500 pt-1 leading-tight">
          ESA Copernicus Sentinel-1 Synthetic Aperture Radar (10m GRD).
        </div>
      </div>
    </div>
  );
}
