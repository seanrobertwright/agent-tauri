# Cross-Platform Automation Guide

Tauri uses the operating system's native web engine instead of shipping a bundled browser. This guide explains how `agent-tauri` behaves across Windows, macOS, and Linux.

---

## 1. Operating System Webview Engines

OS         | Native Webview Engine | Underlying Tech  | Automation Interface
:--------- | :-------------------- | :--------------- | :-------------------
**Windows** | WebView2              | Chromium         | Direct CDP (`--remote-debugging-port`)
**macOS**   | WKWebView             | WebKit (Apple)   | WebDriver / `tauri-driver` / embedded WDIO
**Linux**   | WebKitGTK             | WebKit (GNOME)   | `WebKitWebDriver` / WebKit Inspector

---

## 2. Windows Environment

On Windows, `agent-tauri` offers zero-setup native CDP connectivity:
1. `agent-tauri launch <app.exe>` sets `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"`.
2. Chromium CDP opens on port 9222.
3. Full Playwright automation (snapshots, clicking, keyboard, mouse, visual screenshotting) functions out-of-the-box.

---

## 3. macOS & Linux Environments

### Option A: Development Server Preview
When building and testing Tauri applications during development (`npm run tauri dev` or `cargo tauri dev`), the frontend typically serves from `http://localhost:1420` (or `http://localhost:5173`).
Agents can run:
```bash
agent-tauri attach --port <port>
```

### Option B: Linux WebKit Remote Inspector
On Linux, WebKitGTK supports remote inspection by exporting:
```bash
export WEBKIT_INSPECTOR_SERVER="127.0.0.1:9222"
```
`agent-tauri` automatically includes this environment variable on startup.

### Option C: Official Tauri WebDriver (`tauri-driver`)
For packaged binary verification on macOS and Linux CI pipelines:
1. Install `tauri-driver`:
   ```bash
   cargo install tauri-driver
   ```
2. On Linux, ensure `webkit2gtk-driver` is installed:
   ```bash
   sudo apt-get install webkit2gtk-driver
   ```
3. Run `tauri-driver` or use WebdriverIO's `@wdio/tauri-service`.
