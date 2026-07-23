#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="Audio Converter"
BUILD_DIR="build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
STAGING_DIR="$BUILD_DIR/dmg-staging"
DMG_PATH="$BUILD_DIR/$APP_NAME.dmg"

if [ ! -d "$APP_BUNDLE" ]; then
    echo "No built app found at $APP_BUNDLE, run build-app.sh first." >&2
    exit 1
fi

echo "Staging DMG contents..."
rm -rf "$STAGING_DIR" "$DMG_PATH"
mkdir -p "$STAGING_DIR"
cp -R "$APP_BUNDLE" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

echo "Building disk image..."
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH"

rm -rf "$STAGING_DIR"
echo "Built: $DMG_PATH"
