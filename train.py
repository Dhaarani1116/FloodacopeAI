import os
import csv
import time
import random
import argparse
import numpy as np
import rasterio

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import torchvision.models as models

# ---------------------------------------------------------------------------
# 1. Dataset & Data Loading
# ---------------------------------------------------------------------------

class Sen1FloodsDataset(Dataset):
    def __init__(self, manifest_rows, s1_dir, lbl_dir, augment=False):
        self.rows = manifest_rows
        self.s1_dir = s1_dir
        self.lbl_dir = lbl_dir
        self.augment = augment

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        s1_path = os.path.join(self.s1_dir, row['sar_file'])
        lbl_path = os.path.join(self.lbl_dir, row['label_file'])

        with rasterio.open(s1_path) as s_src:
            vv = s_src.read(1).astype(np.float32)
            vh = s_src.read(2).astype(np.float32)

        with rasterio.open(lbl_path) as l_src:
            lbl = l_src.read(1).astype(np.int64)

        # 1. Handle NaNs and satellite edge noise floor
        # Typical SAR noise floor is ~ -30 dB
        vv_nan = np.isnan(vv)
        vh_nan = np.isnan(vh)
        vv = np.nan_to_num(vv, nan=-30.0)
        vh = np.nan_to_num(vh, nan=-30.0)

        # 2. Validity mask: mark any radar NaN as no-data (-1) in label
        lbl[vv_nan | vh_nan] = -1

        # 3. Radiometric Standardization (dB z-score norm using typical S1 statistics)
        # VV: mean ~ -12.0 dB, std ~ 6.0 dB
        # VH: mean ~ -19.0 dB, std ~ 6.0 dB
        vv = (np.clip(vv, -40.0, 10.0) - (-12.0)) / 6.0
        vh = (np.clip(vh, -40.0, 10.0) - (-19.0)) / 6.0

        sar_img = np.stack([vv, vh], axis=0) # [2, 512, 512]

        # 4. Augmentation for training split only
        if self.augment:
            # Horizontal flip
            if random.random() > 0.5:
                sar_img = np.flip(sar_img, axis=2).copy()
                lbl = np.flip(lbl, axis=1).copy()
            # Vertical flip
            if random.random() > 0.5:
                sar_img = np.flip(sar_img, axis=1).copy()
                lbl = np.flip(lbl, axis=0).copy()
            # 90-degree rotations (k = 1, 2, or 3)
            rot = random.choice([0, 1, 2, 3])
            if rot > 0:
                sar_img = np.rot90(sar_img, k=rot, axes=(1, 2)).copy()
                lbl = np.rot90(lbl, k=rot, axes=(0, 1)).copy()

        tensor_img = torch.from_numpy(sar_img).float()
        tensor_lbl = torch.from_numpy(lbl).long()

        return tensor_img, tensor_lbl, row['chip_id'], row['event']


# ---------------------------------------------------------------------------
# 2. U-Net Architecture with ResNet34 Backbone
# ---------------------------------------------------------------------------

class DecoderBlock(nn.Module):
    def __init__(self, in_channels, skip_channels, out_channels):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels + skip_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)

    def forward(self, x, skip=None):
        x = F.interpolate(x, scale_factor=2.0, mode='bilinear', align_corners=True)
        if skip is not None:
            x = torch.cat([x, skip], dim=1)
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        return x


class UNetResNet34(nn.Module):
    def __init__(self, in_channels=2, num_classes=1):
        super().__init__()
        # Load backbone
        backbone = models.resnet34(weights=None)
        
        # Adapt first conv to 2 channels
        self.conv1 = nn.Conv2d(in_channels, 64, kernel_size=7, stride=2, padding=3, bias=False)
        self.bn1 = backbone.bn1
        self.relu = backbone.relu
        self.maxpool = backbone.maxpool

        # Encoder stages
        self.layer1 = backbone.layer1 # 64 channels, 1/4 res (128x128)
        self.layer2 = backbone.layer2 # 128 channels, 1/8 res (64x64)
        self.layer3 = backbone.layer3 # 256 channels, 1/16 res (32x32)
        self.layer4 = backbone.layer4 # 512 channels, 1/32 res (16x16)

        # Decoder stages
        self.dec4 = DecoderBlock(512, 256, 256)
        self.dec3 = DecoderBlock(256, 128, 128)
        self.dec2 = DecoderBlock(128, 64, 64)
        self.dec1 = DecoderBlock(64, 64, 64)

        # Final head to 512x512
        self.final_up = nn.Sequential(
            nn.Upsample(scale_factor=2.0, mode='bilinear', align_corners=True),
            nn.Conv2d(64, 32, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, num_classes, kernel_size=1)
        )

    def forward(self, x):
        # Initial stem
        x0 = self.relu(self.bn1(self.conv1(x))) # [64, 256, 256]
        x_pool = self.maxpool(x0)              # [64, 128, 128]

        # Encoder forward
        e1 = self.layer1(x_pool) # [64, 128, 128]
        e2 = self.layer2(e1)     # [128, 64, 64]
        e3 = self.layer3(e2)     # [256, 32, 32]
        e4 = self.layer4(e3)     # [512, 16, 16]

        # Decoder forward with skip connections
        d4 = self.dec4(e4, e3)   # [256, 32, 32]
        d3 = self.dec3(d4, e2)   # [128, 64, 64]
        d2 = self.dec2(d3, e1)   # [64, 128, 128]
        d1 = self.dec1(d2, x0)   # [64, 256, 256]

        # Final logits
        out = self.final_up(d1)  # [1, 512, 512]
        return out


