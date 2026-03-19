#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../../../.." && pwd)"
HELPER_SRC="$ROOT_DIR/apps/desktop/src/audio/native/ScopeAudioCapture.swift"
OUT_DIR="$ROOT_DIR/apps/desktop/src/audio/native/build"
OUT_BIN="$OUT_DIR/ScopeAudioCapture"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping native audio helper build on non-macOS host."
  exit 0
fi

mkdir -p "$OUT_DIR"

xcrun swiftc \
  -O \
  -parse-as-library \
  -framework Foundation \
  -framework AVFoundation \
  -framework CoreMedia \
  -framework ScreenCaptureKit \
  "$HELPER_SRC" \
  -o "$OUT_BIN"

chmod +x "$OUT_BIN"
echo "Built $OUT_BIN"
