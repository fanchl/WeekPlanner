# WeekPlanner

Native macOS host for WeekPlanner that keeps the main planner and quick add in one app:

- Main window uses `WKWebView` to host the existing React build.
- Quick add uses a native `NSPanel`.
- File dialogs and quick-add events are bridged into the existing `window.desktopBridge` shape, so the current React app can keep working without an Electron runtime.

## Run

1. Build the React app:

```bash
npm run build
```

2. Launch the native shell:

```bash
cd macos-native
swift run
```

## Package App

Build the native release binary and bundle it into a macOS app:

```bash
cd macos-native
./package-app.sh
```

The packaged app is written to `macos-native/dist/WeekPlanner.app`.

## Notes

- The shell first looks for the web build in the app bundle at `Contents/Resources/build/index.html`.
- During local development it still falls back to `../build/index.html` relative to `macos-native/`.
- The global shortcut is `Command + Shift + Space`.
- Quick add panel position is remembered per screen in `UserDefaults`.
