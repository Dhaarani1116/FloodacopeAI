import React, { useState } from 'react';
import type { AnalysisResult } from '../services/api';

interface AnalyticsBarProps {
  result: AnalysisResult | null;
  loading: boolean;
  onOpenWorkspace?: () => void;
}

export default function AnalyticsBar({ result, loading, onOpenWorkspace }: AnalyticsBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!result && !loading) {
    return (
      <div className="absolute bottom-5 left-88 right-8 z-20 flex justify-center pointer-events-none">
        <div className="bg-[#0b1329]/95 border border-slate-800 text-xs text-slate-400 px-5 py-2.5 rounded-full backdrop-blur-md shadow-2xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span>Select an event from the sidebar and click <strong className="text-slate-200">Run U-Net Segmentation</strong></span>
        </div>
      </div>
    );
  }

  const cm = result?.confusion_matrix;

  return (
    <div className="absolute bottom-0 left-80 right-0 z-20 bg-[#0b1329]/95 backdrop-blur-md border-t border-slate-800 shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between px-6 py-2 border-b border-slate-800/80 bg-slate-900/60 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-sky-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            Scientific SAR Analytics &amp; Validation Dashboard
          </span>
          {result && (
            <span className="text-slate-400 text-[11px] font-mono">
              • {result.model_used} • {result.processing_time_seconds.toFixed(2)}s • {result.polygon_count} polygons • {cm?.valid_pixels?.toLocaleString() || 0} valid px
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onOpenWorkspace && result && (
            <button
              onClick={onOpenWorkspace}
              className="text-xs font-semibold text-sky-300 hover:text-white bg-sky-950/80 hover:bg-sky-900/80 border border-sky-800/60 px-3 py-1 rounded-lg transition flex items-center gap-1.5"
            >
              <span>🔬</span> Open 4-Panel Workspace
            </button>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-400 hover:text-slate-200 text-xs font-medium"
          >
            {collapsed ? '▲ Expand' : '▼ Minimize'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3.5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Flood Extent */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-900/60 transition">
            <span className="text-[10px] uppercase text-slate-400 block font-semibold tracking-wider">
              Inundation Area
            </span>
            <span className="text-lg font-extrabold text-sky-400 mt-0.5 block">
              {result ? `${result.flood_area_km2.toFixed(2)} km²` : '—'}
            </span>
            <span className="text-[10px] text-slate-500">
              {result ? `${result.polygon_count} vector polygons` : 'Processing…'}
            </span>
          </div>

          {/* IoU */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-emerald-900/60 transition">
            <span className="text-[10px] uppercase text-slate-400 block font-semibold tracking-wider">
              U-Net vs QC Mask IoU
            </span>
            <span className="text-lg font-extrabold text-emerald-400 mt-0.5 block">
              {result?.metrics?.iou !== null && result?.metrics?.iou !== undefined
                ? (result.metrics.iou * 100).toFixed(2) + '%'
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500">
              Otsu Baseline:{' '}
              {result?.otsu_comparison?.otsu_iou !== null && result?.otsu_comparison?.otsu_iou !== undefined
                ? (result.otsu_comparison.otsu_iou * 100).toFixed(2) + '%'
                : '—'}
            </span>
          </div>

          {/* Dice / F1 */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-blue-900/60 transition">
            <span className="text-[10px] uppercase text-slate-400 block font-semibold tracking-wider">
              Dice Coefficient (F1)
            </span>
            <span className="text-lg font-extrabold text-blue-400 mt-0.5 block">
              {result?.metrics?.dice !== null && result?.metrics?.dice !== undefined
                ? (result.metrics.dice * 100).toFixed(2) + '%'
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500">
              Otsu Baseline:{' '}
              {result?.otsu_comparison?.otsu_dice !== null && result?.otsu_comparison?.otsu_dice !== undefined
                ? (result.otsu_comparison.otsu_dice * 100).toFixed(2) + '%'
                : '—'}
            </span>
          </div>

          {/* Precision */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-sky-900/60 transition">
            <span className="text-[10px] uppercase text-slate-400 block font-semibold tracking-wider">
              Precision
            </span>
            <span className="text-lg font-extrabold text-sky-300 mt-0.5 block">
              {result?.metrics?.precision !== null && result?.metrics?.precision !== undefined
                ? (result.metrics.precision * 100).toFixed(2) + '%'
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500">
              Otsu: {result?.otsu_comparison?.otsu_precision !== null && result?.otsu_comparison?.otsu_precision !== undefined ? `${(result.otsu_comparison.otsu_precision * 100).toFixed(2)}%` : '—'}
            </span>
          </div>

          {/* Water Pixel Percentage */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-purple-900/60 transition">
            <span className="text-[10px] uppercase text-slate-400 block font-semibold tracking-wider">
              Pixel Water Coverage
            </span>
            <span className="text-lg font-extrabold text-purple-300 mt-0.5 block">
              {cm?.water_pixel_pct !== undefined
                ? `${cm.water_pixel_pct.toFixed(2)}%`
                : '—'}
            </span>
            <span className="text-[10px] text-slate-500">
              Ref Water: {cm?.gt_water_pixel_pct !== undefined ? `${cm.gt_water_pixel_pct.toFixed(2)}%` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
