from __future__ import annotations

import os
from typing import Optional

import numpy as np


def load_model(model_path: str):
    """Load the trained U-Net(ResNet34) checkpoint from train.py.

    Returns the model in eval mode, or None if the file does not exist.
    """
    if not os.path.exists(model_path):
        return None

    try:
        import sys
        from pathlib import Path
        root_dir = str(Path(__file__).resolve().parent.parent.parent)
        if root_dir not in sys.path:
            sys.path.insert(0, root_dir)

        from train import UNetResNet34
        import torch

        model = UNetResNet34(in_channels=2, num_classes=1)
        state = torch.load(model_path, map_location="cpu")
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state)
        model.eval()
        return model
    except Exception as exc:  # noqa: BLE001
        print(f"[inference] Failed to load model from {model_path}: {exc}")
        return None


def run_unet(tensor, model, threshold: float = 0.5) -> np.ndarray:
    """Run U-Net inference and return a uint8 binary mask (H, W).

    Args:
        tensor: torch.Tensor of shape [1, 2, H, W]
        model:  loaded smp.Unet model
        threshold: sigmoid output threshold for positive class

    Returns:
        Binary mask: 1 = flood, 0 = non-flood  (dtype uint8, shape H×W)
    """
    import torch  # type: ignore

    with torch.no_grad():
        logits = model(tensor)  # (1, 1, H, W)
        prob = torch.sigmoid(logits).squeeze().cpu().numpy()  # (H, W)

    mask = (prob >= threshold).astype(np.uint8)
    return mask


def run_otsu(vv: np.ndarray) -> np.ndarray:
    """Apply Otsu thresholding on the VV band.

    Low backscatter values correspond to open water (smooth surface).

    Returns:
        Binary mask: 1 = water/flood, 0 = land  (dtype uint8, shape H×W)
    """
    # Work on a finite-only copy
    arr = vv.copy()
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

    if arr.max() == arr.min():
        # Degenerate image — return all zeros
        return np.zeros_like(arr, dtype=np.uint8)

    try:
        from skimage.filters import threshold_otsu  # type: ignore
        thresh = threshold_otsu(arr)
        mask = (arr < thresh).astype(np.uint8)
        return mask
    except ImportError:
        # Robust pure-numpy Otsu implementation if skimage is not installed
        # Normalize finite band values to 0..255 uint8 histogram
        norm = (arr - arr.min()) / (arr.max() - arr.min() + 1e-8)
        img_u8 = (norm * 255).astype(np.uint8)

        # Standard Otsu on 256 bins
        hist = np.bincount(img_u8.ravel(), minlength=256).astype(float)
        total = hist.sum()
        current_max, threshold = 0.0, 0
        weight_bg, sum_bg = 0.0, 0.0
        sum_total = np.dot(np.arange(256), hist)

        for i in range(256):
            weight_bg += hist[i]
            if weight_bg == 0:
                continue
            weight_fg = total - weight_bg
            if weight_fg == 0:
                break
            sum_bg += i * hist[i]
            mean_bg = sum_bg / weight_bg
            mean_fg = (sum_total - sum_bg) / weight_fg
            var_between = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
            if var_between > current_max:
                current_max = var_between
                threshold = i

        # Water in SAR corresponds to dark / low backscatter
        mask = (img_u8 <= threshold).astype(np.uint8)
        return mask


def compute_metrics(pred: np.ndarray, gt: Optional[np.ndarray]) -> tuple[dict, dict]:
    """Compute IoU, Dice, precision, recall, and confusion matrix between pred and gt.

    Pixels where gt == -1 are strictly ignored (no-data / cloud / edge).
    """
    if gt is None:
        metrics = {"iou": None, "dice": None, "precision": None, "recall": None}
        cm = {"tp": 0, "tn": 0, "fp": 0, "fn": 0, "valid_pixels": 0, "water_pixel_pct": 0.0, "gt_water_pixel_pct": 0.0}
        return metrics, cm

    # Mask out no-data pixels
    valid = (gt != -1)
    p = pred[valid].astype(bool)
    g = gt[valid].astype(bool)

    tp = int(np.logical_and(p, g).sum())
    tn = int(np.logical_and(~p, ~g).sum())
    fp = int(np.logical_and(p, ~g).sum())
    fn = int(np.logical_and(~p, g).sum())

    iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    dice = (2 * tp) / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    valid_count = int(valid.sum())
    water_pred_count = int(p.sum())
    water_gt_count = int(g.sum())

    metrics = {
        "iou": round(float(iou), 4),
        "dice": round(float(dice), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
    }

    cm = {
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "valid_pixels": valid_count,
        "water_pixel_pct": round(float(water_pred_count / valid_count * 100), 2) if valid_count > 0 else 0.0,
        "gt_water_pixel_pct": round(float(water_gt_count / valid_count * 100), 2) if valid_count > 0 else 0.0,
    }

    return metrics, cm
