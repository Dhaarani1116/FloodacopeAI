import axios from 'axios';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SampleRegion {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  description: string;
  sar_file: string;
  label_file: string;
  event_date: string;
}

export interface AnalysisMetrics {
  iou: number | null;
  dice: number | null;
  precision: number | null;
  recall: number | null;
}

export interface OtsuComparison {
  otsu_iou: number | null;
  otsu_dice: number | null;
  otsu_precision?: number | null;
  otsu_recall?: number | null;
}

export interface ConfusionMatrix {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  valid_pixels: number;
  water_pixel_pct: number;
  gt_water_pixel_pct: number;
}

export interface AnalysisPanels {
  sar_vv: string;
  sar_vh: string;
  otsu: string;
  unet: string;
  ground_truth: string | null;
  otsu_threshold?: number;
}

export interface AnalysisResult {
  filename: string;
  flood_area_km2: number;
  polygon_count: number;
  model_used: string;
  processing_time_seconds: number;
  metrics: AnalysisMetrics;
  confusion_matrix?: ConfusionMatrix;
  geojson: GeoJSON.FeatureCollection;
  otsu_comparison: OtsuComparison;
  panels?: AnalysisPanels;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result: AnalysisResult | null;
  error: string | null;
}

export interface UploadResponse {
  filename: string;
  file_size_bytes: number;
  message: string;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  sample_count: number;
}

// ─── Axios instance ───────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '',
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

export async function fetchSamples(): Promise<SampleRegion[]> {
  const { data } = await api.get<SampleRegion[]>('/samples');
  return data;
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadResponse>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function startAnalysis(filename: string): Promise<{ job_id: string }> {
  const { data } = await api.post<{ job_id: string }>('/analyze', { filename });
  return data;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const { data } = await api.get<JobStatus>(`/jobs/${jobId}`);
  return data;
}

export async function downloadGeoJSON(jobId: string): Promise<Blob> {
  const response = await api.get(`/download/${jobId}`, { responseType: 'blob' });
  return response.data as Blob;
}

export async function downloadPdfReport(jobId: string): Promise<Blob> {
  const response = await api.get(`/report/pdf/${jobId}`, { responseType: 'blob' });
  return response.data as Blob;
}

export async function fetchEvaluationReport(): Promise<any> {
  const { data } = await api.get('/evaluation/report');
  return data;
}

// ─── Polling helper ───────────────────────────────────────────────────────────

type ProgressCallback = (status: 'uploading' | 'running' | 'polling') => void;
type DoneCallback = (result: AnalysisResult) => void;
type ErrorCallback = (err: string) => void;

export async function analyzeAndPoll(
  file: File,
  onProgress: ProgressCallback,
  onDone: DoneCallback,
  onError: ErrorCallback
): Promise<void> {
  try {
    onProgress('uploading');
    const { filename } = await uploadFile(file);

    onProgress('running');
    const { job_id } = await startAnalysis(filename);

    onProgress('polling');
    let attempts = 0;
    const maxAttempts = 90; // 3 minutes

    const poll = async (): Promise<void> => {
      if (attempts++ > maxAttempts) {
        onError('Analysis timed out after 3 minutes.');
        return;
      }
      const job = await pollJob(job_id);
      if (job.status === 'done' && job.result) {
        onDone(job.result);
      } else if (job.status === 'error') {
        onError(job.error ?? 'Unknown error during analysis.');
      } else {
        await new Promise<void>((r) => setTimeout(r, 2000));
        return poll();
      }
    };

    await poll();
  } catch (err: unknown) {
    if (err instanceof Error) {
      onError(err.message);
    } else {
      onError('An unexpected error occurred.');
    }
  }
}

// ─── Local fallback regions (used when backend is unreachable) ────────────────

export const FALLBACK_REGIONS: SampleRegion[] = [
  {
    id: 'bolivia',
    name: 'Bolivia Floods',
    country: 'Bolivia',
    lat: -14.5,
    lon: -67.5,
    description: '2019 Amazon basin flooding — Beni Department',
    sar_file: 'Bolivia_103757_S1Hand.tif',
    label_file: 'Bolivia_103757_LabelHand.tif',
    event_date: '2019-02-12',
  },
  {
    id: 'india',
    name: 'India Floods',
    country: 'India',
    lat: 25.3,
    lon: 84.0,
    description: '2019 Bihar flooding — Ganges floodplain',
    sar_file: 'India_900498_S1Hand.tif',
    label_file: 'India_900498_LabelHand.tif',
    event_date: '2019-07-22',
  },
  {
    id: 'pakistan',
    name: 'Pakistan Floods',
    country: 'Pakistan',
    lat: 29.5,
    lon: 71.0,
    description: '2010 Indus River flooding — Punjab Province',
    sar_file: 'Pakistan_505586_S1Hand.tif',
    label_file: 'Pakistan_505586_LabelHand.tif',
    event_date: '2010-08-15',
  },
  {
    id: 'usa',
    name: 'USA Midwest Floods',
    country: 'USA',
    lat: 40.5,
    lon: -96.5,
    description: '2019 Missouri River flooding — Nebraska/Iowa border',
    sar_file: 'USA_430764_S1Hand.tif',
    label_file: 'USA_430764_LabelHand.tif',
    event_date: '2019-03-16',
  },
  {
    id: 'ghana',
    name: 'Ghana Floods',
    country: 'Ghana',
    lat: 9.0,
    lon: -1.0,
    description: '2019 Northern Ghana flooding — Brong-Ahafo Region',
    sar_file: 'Ghana_541901_S1Hand.tif',
    label_file: 'Ghana_541901_LabelHand.tif',
    event_date: '2019-10-02',
  },
];