# ---------------------------------------------------------------------------
# 3. Masked Loss (BCE + Dice, strictly ignoring -1 label pixels)
# ---------------------------------------------------------------------------

class MaskedBCEWithDiceLoss(nn.Module):
    def __init__(self, bce_weight=0.5, smooth=1.0):
        super().__init__()
        self.bce_weight = bce_weight
        self.smooth = smooth

    def forward(self, logits, targets):
        """
        logits: [B, 1, H, W]
        targets: [B, H, W] with values in {-1, 0, 1}
        """
        valid_mask = (targets != -1)
        if not valid_mask.any():
            return torch.tensor(0.0, device=logits.device, requires_grad=True)

        valid_logits = logits.squeeze(1)[valid_mask]
        valid_targets = targets[valid_mask].float()

        # BCE Loss
        bce = F.binary_cross_entropy_with_logits(valid_logits, valid_targets)

        # Dice Loss on valid pixels
        probs = torch.sigmoid(valid_logits)
        intersection = (probs * valid_targets).sum()
        dice = 1.0 - (2.0 * intersection + self.smooth) / (probs.sum() + valid_targets.sum() + self.smooth)

        return self.bce_weight * bce + (1.0 - self.bce_weight) * dice


# ---------------------------------------------------------------------------
# 4. Evaluation Metrics
# ---------------------------------------------------------------------------

def calculate_metrics(preds, targets):
    """
    preds: numpy binary array [H, W] (0 or 1)
    targets: numpy array [H, W] (-1, 0, 1)
    """
    valid = (targets != -1)
    if not valid.any():
        return {'iou': 0.0, 'dice': 0.0, 'precision': 0.0, 'recall': 0.0}

    p = preds[valid] == 1
    t = targets[valid] == 1

    tp = np.logical_and(p, t).sum()
    fp = np.logical_and(p, ~t).sum()
    fn = np.logical_and(~p, t).sum()

    iou = tp / (tp + fp + fn + 1e-8)
    dice = (2.0 * tp) / (2.0 * tp + fp + fn + 1e-8)
    precision = tp / (tp + fp + 1e-8)
    recall = tp / (tp + fn + 1e-8)

    return {
        'iou': float(iou),
        'dice': float(dice),
        'precision': float(precision),
        'recall': float(recall)
    }


def evaluate_dataset(model, loader, device):
    model.eval()
    all_ious = []
    all_dices = []
    all_precisions = []
    all_recalls = []

    with torch.no_grad():
        for imgs, lbls, _, _ in loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            probs = torch.sigmoid(logits).squeeze(1).cpu().numpy()
            preds = (probs >= 0.5).astype(np.uint8)
            lbls_np = lbls.numpy()

            for i in range(len(preds)):
                m = calculate_metrics(preds[i], lbls_np[i])
                all_ious.append(m['iou'])
                all_dices.append(m['dice'])
                all_precisions.append(m['precision'])
                all_recalls.append(m['recall'])

    return {
        'iou': float(np.mean(all_ious)),
        'dice': float(np.mean(all_dices)),
        'precision': float(np.mean(all_precisions)),
        'recall': float(np.mean(all_recalls))
    }


