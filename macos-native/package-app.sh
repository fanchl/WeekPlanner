#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
EXECUTABLE_NAME="WeekPlanner"
APP_NAME="${EXECUTABLE_NAME}.app"
APP_DIR="$SCRIPT_DIR/dist/$APP_NAME"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
FRAMEWORKS_DIR="$CONTENTS_DIR/Frameworks"
SWIFT_BUILD_DIR="/tmp/codex-swiftpm-release"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export HOME="${HOME:-/tmp/codex-home}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/codex-cache}"
export CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-/tmp/codex-clang-cache}"

mkdir -p "$HOME" "$XDG_CACHE_HOME" "$CLANG_MODULE_CACHE_PATH"

ICON_WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/weekplanner-icon.XXXXXX")
ICON_SOURCE_PNG="$ICON_WORK_DIR/AppIcon-1024.png"
ICONSET_DIR="$ICON_WORK_DIR/AppIcon.iconset"
ICON_ICNS_PATH="$ICON_WORK_DIR/AppIcon.icns"

cleanup() {
  rm -rf "$ICON_WORK_DIR"
}

trap cleanup EXIT

cd "$REPO_ROOT"
npm run build

cd "$SCRIPT_DIR"
swift build -c release --scratch-path "$SWIFT_BUILD_DIR"

BINARY_PATH=$(find "$SWIFT_BUILD_DIR" -maxdepth 4 -type f -name "$EXECUTABLE_NAME" | head -n 1)
if [[ -z "${BINARY_PATH:-}" ]]; then
  echo "Failed to locate $EXECUTABLE_NAME release binary in $SWIFT_BUILD_DIR" >&2
  exit 1
fi

swift "$SCRIPT_DIR/scripts/generate_app_icon.swift" "$ICON_SOURCE_PNG"
mkdir -p "$ICONSET_DIR"
sips -z 16 16 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$ICON_SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$ICON_SOURCE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"
iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS_PATH"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$FRAMEWORKS_DIR"

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
printf "APPL????" > "$CONTENTS_DIR/PkgInfo"
cp "$BINARY_PATH" "$MACOS_DIR/$EXECUTABLE_NAME"
chmod +x "$MACOS_DIR/$EXECUTABLE_NAME"
cp -R "$REPO_ROOT/build" "$RESOURCES_DIR/build"
cp "$ICON_ICNS_PATH" "$RESOURCES_DIR/AppIcon.icns"

xcrun swift-stdlib-tool \
  --copy \
  --platform macosx \
  --scan-executable "$MACOS_DIR/$EXECUTABLE_NAME" \
  --destination "$FRAMEWORKS_DIR"

echo "Packaged app: $APP_DIR"
