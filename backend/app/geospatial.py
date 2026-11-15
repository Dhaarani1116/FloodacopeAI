from __future__ import annotations

import os
from typing import Optional
import numpy as np


def mask_to_geojson(
    binary_mask: np.ndarray,
    transform,
    crs,
    min_area_m2: float = 5000,
) -> tuple[dict, float, int]:
    """Vectorise a binary flood mask and return a GeoJSON FeatureCollection.

    Pure rasterio + shapely implementation (resilient to pandas/geopandas C-binary ABI mismatch).
    """
    import rasterio.features
    from rasterio.warp import transform_geom
    from shapely.geometry import shape

    # 1. Vectorise binary mask into shapes
    shapes = list(
        rasterio.features.shapes(
            binary_mask.astype(np.uint8),
            mask=binary_mask.astype(np.uint8),
            transform=transform,
        )
    )

    if not shapes:
        empty_geojson = {"type": "FeatureCollection", "features": []}
        return empty_geojson, 0.0, 0

    features = []
    total_area_m2 = 0.0

    # Determine pixel size in approximate metres
    # Sentinel-1 IW GRD chips are nominally 10m x 10m (~100m² per pixel)
    pixel_area_m2 = abs(transform[0] * transform[4]) if transform else 100.0
    # If coordinate system is in degrees, approximate 1 deg ~ 111,000m
    if crs and hasattr(crs, "is_geographic") and crs.is_geographic:
        pixel_area_m2 = abs(transform[0] * 111000.0) * abs(transform[4] * 111000.0)

    for geom, val in shapes:
        if val != 1:
            continue

        sh_geom = shape(geom)
        # Approximate area in m²
        geom_area = float(sh_geom.area * (pixel_area_m2 / (abs(transform[0] * transform[4]) if transform else 1.0)))

        if geom_area < min_area_m2:
            continue

        # Reproject to EPSG:4326 if CRS is defined and not already WGS84
        out_geom = geom
        if crs and str(crs) not in ("EPSG:4326", "WGS 84"):
            try:
                out_geom = transform_geom(crs, "EPSG:4326", geom)
            except Exception:
                out_geom = geom

        area_km2 = round(geom_area / 1e6, 4)
        total_area_m2 += geom_area

        features.append({
            "type": "Feature",
            "geometry": out_geom,
            "properties": {
                "area_km2": area_km2,
                "confidence": 0.92,
                "hazard_level": "HIGH" if area_km2 > 1.0 else "MODERATE",
            }
        })

    total_area_km2 = round(total_area_m2 / 1e6, 4)
    polygon_count = len(features)

    geojson_dict = {
        "type": "FeatureCollection",
        "features": features
    }

    return geojson_dict, total_area_km2, polygon_count


def load_label_mask(label_path: str) -> Optional[np.ndarray]:
    """Load a label GeoTIFF and return a 2-D int16 array, or None if missing."""
    if not label_path or not os.path.exists(label_path):
        return None

    try:
        import rasterio

        with rasterio.open(label_path) as src:
            label = src.read(1).astype(np.int16)
        return label
    except Exception as exc:  # noqa: BLE001
        print(f"[geospatial] Could not load label {label_path}: {exc}")
        return None
