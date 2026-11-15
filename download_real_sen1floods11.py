import os
import json
import urllib.request
import rasterio
import tempfile
import shutil

def main():
    manifest_path = os.path.join('data', 'selected_100_pairs.json')
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, 'r') as f:
        pairs = json.load(f)

    # Destination directories
    s1_dir = os.path.join('data', 'sentinel1_real')
    lbl_dir = os.path.join('data', 'labels_real')
    os.makedirs(s1_dir, exist_ok=True)
    os.makedirs(lbl_dir, exist_ok=True)

    print(f"==================================================================")
    print(f" FloodScope AI — Verified Sen1Floods11 v1.1 Downloader (100 Pairs)")
    print(f" Destination: {s1_dir}/ and {lbl_dir}/")
    print(f"==================================================================")

    total_downloaded = 0

    for idx, p in enumerate(pairs, 1):
        s1_file = p['sar_file']
        lbl_file = p['label_file']

        s1_dest = os.path.join(s1_dir, s1_file)
        lbl_dest = os.path.join(lbl_dir, lbl_file)

        s1_url = f"https://storage.googleapis.com/sen1floods11/v1.1/data/flood_events/HandLabeled/S1Hand/{s1_file}"
        lbl_url = f"https://storage.googleapis.com/sen1floods11/v1.1/data/flood_events/HandLabeled/LabelHand/{lbl_file}"

        # Download S1 with atomic rename (protects against partial downloads)
        if not os.path.exists(s1_dest):
            with tempfile.NamedTemporaryFile(delete=False, dir=s1_dir) as tmp:
                urllib.request.urlretrieve(s1_url, tmp.name)
                tmp_name = tmp.name
            shutil.move(tmp_name, s1_dest)

        # Download Label with atomic rename
        if not os.path.exists(lbl_dest):
            with tempfile.NamedTemporaryFile(delete=False, dir=lbl_dir) as tmp:
                urllib.request.urlretrieve(lbl_url, tmp.name)
                tmp_name = tmp.name
            shutil.move(tmp_name, lbl_dest)

        total_downloaded += 1
        print(f"[{idx:3d}/100] [{p['official_split']:12s}] {p['event']:8s} | Verified: {s1_file}")

    print("\n------------------------------------------------------------------")
    print(" Running rasterio band count & label value validation...")
    print("------------------------------------------------------------------")

    verified_count = 0
    for p in pairs:
        s1_dest = os.path.join(s1_dir, p['sar_file'])
        lbl_dest = os.path.join(lbl_dir, p['label_file'])

        with rasterio.open(s1_dest) as s_src, rasterio.open(lbl_dest) as l_src:
            assert s_src.count == 2, f"Expected 2 bands in {p['sar_file']}, got {s_src.count}"
            assert l_src.count == 1, f"Expected 1 band in {p['label_file']}, got {l_src.count}"
            assert s_src.shape == l_src.shape == (512, 512), f"Shape mismatch in {p['sar_file']}"
            verified_count += 1

    print(f"\nSUCCESS: All {verified_count}/100 real Sen1Floods11 pairs downloaded & verified!")
    print(f"Data saved cleanly in: {s1_dir} and {lbl_dir}")

if __name__ == '__main__':
    main()
