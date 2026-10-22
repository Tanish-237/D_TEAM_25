#!/usr/bin/env bash
# Downloads pretrained weights into models/ (gitignored).
# InsightFace weights are licensed for non-commercial research only.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p models/insightface models/opencv

INSIGHTFACE=https://github.com/deepinsight/insightface/releases/download/model-zoo
OPENCV_ZOO=https://github.com/opencv/opencv_zoo/raw/main/models

for pack in buffalo_l buffalo_s; do
  if [ ! -d "models/insightface/$pack" ]; then
    curl -fL --progress-bar -o "models/insightface/$pack.zip" "$INSIGHTFACE/$pack.zip"
    unzip -q -o "models/insightface/$pack.zip" -d "models/insightface/$pack"
    rm "models/insightface/$pack.zip"
  fi
done

fetch() {
  [ -f "models/opencv/$2" ] || curl -fL --progress-bar -o "models/opencv/$2" "$OPENCV_ZOO/$1/$2"
}
fetch face_detection_yunet face_detection_yunet_2023mar.onnx
fetch face_recognition_sface face_recognition_sface_2021dec.onnx

echo "Models ready in models/"
