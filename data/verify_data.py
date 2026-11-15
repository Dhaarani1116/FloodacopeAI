"""
FloodScope AI — Dataset Verification Script
Lists all SAR + label files, opens each with rasterio,
and prints a summary table saved to verification_report.txt.
"""

import os
import glob

try:
    import rasterio
except ImportError:
    print("ERROR: rasterio not installed. Run: pip install rasterio")
    raise

# ---------------------------------------------------------------------------
# Discover chips
# ---------------------------------------------------------------------------

def load_splits() -> dict[str, str]:
    """Return mapping chip_id -> split_name."""
    mapping = {}
    for split in ["train", "validation", "test"]:
        path = f"splits/{split}.csv"
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                cid = line.strip()
                if cid and cid != "chip_id":
                    mapping[cid] = split
    return mapping


def verify_all() -> list[dict]:
    sar_files = sorted(glob.glob("sentinel1/*_S1Hand.tif"))
    split_map = load_splits()

    rows = []
    for sar_path in sar_files:
        fname = os.path.basename(sar_path)
        chip_id = fname.replace("_S1Hand.tif", "")
        label_path = f"labels/{chip_id}_LabelHand.tif"
        has_label = os.path.exists(label_path)
        split = split_map.get(chip_id, "unknown")

        row = {
            "chip_id": chip_id,
            "bands": None,
            "shape": None,
            "crs": None,
            "vv_min": None,
            "vv_max": None,
            "has_label": has_label,
            "split": split,
            "error": None,
        }

        try:
            with rasterio.open(sar_path) as src:
                row["bands"] = src.count
                row["shape"] = f"{src.height}x{src.width}"
                row["crs"] = str(src.crs).replace("EPSG:", "EPSG:")
                vv = src.read(1)
                row["vv_min"] = round(float(vv.min()), 2)
                row["vv_max"] = round(float(vv.max()), 2)
        except Exception as e:
            row["error"] = str(e)

        rows.append(row)
    return rows


def print_table(rows: list[dict]):
    header = f"{'chip_id':<30} {'bands':>5} {'shape':>10} {'has_label':>9} {'split':>12} {'vv_range':>18} {'crs':>15}"
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)
    for r in rows:
        vv_range = f"[{r['vv_min']}, {r['vv_max']}]" if r["vv_min"] is not None else "ERROR"
        print(
            f"{r['chip_id']:<30} "
            f"{str(r['bands']):>5} "
            f"{str(r['shape']):>10} "
            f"{str(r['has_label']):>9} "
            f"{r['split']:>12} "
            f"{vv_range:>18} "
            f"{str(r['crs']):>15}"
        )
    print(sep)


def save_report(rows: list[dict]):
    lines = ["FloodScope AI — Dataset Verification Report", "=" * 70, ""]
    lines.append(f"Total SAR chips found: {len(rows)}")
    lines.append(f"All have labels      : {all(r['has_label'] for r in rows)}")
    lines.append(f"Errors               : {sum(1 for r in rows if r['error'])}")
    lines.append("")
    header = f"{'chip_id':<30} {'bands':>5} {'shape':>10} {'has_label':>9} {'split':>12}"
    lines.append(header)
    lines.append("-" * len(header))
    for r in rows:
        lines.append(
            f"{r['chip_id']:<30} "
            f"{str(r['bands']):>5} "
            f"{str(r['shape']):>10} "
            f"{str(r['has_label']):>9} "
            f"{r['split']:>12}"
        )
        if r["error"]:
            lines.append(f"  ERROR: {r['error']}")
    with open("verification_report.txt", "w") as f:
        f.write("\n".join(lines))
    print(f"\nVerification report saved to: {os.path.abspath('verification_report.txt')}")


def main():
    print("FloodScope AI — Dataset Verification")
    print("=" * 50)
    rows = verify_all()
    print_table(rows)
    save_report(rows)
    n_ok = sum(1 for r in rows if r["has_label"] and not r["error"])
    print(f"\n{n_ok}/{len(rows)} chips fully verified (SAR + label, no errors).")


if __name__ == "__main__":
    main()
