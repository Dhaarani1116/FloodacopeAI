import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import GlobeView from './components/GlobeView';
import LeftPanel from './components/LeftPanel';
import RegionInfoPanel from './components/RegionInfoPanel';
import AnalyticsBar from './components/AnalyticsBar';
import ComparisonWorkspace from './components/ComparisonWorkspace';
import {
  fetchHealth,
  fetchSamples,
  startAnalysis,
  pollJob,
  downloadGeoJSON,
  type SampleRegion,
  type AnalysisResult,
} from './services/api';

const FALLBACK_REGIONS: SampleRegion[] = [
  {
    id: 'india',
    name: 'India Floods (Bihar / Ganges)',
    country: 'India',
    lat: 26.4755,
    lon: 93.1007,
    description: 'Monsoon flood inundation across Ganges and Brahmaputra riparian plains.',
    sar_file: 'India_285297_S1Hand.tif',
    label_file: 'India_285297_LabelHand.tif',
    event_date: '2016-08-12',
  },
  {
    id: 'pakistan',
    name: 'Pakistan Floods (Indus River)',
    country: 'Pakistan',
    lat: 30.0349,
    lon: 70.7543,
    description: 'Severe Indus river basin inundation across agricultural and transport corridors.',
    sar_file: 'Pakistan_909806_S1Hand.tif',
    label_file: 'Pakistan_909806_LabelHand.tif',
    event_date: '2017-06-28',
  },
  {
    id: 'spain',
    name: 'Spain Floods (Ebro Basin)',
    country: 'Spain',
    lat: 38.4917,
    lon: 0.0049,
    description: 'Mediterranean flash flooding and river overflow along the Ebro riparian system.',
    sar_file: 'Spain_5923267_S1Hand.tif',
    label_file: 'Spain_5923267_LabelHand.tif',
    event_date: '2019-09-17',
  },
  {
    id: 'mekong',
    name: 'Mekong Delta Floods',
    country: 'Cambodia',
    lat: 12.1307,
    lon: 105.3245,
    description: 'Tropical monsoon surge and flood inundation in the lower Mekong basin.',
    sar_file: 'Mekong_221789_S1Hand.tif',
    label_file: 'Mekong_221789_LabelHand.tif',
    event_date: '2018-08-05',
  },
  {
    id: 'usa',
    name: 'USA Midwest Floods (Missouri River)',
    country: 'USA',
    lat: 39.3540,
    lon: -95.0535,
    description: 'Historic Missouri and Mississippi river basin deluge affecting settlements.',
    sar_file: 'USA_994009_S1Hand.tif',
    label_file: 'USA_994009_LabelHand.tif',
    event_date: '2019-05-22',
  },
  {
    id: 'ghana',
    name: 'Ghana Floods (White Volta)',
    country: 'Ghana',
    lat: 8.6758,
    lon: -1.1050,
    description: 'West African river flood inundation across agricultural plains in the Volta basin.',
    sar_file: 'Ghana_103272_S1Hand.tif',
    label_file: 'Ghana_103272_LabelHand.tif',
    event_date: '2018-09-18',
  },
  {
    id: 'paraguay',
    name: 'Paraguay Floods (Paraná Basin)',
    country: 'Paraguay',
    lat: -24.7408,
    lon: -56.5575,
    description: 'South American sub-tropical flood emergency along the Paraná and Paraguay rivers.',
    sar_file: 'Paraguay_721886_S1Hand.tif',
    label_file: 'Paraguay_721886_LabelHand.tif',
    event_date: '2018-10-31',
  },
  {
    id: 'bolivia',
    name: 'Bolivia Floods (Held-Out Eval)',
    country: 'Bolivia',
    lat: -13.7954,
    lon: -65.0157,
    description: 'Amazon Beni basin catastrophic flood event (held-out zero-shot benchmark test).',
    sar_file: 'Bolivia_103757_S1Hand.tif',
    label_file: 'Bolivia_103757_LabelHand.tif',
    event_date: '2018-02-15',
  },
];

const LOCAL_STORAGE_KEY = 'floodscope_active_region_id';

