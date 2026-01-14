#!/bin/bash
set -euo pipefail
clear

REPO="thelastligma/SolaraM"
TAG="Releases"

echo "🚀 Solara Installer"
echo "===================="

ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64)
    ARCH_KEY="arm64"
    echo "Detected: Apple Silicon ($ARCH)"
    ;;
  x86_64|amd64)
    ARCH_KEY="x86_64"
    echo "Detected: Intel ($ARCH)"
    ;;
  *)
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac


if [ "$ARCH_KEY" = "arm64" ]; then
  ASSET_NAME="Solara-arm64.zip"
else
  ASSET_NAME="Solara-x86_64.zip"
fi

DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/$ASSET_NAME"

echo "🔗 Downloading: $DOWNLOAD_URL"

TMP_DMG="/tmp/$ASSET_NAME"

curl -fL "$DOWNLOAD_URL" -o "$TMP_DMG" || {
  echo "❌ Download failed."
  echo "Make sure this file exists:"
  echo "  $ASSET_NAME"
  exit 1
}

echo "📂 Mounting DMG..."
MOUNT_POINT=$(mktemp -d)
hdiutil attach "$TMP_DMG" -mountpoint "$MOUNT_POINT" -nobrowse

APP_SRC="$MOUNT_POINT/Solara.app"
[ ! -d "$APP_SRC" ] && { echo "❌ Solara.app not found in DMG"; hdiutil detach "$MOUNT_POINT"; exit 1; }

if [ -d "/Applications/Solara.app" ]; then
  echo "♻️ Removing existing installation..."
  rm -rf /Applications/Solara.app
fi

echo "💾 Installing..."
if [ -w /Applications ]; then
  cp -R "$APP_SRC" /Applications/Solara.app
else
  sudo cp -R "$APP_SRC" /Applications/Solara.app
fi

echo "🛡️ Removing quarantine flags..."
xattr -rd com.apple.quarantine /Applications/Solara.app 2>/dev/null || true

echo "🔌 Unmounting DMG..."
hdiutil detach "$MOUNT_POINT"
rm -f "$TMP_DMG"
rmdir "$MOUNT_POINT" 2>/dev/null || true

echo ""
echo "✅ Solara installed successfully!"
open -a /Applications/Solara.app
