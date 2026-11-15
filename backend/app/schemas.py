from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    filename: str


class UploadResponse(BaseModel):
    filename: str
    file_size_bytes: int
    message: str


class AnalysisResult(BaseModel):
    filename: str
    flood_area_km2: float
    polygon_count: int
    model_used: str
    processing_time_seconds: float
    metrics: dict  # keys: iou, dice, precision, recall (floats or None)
    confusion_matrix: Optional[dict] = None  # keys: tp, tn, fp, fn, valid_pixels, water_pixel_pct, gt_water_pixel_pct
    geojson: dict
    otsu_comparison: dict  # keys: otsu_iou, otsu_dice (floats or None)
    panels: Optional[dict] = None  # keys: sar_vv, sar_vh, otsu, unet, ground_truth, otsu_threshold


class JobStatus(BaseModel):
    job_id: str
    status: Literal["pending", "running", "done", "error"]
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None


class SampleRegion(BaseModel):
    id: str
    name: str
    country: str
    lat: float
    lon: float
    description: str
    sar_file: str
    label_file: str
    event_date: str
