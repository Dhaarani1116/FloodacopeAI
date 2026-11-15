"""
FloodScope AI — Sen1Floods11 Small Subset Downloader
Target: ~50 matched SAR images + hand-labelled masks (~200 MB)
Uses direct HTTPS from the public GCS bucket (no gsutil needed).
"""
import os, json, csv, time, hashlib
import urllib.request, urllib.error
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT   = Path(__file__).parent
S1_DIR = ROOT / "sentinel1"
LB_DIR = ROOT / "labels"
SP_DIR = ROOT / "splits"
for d in [S1_DIR, LB_DIR, SP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

GCS_BASE = "https://storage.googleapis.com/sen1floods11/v1.1"

# Official split CSV URLs
SPLIT_URLS = {
    "train":      f"{GCS_BASE}/splits/flood_handlabeled/flood_train_data.csv",
    "validation": f"{GCS_BASE}/splits/flood_handlabeled/flood_valid_data.csv",
    "test":       f"{GCS_BASE}/splits/flood_handlabeled/flood_test_data.csv",
}

# Target counts per split
TARGETS = {"train": 35, "validation": 10, "test": 5}

# ── Helpers ──────────────────────────────────────────────────────────────────
def download_file(url: str, dest: Path, label: str = "") -> bool:
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  [skip] {dest.name} already exists")
        return True
    try:
        print(f"  [↓] {label or dest.name} ...", end=" ", flush=True)
        urllib.request.urlretrieve(url, dest)
        size_kb = dest.stat().st_size / 1024
        print(f"{size_kb:.0f} KB")
        return True
    except Exception as e:
        print(f"FAILED ({e})")
        if dest.exists():
            dest.unlink()
        return False

def fetch_text(url: str) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read().decode("utf-8")
    except Exception as e:
        print(f"  Could not fetch {url}: {e}")
        return None

# ── Step 1: Download split CSVs ───────────────────────────────────────────────
print("\n=== Step 1: Downloading official split CSVs ===")
split_data: dict[str, list[str]] = {}

for split_name, url in SPLIT_URLS.items():
    dest = SP_DIR / f"{split_name}.csv"
    ok = download_file(url, dest, f"{split_name}.csv")
    if not ok:
        # Try alternate URL format
        alt_url = f"{GCS_BASE}/splits/flood_handlabeled/{split_name}.csv"
        ok = download_file(alt_url, dest, f"{split_name}.csv (alt)")
    
    if dest.exists():
        rows = []
        with open(dest, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if row and not row[0].startswith("#"):
                    rows.append(row[0].strip())
        split_data[split_name] = [r for r in rows if r]
        print(f"  → {split_name}: {len(split_data[split_name])} chips found")
    else:
        split_data[split_name] = []
        print(f"  → {split_name}: CSV not available, will discover chips manually")

# ── Step 2: Build chip list ───────────────────────────────────────────────────
print("\n=== Step 2: Selecting chip IDs ===")

# If CSVs list chip_ids (like "Bolivia_103757_S1Hand"), extract the base ID
def clean_chip_id(raw: str) -> str:
    """Strip suffixes like _S1Hand, _LabelHand to get base chip ID."""
    return raw.replace("_S1Hand", "").replace("_LabelHand", "").replace("_S1Flood", "").strip()

selected: dict[str, list[str]] = {}
for split_name, rows in split_data.items():
    limit = TARGETS[split_name]
    chips = [clean_chip_id(r) for r in rows]
    chips = list(dict.fromkeys(chips))  # deduplicate, preserve order
    selected[split_name] = chips[:limit]
    print(f"  {split_name}: selected {len(selected[split_name])} / {len(chips)} chips")

# If CSV parsing yielded nothing, use known hand-labeled chip IDs from the paper
if not any(selected.values()):
    print("  CSVs empty — using fallback known chip IDs from Sen1Floods11 README")
    # Known events in the hand-labeled set:
    fallback_events = [
        "Bolivia", "Canada", "Ghana", "India", "Mekong", "Nigeria",
        "Pakistan", "Paraguay", "USA", "Somalia",
    ]
    # We'll discover actual file names from GCS listing
    fallback = []
    for event in fallback_events:
        fallback.append(f"{event}_00000")
    selected["train"]      = fallback[:35]
    selected["validation"] = fallback[35:45]
    selected["test"]       = fallback[45:50]

all_chips = []
for s, chips in selected.items():
    for c in chips:
        all_chips.append((s, c))

print(f"\n  Total chips to download: {len(all_chips)}")

# ── Step 3: Download SAR images + labels ─────────────────────────────────────
print("\n=== Step 3: Downloading SAR images and labels ===")

S1_PATH   = "data/flood_events/HandLabeled/S1Hand"
LABEL_PATH = "data/flood_events/HandLabeled/LabelHand"

success_sar, success_lbl, fail_sar, fail_lbl = [], [], [], []
total_bytes = 0

for split_name, chip_id in all_chips:
    sar_name   = f"{chip_id}_S1Hand.tif"
    label_name = f"{chip_id}_LabelHand.tif"

    sar_url   = f"{GCS_BASE}/{S1_PATH}/{sar_name}"
    label_url = f"{GCS_BASE}/{LABEL_PATH}/{label_name}"

    sar_dest   = S1_DIR / sar_name
    label_dest = LB_DIR / label_name

    print(f"\n[{split_name}] {chip_id}")
    s_ok = download_file(sar_url,   sar_dest,   sar_name)
    l_ok = download_file(label_url, label_dest, label_name)

    if s_ok and sar_dest.exists():
        success_sar.append(chip_id)
        total_bytes += sar_dest.stat().st_size
    else:
        fail_sar.append(chip_id)

    if l_ok and label_dest.exists():
        success_lbl.append(chip_id)
        total_bytes += label_dest.stat().st_size
    else:
        fail_lbl.append(chip_id)

# ── Step 4: Verify matched pairs ─────────────────────────────────────────────
print("\n=== Step 4: Verifying matched pairs ===")
matched = []
for chip_id in success_sar:
    if chip_id in success_lbl:
        matched.append(chip_id)

print(f"  Matched pairs: {len(matched)}")
print(f"  SAR only (no label): {len(set(success_sar) - set(success_lbl))}")
print(f"  Label only (no SAR): {len(set(success_lbl) - set(success_sar))}")

# Try opening a sample with rasterio (optional)
try:
    import rasterio
    sample_files = list(S1_DIR.glob("*.tif"))[:3]
    for f in sample_files:
        with rasterio.open(f) as ds:
            print(f"  ✓ {f.name}: {ds.count} bands, shape {ds.width}×{ds.height}, CRS={ds.crs}")
except ImportError:
    print("  rasterio not installed — skipping verification (install it with: pip install rasterio)")
except Exception as e:
    print(f"  rasterio check error: {e}")

# ── Step 5: Save download report ──────────────────────────────────────────────
report = {
    "total_chips_downloaded": len(matched),
    "total_size_mb": round(total_bytes / 1_048_576, 2),
    "split_counts": {s: len(chips) for s, chips in selected.items()},
    "matched_pairs": matched,
    "failed_sar": fail_sar,
    "failed_labels": fail_lbl,
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}

report_path = ROOT / "download_report.txt"
with open(report_path, "w") as f:
    f.write("FloodScope AI — Sen1Floods11 Download Report\n")
    f.write("=" * 50 + "\n\n")
    f.write(f"Total matched pairs: {len(matched)}\n")
    f.write(f"Total size:          {report['total_size_mb']} MB\n\n")
    f.write("Split counts:\n")
    for s, cnt in report["split_counts"].items():
        f.write(f"  {s}: {cnt}\n")
    f.write(f"\nFailed SAR downloads: {len(fail_sar)}\n")
    f.write(f"Failed label downloads: {len(fail_lbl)}\n")
    if fail_sar:
        f.write("\nFailed chips:\n")
        for c in fail_sar:
            f.write(f"  {c}\n")

json_path = ROOT / "download_report.json"
with open(json_path, "w") as f:
    json.dump(report, f, indent=2)

print(f"\n=== Download Complete ===")
print(f"  Matched pairs: {len(matched)}")
print(f"  Total size:    {report['total_size_mb']} MB")
print(f"  Report saved:  {report_path}")