export default function App() {
  const [regions, setRegions] = useState<SampleRegion[]>(FALLBACK_REGIONS);
  
  // Restore persisted region or default to 'india'
  const [activeRegion, setActiveRegion] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || 'india';
  });

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  // Initialize backend connection and load official regions
  useEffect(() => {
    async function init() {
      try {
        const health = await fetchHealth();
        if (health.status === 'ok') {
          setBackendOk(true);
        }
      } catch {
        setBackendOk(false);
      }

      try {
        const samples = await fetchSamples();
        if (samples && samples.length > 0) {
          setRegions(samples);
        }
      } catch {
        // Keep fallback regions
      }
    }
    init();
  }, []);

  // Central Region Switch Handler
  const handleRegionSelect = (id: string) => {
    setActiveRegion(id);
    localStorage.setItem(LOCAL_STORAGE_KEY, id);
    // Clear previous region's analysis result so state updates cleanly
    setAnalysisResult(null);
    setActiveJobId(null);
  };

  // Run Real U-Net Inference
  const handleAnalyze = async (filename: string) => {
    setLoading(true);
    try {
      if (backendOk) {
        const { job_id } = await startAnalysis(filename);
        setActiveJobId(job_id);

        let attempts = 0;
        const interval = setInterval(async () => {
          attempts += 1;
          try {
            const status = await pollJob(job_id);
            if (status.status === 'done' && status.result) {
              setAnalysisResult(status.result);
              setLoading(false);
              clearInterval(interval);
              // Open 4-panel comparison workspace automatically on success
              setWorkspaceOpen(true);
            } else if (status.status === 'error' || attempts > 30) {
              clearInterval(interval);
              setLoading(false);
            }
          } catch {
            clearInterval(interval);
            setLoading(false);
          }
        }, 1200);
      } else {
        setTimeout(() => {
          setLoading(false);
        }, 1200);
      }
    } catch {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (activeJobId && backendOk) {
      try {
        const blob = await downloadGeoJSON(activeJobId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeRegion || 'flood'}_boundaries.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } catch {
        // Fallback
      }
    }

    if (analysisResult?.geojson) {
      const blob = new Blob([JSON.stringify(analysisResult.geojson, null, 2)], {
        type: 'application/geo+json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeRegion || 'flood'}_boundaries.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const currentRegion = regions.find((r) => r.id === activeRegion) || regions[0];

  return (
    <div className="fixed inset-0 bg-[#070d19] overflow-hidden select-none font-sans text-slate-200">
      {/* ── High-Res Natural Satellite Basemap Globe ── */}
      <GlobeView
        regions={regions}
        activeRegion={activeRegion}
        onRegionClick={handleRegionSelect}
        analysisResult={analysisResult}
      />

      {/* ── Top Header Bar ── */}
      <Header
        backendOk={backendOk}
        modelUsed={analysisResult?.model_used}
        hasResult={Boolean(analysisResult)}
        onOpenWorkspace={() => setWorkspaceOpen(true)}
      />

      {/* ── Left Region List & Scientific Report Controls ── */}
      <LeftPanel
        regions={regions}
        activeRegion={activeRegion}
        onRegionSelect={handleRegionSelect}
        onAnalyze={handleAnalyze}
        loading={loading}
        backendOk={backendOk}
        analysisResult={analysisResult}
        activeJobId={activeJobId}
        onOpenWorkspace={() => setWorkspaceOpen(true)}
      />

      {/* ── Floating Region Details (top right) ── */}
      <RegionInfoPanel
        region={currentRegion}
        analysisResult={analysisResult}
        loading={loading}
        onAnalyze={handleAnalyze}
        onDownload={handleDownload}
        onOpenWorkspace={() => setWorkspaceOpen(true)}
        onClose={() => {}}
      />

      {/* ── Bottom Analytics & Metrics Bar ── */}
      <AnalyticsBar
        result={analysisResult}
        loading={loading}
        onOpenWorkspace={() => setWorkspaceOpen(true)}
      />

      {/* ── Dedicated 4-Panel Flood Segmentation & Scientific Graphs Workspace ── */}
      {workspaceOpen && (
        <ComparisonWorkspace
          result={analysisResult}
          loading={loading}
          onClose={() => setWorkspaceOpen(false)}
        />
      )}
    </div>
  );
}
