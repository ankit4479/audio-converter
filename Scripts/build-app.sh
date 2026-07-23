#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="Audio Converter"
BUILD_DIR="build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"

echo "Building release binary..."
swift build -c release

echo "Assembling app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp .build/release/AudioConverter "$APP_BUNDLE/Contents/MacOS/AudioConverter"
cp Scripts/Info.plist "$APP_BUNDLE/Contents/Info.plist"
cp build/AppIcon.icns "$APP_BUNDLE/Contents/Resources/AppIcon.icns"

echo "Code signing (ad-hoc, for local use only)..."
codesign --force --deep --sign - "$APP_BUNDLE"

echo "Built: $APP_BUNDLE"
