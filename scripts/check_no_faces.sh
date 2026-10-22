#!/usr/bin/env bash
# Fails if any image outside docs/assets/ is tracked by git.
set -euo pipefail

tracked=$(git ls-files | grep -iE '\.(jpe?g|png|heic|webp|bmp|tiff?)$' | grep -v '^docs/assets/' || true)
if [ -n "$tracked" ]; then
  echo "Images must not be committed outside docs/assets/:"
  echo "$tracked"
  exit 1
fi
