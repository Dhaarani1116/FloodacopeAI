# FloodScope AI 🛰️🌊

**Satellite Synthetic Aperture Radar (SAR) Flood Response & Deep Learning Decision-Support System**

FloodScope AI is a scientific remote sensing platform designed for automated flood inundation delineation using European Space Agency (ESA) Copernicus Sentinel-1 C-band radar observations and deep convolutional neural networks (U-Net with ResNet34 backbone). The system is trained and benchmarked against the official **Sen1Floods11 v1.1** global dataset across 8 monitored disaster events.

---

## 🌟 Key Features

* **Real Sentinel-1 Dual-Pol Inundation Analysis:** Calibrated processing of SAR VV and VH polarizations with 2%–98% contrast stretching.
* **Trained Deep Learning Segmentation:** Custom 2-channel U-Net with ResNet34 encoder trained using masked BCE + Dice loss (strictly ignoring $-1$ no-data pixels).
* **Comparative Scientific Baseline:** Real-time side-by-side benchmarking against classical Otsu radar backscatter thresholding.
* **Exact Remote-Sensing Color Palette:**
  * **SAR Radar:** Natural grayscale calibrated backscatter ($\sigma^\circ$).
  * **Otsu Baseline:** Red (detected water) + Green (non-water land).
  * **U-Net Prediction:** Yellow (predicted floodwater) + Muted Blue (predicted terrain).
  * **Ground Truth Reference:** Violet (true water) + Dark Grey (land) + Light Grey ($-1$ no-data).
* **Scientific Analytics Dashboard:**
  * Training and validation loss convergence across 20 epochs.
  * Regional IoU performance breakdown across all 8 global flood events.
  * U-Net vs Otsu metric comparisons (IoU, Dice, Precision, Recall).
  * Mathematically consistent $2 \times 2$ Pixel Confusion Matrix ($TP, TN, FP, FN$).
  * Inundation coverage percentage comparison.
* **Automated Scientific PDF Report:** Generates formal academic PDF reports summarizing sensor metadata, performance benchmarks, and hydrological interpretations with **Preview** and **Download** capabilities.
* **GIS Interoperability:** Optional georeferenced GeoJSON boundary export for direct spatial analysis in QGIS, ArcGIS, or geojson.io.
* **Searchable World Map:** Integrated OpenStreetMap Nominatim geocoding with instant navigation to 8 monitored flood events (India, Pakistan, Spain, Mekong, USA, Ghana, Paraguay, and Bolivia).

---

## 🏗️ Repository Architecture

```text
FloodScopeAI/
├── backend/
│   ├── app/
│   │   ├── geospatial.py          # Affine transformation & polygon vectorization
│   │   ├── inference.py           # PyTorch U-Net inference & Otsu thresholding
│   │   ├── main.py                # FastAPI endpoints, PDF report builder, job manager
│   │   ├── preprocessing.py       # Sentinel-1 VV/VH normalization & tensor preparation
│   │   └── schemas.py             # Pydantic data schemas
│   ├── models/                    # Model weights checkpoint directory
│   ├── requirements.txt           # Python dependencies
│   ├── results/                   # Dynamic GeoJSON exports
│   └── uploads/                   # Temporary file uploads
├── data/
│   ├── labels_real/               # Ground-truth validation masks
│   ├── sentinel1_real/            # Genuine Sentinel-1 SAR GeoTIFFs (VV + VH)
│   ├── splits/                    # Official Sen1Floods11 train/valid/test/Bolivia splits
│   ├── download_report.json       # Dataset download verification
│   ├── evaluation_report.json     # Complete benchmark metrics and training history
│   ├── selected_100_pairs.json    # Metadata index for 100 chip pairs
│   └── selection_manifest.csv     # Master dataset partition manifest
├── frontend/
│   ├── src/
│   │   ├── components/            # GlobeView, LeftPanel, ComparisonWorkspace, Header,
│   │   │                          # RegionInfoPanel, AnalyticsBar
│   │   ├── services/api.ts        # Axios client & polling service
│   │   ├── App.tsx                # Central state & layout
│   │   └── main.tsx               # React DOM root
│   ├── package.json               # NPM dependencies (React, Leaflet, Recharts)
│   └── vite.config.ts             # Vite dev server with backend proxy rules
├── download_real_sen1floods11.py  # Standalone dataset fetcher from GCS
└── train.py                       # UNetResNet34 PyTorch architecture and training loop
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup

```bash
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Backend API docs available at: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:3000`

### 3. Dataset Download (Optional)

To download the 100 genuine Sentinel-1 GeoTIFFs from Google Cloud Storage:
```bash
python download_real_sen1floods11.py
```

### 4. Model Training (Optional)

To retrain the U-Net + ResNet34 model on the Sen1Floods11 dataset:
```bash
python train.py --epochs 20 --batch-size 4 --lr 0.0003
```

---

## 📊 Scientific Benchmark Summary

Evaluated on official held-out test splits and Bolivia zero-shot generalization:
* **U-Net Test IoU:** $33.44\%$ (+6.05% gain over Otsu baseline).
* **U-Net Test Precision:** $57.05\%$ (effectively suppresses false alarms from flat dry soil specular reflections).
* **Bolivia Held-Out IoU:** $40.46\%$ (strong generalization across unseen Amazon river basin floodplains).

---

## 📜 License & Acknowledgments

* **Data:** European Space Agency (ESA) Copernicus Sentinel-1 Mission; Sen1Floods11 dataset courtesy of Cloud to Street.
* **Platform:** Developed by Dhaarani Mohankumar.