def evaluate_otsu(manifest_rows, s1_dir, lbl_dir):
    all_ious = []
    all_dices = []
    all_precisions = []
    all_recalls = []

    for row in manifest_rows:
        s1_path = os.path.join(s1_dir, row['sar_file'])
        lbl_path = os.path.join(lbl_dir, row['label_file'])

        with rasterio.open(s1_path) as s_src:
            vv = s_src.read(1)
        with rasterio.open(lbl_path) as l_src:
            lbl = l_src.read(1)

        vv_nan = np.isnan(vv)
        lbl[vv_nan] = -1

        # Otsu on finite VV values
        finite = vv[np.isfinite(vv)]
        if len(finite) == 0:
            continue

        norm = (finite - finite.min()) / (finite.max() - finite.min() + 1e-8)
        img_u8 = (norm * 255).astype(np.uint8)
        hist = np.bincount(img_u8.ravel(), minlength=256).astype(float)
        total = hist.sum()
        current_max, threshold = 0.0, 0
        weight_bg, sum_bg = 0.0, 0.0
        sum_total = np.dot(np.arange(256), hist)

        for i in range(256):
            weight_bg += hist[i]
            if weight_bg == 0: continue
            weight_fg = total - weight_bg
            if weight_fg == 0: break
            sum_bg += i * hist[i]
            mean_bg = sum_bg / weight_bg
            mean_fg = (sum_total - sum_bg) / weight_fg
            var_between = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
            if var_between > current_max:
                current_max = var_between
                threshold = i

        otsu_thresh_val = finite.min() + (threshold / 255.0) * (finite.max() - finite.min())
        otsu_pred = (vv < otsu_thresh_val).astype(np.uint8)

        m = calculate_metrics(otsu_pred, lbl)
        all_ious.append(m['iou'])
        all_dices.append(m['dice'])
        all_precisions.append(m['precision'])
        all_recalls.append(m['recall'])

    return {
        'iou': float(np.mean(all_ious)),
        'dice': float(np.mean(all_dices)),
        'precision': float(np.mean(all_precisions)),
        'recall': float(np.mean(all_recalls))
    }


