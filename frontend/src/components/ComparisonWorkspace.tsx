import React, { useState, useEffect } from 'react';
import type { AnalysisResult } from '../services/api';
import { fetchEvaluationReport, downloadGeoJSON } from '../services/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

interface ComparisonWorkspaceProps {
  result: AnalysisResult | null;
  loading: boolean;
  onClose?: () => void;
}

export default function ComparisonWorkspace({
  result,
  loading,
  onClose,
}: ComparisonWorkspaceProps) {
  const [sarBand, setSarBand] = useState<'VV' | 'VH'>('VV');
  const [activeFullscreen, setActiveFullscreen] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<'training' | 'regional' | 'method' | 'coverage'>('training');

  useEffect(() => {
    fetchEvaluationReport()
      .then((data) => setReportData(data))
      .catch(() => setReportData(null));
  }, []);

  if (!result && !loading) {
    return null;
  }

  const panels = result?.panels;
  const metrics = result?.metrics;
  const otsuMetrics = result?.otsu_comparison;
  const cm = result?.confusion_matrix;
  const currentSarImg = sarBand === 'VV' ? panels?.sar_vv : panels?.sar_vh;

  // A. Real Training & Validation Loss curves across 20 epochs
  const lossChartData = reportData?.history?.map((h: any) => ({
    epoch: `E${h.epoch}`,
    trainLoss: parseFloat(h.train_loss.toFixed(4)),
    valLoss: parseFloat((1.0 - h.val_metrics.dice).toFixed(4)), // Validation loss (1 - Dice)
    valDice: parseFloat((h.val_metrics.dice * 100).toFixed(1)),
    valIoU: parseFloat((h.val_metrics.iou * 100).toFixed(1)),
  })) || [];

  // B. Real Regional IoU comparison line graph across all 8 global events
  const regionalData = reportData?.regional_evaluation
    ? Object.entries(reportData.regional_evaluation).map(([k, v]: [string, any]) => ({
        region: k.charAt(0).toUpperCase() + k.slice(1),
        iou: parseFloat((v.iou * 100).toFixed(2)),
        dice: parseFloat((v.dice * 100).toFixed(2)),
        precision: parseFloat((v.precision * 100).toFixed(2)),
        recall: parseFloat((v.recall * 100).toFixed(2)),
      }))
    : [];

  // C. U-Net vs Otsu Grouped Bar Chart with genuine metrics
  const comparisonData = [
    {
      metric: 'IoU',
      'U-Net + ResNet34': metrics?.iou !== null && metrics?.iou !== undefined ? parseFloat((metrics.iou * 100).toFixed(2)) : 0,
      'Otsu Baseline': otsuMetrics?.otsu_iou !== null && otsuMetrics?.otsu_iou !== undefined ? parseFloat((otsuMetrics.otsu_iou * 100).toFixed(2)) : 0,
    },
    {
      metric: 'Dice (F1)',
      'U-Net + ResNet34': metrics?.dice !== null && metrics?.dice !== undefined ? parseFloat((metrics.dice * 100).toFixed(2)) : 0,
      'Otsu Baseline': otsuMetrics?.otsu_dice !== null && otsuMetrics?.otsu_dice !== undefined ? parseFloat((otsuMetrics.otsu_dice * 100).toFixed(2)) : 0,
    },
    {
      metric: 'Precision',
      'U-Net + ResNet34': metrics?.precision !== null && metrics?.precision !== undefined ? parseFloat((metrics.precision * 100).toFixed(2)) : 0,
      'Otsu Baseline': otsuMetrics?.otsu_precision !== null && otsuMetrics?.otsu_precision !== undefined ? parseFloat((otsuMetrics.otsu_precision * 100).toFixed(2)) : 0,
    },
    {
      metric: 'Recall',
      'U-Net + ResNet34': metrics?.recall !== null && metrics?.recall !== undefined ? parseFloat((metrics.recall * 100).toFixed(2)) : 0,
      'Otsu Baseline': otsuMetrics?.otsu_recall !== null && otsuMetrics?.otsu_recall !== undefined ? parseFloat((otsuMetrics.otsu_recall * 100).toFixed(2)) : 0,
    },
  ];

  // E. Water Coverage comparison data
  const coverageData = [
    {
      category: 'Inundation Coverage (%)',
      'U-Net Predicted Water': cm?.water_pixel_pct !== undefined ? cm.water_pixel_pct : 0,
      'Ground-Truth Water': cm?.gt_water_pixel_pct !== undefined ? cm.gt_water_pixel_pct : 0,
    },
  ];

  const handleExportGeoJson = () => {
    if (!result?.geojson) return;
    const blob = new Blob([JSON.stringify(result.geojson, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.filename || 'flood'}_boundaries.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fadeIn">
      {/* ── Main Container ── */}
      <div className="bg-[#0b1329] border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* ── Header Bar ── */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛰️</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-slate-100 font-bold text-sm tracking-wide uppercase">
                  Flood Segmentation Scientific Workspace
                </h2>
                <span className="text-[11px] bg-slate-800 text-sky-400 border border-slate-700 px-2.5 py-0.5 rounded font-mono">
                  {result?.filename || 'Processing...'}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Standard Scientific Remote Sensing Visualization: Grayscale SAR, Red/Green Otsu, Yellow/Blue U-Net, Violet Ground-Truth
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Band Selector */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setSarBand('VV')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  sarBand === 'VV' ? 'bg-sky-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                VV Band
              </button>
              <button
                onClick={() => setSarBand('VH')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  sarBand === 'VH' ? 'bg-sky-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                VH Band
              </button>
            </div>

            {result?.geojson && (
              <button
                onClick={handleExportGeoJson}
                title="GeoJSON stores the geographical boundaries of predicted water regions. It can be opened in QGIS or ArcGIS for further geographic analysis."
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
              >
                <span>🌐</span> Export Flood Boundaries (GeoJSON)
              </button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 rounded bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="p-5 overflow-y-auto space-y-5">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-slate-300">
                Running U-Net Dual-Pol SAR Inference & Delineating Flood Polygons…
              </p>
            </div>
          ) : (
            <>
              {/* ── 4-Panel Synchronized Scientific View (EXACT COLOR SCHEME) ── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                    Synchronized 4-Panel Analysis
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Click any image for full-screen examination
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Panel 1: SAR Radar Input (Natural Grayscale) */}
                  <div
                    onClick={() => currentSarImg && setActiveFullscreen(currentSarImg)}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="font-semibold text-slate-200">1. SAR Radar ({sarBand})</span>
                      <span className="text-[10px] text-slate-400 font-mono">10m GRD</span>
                    </div>
                    <div className="aspect-square bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center relative">
                      {currentSarImg ? (
                        <img
                          src={currentSarImg}
                          alt="SAR Grayscale"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <span className="text-xs text-slate-600">Loading SAR…</span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-slate-300 px-1.5 py-0.5 rounded">
                        Natural Grayscale
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
                      <span>2%-98% Stretch</span>
                      <span className="text-slate-500">512 × 512</span>
                    </div>
                  </div>

                  {/* Panel 2: Otsu Baseline (Red water + Green non-water) */}
                  <div
                    onClick={() => panels?.otsu && setActiveFullscreen(panels.otsu)}
                    className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-3 flex flex-col cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="font-semibold text-rose-400">2. Otsu Baseline</span>
                      <span className="text-[10px] text-slate-400 font-mono">Threshold</span>
                    </div>
                    <div className="aspect-square bg-black rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center relative">
                      {panels?.otsu ? (
                        <img
                          src={panels.otsu}
                          alt="Otsu Red-Green"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <span className="text-xs text-slate-600">Generating Otsu…</span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-rose-300 px-1.5 py-0.5 rounded">
                        Red Water · Green Land
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
                      <span>IoU: <strong className="text-slate-200">{otsuMetrics?.otsu_iou !== null && otsuMetrics?.otsu_iou !== undefined ? `${(otsuMetrics.otsu_iou * 100).toFixed(2)}%` : '—'}</strong></span>
                      <span>Dice: <strong className="text-slate-200">{otsuMetrics?.otsu_dice !== null && otsuMetrics?.otsu_dice !== undefined ? `${(otsuMetrics.otsu_dice * 100).toFixed(2)}%` : '—'}</strong></span>
                    </div>
                  </div>

                  {/* Panel 3: U-Net Prediction (Yellow water + Muted Blue non-water) */}
                  <div
                    onClick={() => panels?.unet && setActiveFullscreen(panels.unet)}
                    className="bg-slate-900/90 border border-amber-600/40 hover:border-amber-500 rounded-xl p-3 flex flex-col cursor-pointer transition group shadow-md"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="font-semibold text-amber-400">3. U-Net + ResNet34</span>
                      <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.2 rounded font-mono">Deep Learning</span>
                    </div>
                    <div className="aspect-square bg-black rounded-lg overflow-hidden border border-amber-800/60 flex items-center justify-center relative">
                      {panels?.unet ? (
                        <img
                          src={panels.unet}
                          alt="U-Net Yellow-Blue"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <span className="text-xs text-slate-600">Inference…</span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-amber-300 px-1.5 py-0.5 rounded">
                        Yellow Water · Blue Land
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300 flex justify-between font-semibold">
                      <span>IoU: <strong className="text-amber-400">{metrics?.iou !== null && metrics?.iou !== undefined ? `${(metrics.iou * 100).toFixed(2)}%` : '—'}</strong></span>
                      <span>Dice: <strong className="text-amber-400">{metrics?.dice !== null && metrics?.dice !== undefined ? `${(metrics.dice * 100).toFixed(2)}%` : '—'}</strong></span>
                    </div>
                  </div>

                  {/* Panel 4: Ground Truth (Violet water + Neutral Grey land) */}
                  <div
                    onClick={() => panels?.ground_truth && setActiveFullscreen(panels.ground_truth)}
                    className="bg-slate-900/90 border border-purple-600/40 hover:border-purple-500 rounded-xl p-3 flex flex-col cursor-pointer transition group"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="font-semibold text-purple-400">4. Ground Truth Mask</span>
                      <span className="text-[10px] text-slate-400 font-mono">Reference</span>
                    </div>
                    <div className="aspect-square bg-black rounded-lg overflow-hidden border border-purple-800/60 flex items-center justify-center relative">
                      {panels?.ground_truth ? (
                        <img
                          src={panels.ground_truth}
                          alt="Ground Truth Violet"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <span className="text-xs text-slate-500 text-center px-2">
                          Held-out unmasked acquisition
                        </span>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-purple-300 px-1.5 py-0.5 rounded">
                        Violet Water · Grey Land
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 flex justify-between">
                      <span>Grey: -1 Nodata</span>
                      <span className="text-purple-400 font-semibold">Violet: Water</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Scientific Analytics Tabs (Matplotlib / Seaborn Clean Styling) ── */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveAnalyticsTab('training')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeAnalyticsTab === 'training'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      A. Training &amp; Validation Loss
                    </button>
                    <button
                      onClick={() => setActiveAnalyticsTab('regional')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeAnalyticsTab === 'regional'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      B. Regional IoU Comparison
                    </button>
                    <button
                      onClick={() => setActiveAnalyticsTab('method')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeAnalyticsTab === 'method'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      C. U-Net vs Otsu Benchmark
                    </button>
                    <button
                      onClick={() => setActiveAnalyticsTab('coverage')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        activeAnalyticsTab === 'coverage'
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      E. Water Coverage Comparison
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    Evaluation Protocol: Valid Pixels Only
                  </span>
                </div>

                {/* Tab A: Training and Validation Loss (Clean Line Graph) */}
                {activeAnalyticsTab === 'training' && (
                  <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm text-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-800">
                        Figure 1: Training and Validation Loss across 20 Epochs (PyTorch ResNet34 U-Net)
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Loss Function: Masked BCE + Dice</span>
                    </div>
                    <div className="h-52 w-full">
                      {lossChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={lossChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                            <XAxis dataKey="epoch" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Epoch', position: 'insideBottom', offset: -4, fontSize: 10 }} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0.3, 0.9]} label={{ value: 'Loss', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', color: '#1e293b' }} />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                            <Line type="monotone" dataKey="trainLoss" name="Training Loss" stroke="#1e40af" strokeWidth={1.8} dot={{ r: 2 }} />
                            <Line type="monotone" dataKey="valLoss" name="Validation Loss" stroke="#b91c1c" strokeWidth={1.8} dot={{ r: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          Evaluation data not available
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab B: Regional IoU Comparison (Clean Line Graph) */}
                {activeAnalyticsTab === 'regional' && (
                  <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm text-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-800">
                        Figure 2: Regional Flood IoU Comparison across All 8 Global Events (%)
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Dataset: Sen1Floods11 v1.1 HandLabeled</span>
                    </div>
                    <div className="h-52 w-full">
                      {regionalData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={regionalData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                            <XAxis dataKey="region" stroke="#64748b" tick={{ fontSize: 10 }} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} label={{ value: 'IoU (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', color: '#1e293b' }} />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                            <Line type="monotone" dataKey="iou" name="Intersection-over-Union (IoU %)" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="dice" name="Dice / F1 Score (%)" stroke="#4338ca" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          Evaluation data not available
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab C: U-Net vs Otsu (Simple Grouped Bar Chart) */}
                {activeAnalyticsTab === 'method' && (
                  <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm text-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-800">
                        Figure 3: Metric Comparison — U-Net + ResNet34 vs Classical Otsu Baseline (%)
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Calculated on Valid Pixels Only</span>
                    </div>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                          <XAxis dataKey="metric" stroke="#64748b" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} label={{ value: 'Score (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', color: '#1e293b' }} />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                          <Bar dataKey="U-Net + ResNet34" fill="#1d4ed8" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="Otsu Baseline" fill="#b45309" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Tab E: Water Coverage Comparison */}
                {activeAnalyticsTab === 'coverage' && (
                  <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm text-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-800">
                        Figure 4: Predicted Water Extent vs Ground-Truth Water Extent (%)
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Excluding Invalid -1 Nodata Pixels</span>
                    </div>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={coverageData} margin={{ top: 10, right: 40, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" />
                          <XAxis dataKey="category" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 50]} label={{ value: 'Coverage (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontSize: '11px', color: '#1e293b' }} />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                          <Bar dataKey="U-Net Predicted Water" fill="#2563eb" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="Ground-Truth Water" fill="#7c3aed" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* ── D. Proper 2 × 2 Confusion Matrix Heatmap ── */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">
                        D. Pixel Confusion Matrix Heatmap (Strictly Excluding -1 Nodata Pixels)
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Rows: Predicted Classes | Columns: Ground-Truth Classes
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-mono text-slate-400">
                      Total Valid Pixels: <strong className="text-slate-100">{cm?.valid_pixels?.toLocaleString() || '—'}</strong>
                    </div>
                  </div>

                  {cm ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      {/* Heatmap Grid */}
                      <div className="border border-slate-800 rounded-lg overflow-hidden">
                        <table className="w-full text-center text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 text-[11px] text-slate-400 border-b border-slate-800">
                              <th className="py-2 px-3 text-left">Prediction \ Reference</th>
                              <th className="py-2 px-3 bg-purple-950/40 text-purple-300 font-semibold">Ground-Truth: Water (1)</th>
                              <th className="py-2 px-3 bg-slate-900 text-slate-300 font-semibold">Ground-Truth: Non-Water (0)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-mono">
                            <tr>
                              <td className="py-2.5 px-3 text-left font-sans text-amber-300 font-semibold bg-slate-950/50">
                                Predicted: Water (1)
                              </td>
                              <td className="py-2.5 px-3 bg-emerald-950/60 text-emerald-300 font-bold border-r border-slate-800">
                                <div>TP: {cm.tp.toLocaleString()}</div>
                                <div className="text-[9px] text-emerald-400/80 font-sans font-normal">
                                  {cm.valid_pixels > 0 ? `${((cm.tp / cm.valid_pixels) * 100).toFixed(1)}%` : '0%'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 bg-rose-950/50 text-rose-300">
                                <div>FP: {cm.fp.toLocaleString()}</div>
                                <div className="text-[9px] text-rose-400/80 font-sans font-normal">
                                  {cm.valid_pixels > 0 ? `${((cm.fp / cm.valid_pixels) * 100).toFixed(1)}%` : '0%'}
                                </div>
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-3 text-left font-sans text-slate-400 font-semibold bg-slate-950/50">
                                Predicted: Non-Water (0)
                              </td>
                              <td className="py-2.5 px-3 bg-amber-950/50 text-amber-300 border-r border-slate-800">
                                <div>FN: {cm.fn.toLocaleString()}</div>
                                <div className="text-[9px] text-amber-400/80 font-sans font-normal">
                                  {cm.valid_pixels > 0 ? `${((cm.fn / cm.valid_pixels) * 100).toFixed(1)}%` : '0%'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 bg-slate-800/80 text-slate-200 font-bold">
                                <div>TN: {cm.tn.toLocaleString()}</div>
                                <div className="text-[9px] text-slate-400 font-sans font-normal">
                                  {cm.valid_pixels > 0 ? `${((cm.tn / cm.valid_pixels) * 100).toFixed(1)}%` : '0%'}
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Mathematically Verified Verification Card */}
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                            Exact Metric Consistency Audit
                          </span>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            Every metric is computed directly from the confusion matrix counts:
                          </p>
                          <div className="mt-2 space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Precision [TP / (TP + FP)]:</span>
                              <strong className="text-sky-300">
                                {cm.tp + cm.fp > 0 ? `${((cm.tp / (cm.tp + cm.fp)) * 100).toFixed(2)}%` : '0.00%'}
                              </strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Recall [TP / (TP + FN)]:</span>
                              <strong className="text-purple-300">
                                {cm.tp + cm.fn > 0 ? `${((cm.tp / (cm.tp + cm.fn)) * 100).toFixed(2)}%` : '0.00%'}
                              </strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">IoU [TP / (TP + FP + FN)]:</span>
                              <strong className="text-emerald-300">
                                {cm.tp + cm.fp + cm.fn > 0 ? `${((cm.tp / (cm.tp + cm.fp + cm.fn)) * 100).toFixed(2)}%` : '0.00%'}
                              </strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Dice [2·TP / (2·TP + FP + FN)]:</span>
                              <strong className="text-amber-300">
                                {2 * cm.tp + cm.fp + cm.fn > 0 ? `${((2 * cm.tp / (2 * cm.tp + cm.fp + cm.fn)) * 100).toFixed(2)}%` : '0.00%'}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500">
                          Sum of TP + FP + FN + TN = {(cm.tp + cm.fp + cm.fn + cm.tn).toLocaleString()} (100% of valid pixels).
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Confusion matrix data not available
                    </div>
                  )}
                </div>

              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Fullscreen Lightbox Modal ── */}
      {activeFullscreen && (
        <div
          onClick={() => setActiveFullscreen(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out animate-fadeIn"
        >
          <img
            src={activeFullscreen}
            alt="Expanded Scientific View"
            className="max-w-full max-h-full object-contain rounded-xl border border-slate-700 shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
