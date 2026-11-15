# Trained Model Checkpoints Directory
This directory stores deep learning model weights.
- `unet_resnet34.pth` (294 MB): Best checkpoint (Epoch 18, 52.12% Validation Dice) trained with 2-channel ResNet34 encoder and masked BCE + Dice loss.
Run `python train.py` from repository root to retrain the model.