# ---------------------------------------------------------------------------
# 5. Main Training Loop
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Train U-Net + ResNet34 on Sen1Floods11")
    parser.add_argument('--epochs', type=int, default=20, help="Number of training epochs")
    parser.add_argument('--batch-size', type=int, default=2, help="Batch size for training")
    parser.add_argument('--lr', type=float, default=1e-3, help="Learning rate")
    parser.add_argument('--smoke-test', action='store_true', help="Run 1 epoch smoke test")
    args = parser.parse_args()

    s1_dir = os.path.join('data', 'sentinel1_real')
    lbl_dir = os.path.join('data', 'labels_real')
    manifest_path = os.path.join('data', 'selection_manifest.csv')

    # Load and partition rows strictly according to official manifest
    rows = []
    with open(manifest_path, 'r') as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    train_rows = [r for r in rows if r['official_split'] == 'train']
    valid_rows = [r for r in rows if r['official_split'] == 'valid']
    test_rows  = [r for r in rows if r['official_split'] == 'test']
    bolivia_rows = [r for r in rows if r['official_split'] == 'bolivia_eval']

    print("==================================================================")
    print(" FloodScope AI — U-Net (ResNet34) Official Training Pipeline")
    print(f" Train: {len(train_rows)} | Valid: {len(valid_rows)} | Test: {len(test_rows)} | Bolivia-Eval: {len(bolivia_rows)}")
    print(f" Batch Size: {args.batch_size} | Epochs: {args.epochs if not args.smoke_test else 1} | Mode: {'SMOKE TEST' if args.smoke_test else 'FULL TRAINING'}")
    print("==================================================================")

    # Datasets
    train_dataset = Sen1FloodsDataset(train_rows, s1_dir, lbl_dir, augment=True)
    valid_dataset = Sen1FloodsDataset(valid_rows, s1_dir, lbl_dir, augment=False)
    test_dataset  = Sen1FloodsDataset(test_rows,  s1_dir, lbl_dir, augment=False)
    bolivia_dataset = Sen1FloodsDataset(bolivia_rows, s1_dir, lbl_dir, augment=False)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    valid_loader = DataLoader(valid_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)
    test_loader  = DataLoader(test_dataset,  batch_size=args.batch_size, shuffle=False, num_workers=0)
    bolivia_loader = DataLoader(bolivia_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Device & Model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using compute device: {device}")

    model = UNetResNet34(in_channels=2, num_classes=1).to(device)
    criterion = MaskedBCEWithDiceLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    os.makedirs('backend/models', exist_ok=True)
    best_checkpoint_path = os.path.join('backend', 'models', 'unet_resnet34.pth')

    best_val_dice = 0.0
    history = []
    epochs_to_run = 1 if args.smoke_test else args.epochs

    for epoch in range(1, epochs_to_run + 1):
        start_t = time.time()
        model.train()
        train_loss = 0.0

        for imgs, lbls, _, _ in train_loader:
            imgs = imgs.to(device)
            lbls = lbls.to(device)

            optimizer.zero_grad()
            logits = model(imgs)
            loss = criterion(logits, lbls)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()

        train_loss /= len(train_loader)
        scheduler.step()

        # Validation evaluation strictly on valid split
        val_metrics = evaluate_dataset(model, valid_loader, device)
        elapsed = time.time() - start_t

        print(f"Epoch [{epoch:2d}/{epochs_to_run:2d}] ({elapsed:.1f}s) | Train Loss: {train_loss:.4f} | Val Dice: {val_metrics['dice']*100:.2f}% | Val IoU: {val_metrics['iou']*100:.2f}% | Val Prec: {val_metrics['precision']*100:.2f}% | Val Rec: {val_metrics['recall']*100:.2f}%")

        history.append({
            'epoch': epoch,
            'train_loss': train_loss,
            'val_metrics': val_metrics,
            'elapsed_sec': elapsed
        })

        if val_metrics['dice'] > best_val_dice and not args.smoke_test:
            best_val_dice = val_metrics['dice']
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'val_metrics': val_metrics,
                'optimizer_state_dict': optimizer.state_dict()
            }, best_checkpoint_path)
            print(f"  --> Saved new best checkpoint to {best_checkpoint_path} (Val Dice: {best_val_dice*100:.2f}%)")

    # If smoke test, report completion and exit cleanly
    if args.smoke_test:
        print("\n[SMOKE TEST PASSED] Pipeline executed 1 full epoch with 0 errors. Forward pass, loss computation, backward pass, and validation metrics verified.")
        return

    # Post-training Final Benchmark Evaluation (held out until after model selection)
    print("\n==================================================================")
    print(" FINAL BENCHMARK EVALUATION ON HELD-OUT SPLITS")
    print("==================================================================")

    # Load best checkpoint
    print(f"Loading best checkpoint from {best_checkpoint_path}...")
    checkpoint = torch.load(best_checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint['model_state_dict'])

    # 1. Official Test Set Evaluation (20 pairs across 7 events)
    test_metrics = evaluate_dataset(model, test_loader, device)
    otsu_test_metrics = evaluate_otsu(test_rows, s1_dir, lbl_dir)

    print("\n--- 1. OFFICIAL TEST SET (20 Pairs) ---")
    print(f"U-Net + ResNet34 : IoU: {test_metrics['iou']*100:.2f}% | Dice: {test_metrics['dice']*100:.2f}% | Precision: {test_metrics['precision']*100:.2f}% | Recall: {test_metrics['recall']*100:.2f}%")
    print(f"Otsu Baseline    : IoU: {otsu_test_metrics['iou']*100:.2f}% | Dice: {otsu_test_metrics['dice']*100:.2f}% | Precision: {otsu_test_metrics['precision']*100:.2f}% | Recall: {otsu_test_metrics['recall']*100:.2f}%")

    # 2. Bolivia Held-Out Geographic Generalization Set (12 pairs)
    bolivia_metrics = evaluate_dataset(model, bolivia_loader, device)
    otsu_bolivia_metrics = evaluate_otsu(bolivia_rows, s1_dir, lbl_dir)

    print("\n--- 2. BOLIVIA UNSEEN GEOGRAPHIC GENERALIZATION (12 Pairs) ---")
    print(f"U-Net + ResNet34 : IoU: {bolivia_metrics['iou']*100:.2f}% | Dice: {bolivia_metrics['dice']*100:.2f}% | Precision: {bolivia_metrics['precision']*100:.2f}% | Recall: {bolivia_metrics['recall']*100:.2f}%")
    print(f"Otsu Baseline    : IoU: {otsu_bolivia_metrics['iou']*100:.2f}% | Dice: {otsu_bolivia_metrics['dice']*100:.2f}% | Precision: {otsu_bolivia_metrics['precision']*100:.2f}% | Recall: {otsu_bolivia_metrics['recall']*100:.2f}%")

    # Save final report to JSON
    final_report = {
        'training_epochs': args.epochs,
        'best_epoch': checkpoint['epoch'],
        'best_val_metrics': checkpoint['val_metrics'],
        'official_test_metrics': {
            'unet': test_metrics,
            'otsu': otsu_test_metrics
        },
        'bolivia_held_out_metrics': {
            'unet': bolivia_metrics,
            'otsu': otsu_bolivia_metrics
        },
        'history': history
    }

    report_path = os.path.join('data', 'evaluation_report.json')
    import json
    with open(report_path, 'w') as f:
        json.dump(final_report, f, indent=2)
    print(f"\nFinal report saved to {report_path}")

if __name__ == '__main__':
    main()
