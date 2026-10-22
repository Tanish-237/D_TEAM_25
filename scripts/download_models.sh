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
  local path="models/opencv/$2"
  [ -f "$path" ] || curl -fL --retry 3 --progress-bar -o "$path" "$OPENCV_ZOO/$1/$2"
  if ! echo "$3  $path" | shasum -a 256 -c --status; then
    rm -f "$path"
    echo "Checksum mismatch for $2 (incomplete download?). Run the script again." >&2
    exit 1
  fi
}
fetch face_detection_yunet face_detection_yunet_2023mar.onnx \
  8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
fetch face_recognition_sface face_recognition_sface_2021dec.onnx \
  0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79

echo "Models ready in models/"
