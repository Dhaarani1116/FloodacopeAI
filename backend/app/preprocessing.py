from __future__ import annotations

import numpy as np


def load_sar_image(path: str) -> tuple[np.ndarray, np.ndarray, dict]:
    """Load VV and VH bands from a SAR GeoTIFF via rasterio.

    Returns:
        vv: 2-D float32 array (H, W)
        vh: 2-D float32 array (H, W)
        meta: dict with keys crs, transform, width, height
    """
    import rasterio  # type: ignore

    with rasterio.open(path) as src:
        # Expect at least 2 bands: band 1 = VV, band 2 = VH
        vv = src.read(1).astype(np.float32)
        if src.count >= 2:
            vh = src.read(2).astype(np.float32)
        else:
            # Single-band file — duplicate band as VH placeholder
            vh = vv.copy()

        nodata = src.nodata
        if nodata is not None:
            vv = np.where(vv == nodata, 0.0, vv)
            vh = np.where(vh == nodata, 0.0, vh)

        # Replace NaN / Inf with 0
        vv = np.nan_to_num(vv, nan=0.0, posinf=0.0, neginf=0.0)
        vh = np.nan_to_num(vh, nan=0.0, posinf=0.0, neginf=0.0)

        meta = {
            "crs": src.crs,
            "transform": src.transform,
            "width": src.width,
            "height": src.height,
        }

    return vv, vh, meta


def normalize_bands(vv: np.ndarray, vh: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-channel z-score normalisation using only valid (non-zero) pixels."""

    def _zscore(arr: np.ndarray) -> np.ndarray:
        valid = arr[arr != 0]
        if valid.size == 0:
            return arr
        mean = valid.mean()
        std = valid.std()
        if std < 1e-8:
            std = 1e-8
        return (arr - mean) / std

    return _zscore(vv), _zscore(vh)


def prepare_tensor(vv: np.ndarray, vh: np.ndarray):
    """Stack VV and VH into a [1, 2, H, W] float32 torch.Tensor."""
    import torch  # type: ignore

    stacked = np.stack([vv, vh], axis=0)  # (2, H, W)
    tensor = torch.from_numpy(stacked).unsqueeze(0).float()  # (1, 2, H, W)
    return tensor
