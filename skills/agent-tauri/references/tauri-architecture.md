# Tauri Architecture & IPC Internals

Understanding how Tauri structures its frontend, backend, and webview rendering pipeline is key to effective automation and debugging.

---

## 1. Tauri Process Architecture

Unlike Electron (which bundles a full Chromium browser and Node.js runtime into every distributed app), Tauri separates the application into two distinct layers:

```
┌────────────────────────────────────────────────────────┐
│                   Desktop OS Window                    │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │           Native Webview Frontend              │   │
│   │  (Windows: WebView2 / macOS: WKWebView /       │   │
│   │   Linux: WebKitGTK)                            │   │
│   │                                                │   │
│   │  - HTML, CSS, JavaScript / WASM                │   │
│   │  - window.__TAURI__ IPC interface              │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │ IPC (postMessage / JSON)   │
│   ┌───────────────────────▼────────────────────────┐   │
│   │               Rust Core Backend                │   │
│   │                                                │   │
│   │  - Tauri Runtime (Windowing, Menus, Trays)     │   │
│   │  - Command Handlers: #[tauri::command]         │   │
│   │  - Native File System, SQLite, OS APIs         │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Remote Debugging & CDP Attachment

### Windows (WebView2)
On Windows, Tauri utilizes Microsoft Edge WebView2, which is powered by Chromium. Chromium exposes the Chrome DevTools Protocol (CDP) when launched with the argument:
```
--remote-debugging-port=<port>
```
WebView2 reads the environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. When set to:
```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
```
the WebView2 instance spins up an HTTP CDP server on `http://127.0.0.1:9222`. `agent-tauri` connects over CDP to control the webview with Playwright speed and reliability.

### Tauri v1 vs Tauri v2 IPC Differences

In **Tauri v1**:
- The global IPC function is available under `window.__TAURI__.invoke(cmd, payload)`.

In **Tauri v2**:
- The IPC architecture was modularized. The core invoke function is accessed via:
  ```javascript
  // Tauri v2 standard
  window.__TAURI__.core.invoke(cmd, payload);
  // or via internal binding:
  window.__TAURI_INTERNALS__.invoke(cmd, payload);
  ```

`agent-tauri` automatically detects and abstracts both versions transparently via `agent-tauri invoke <cmd> [args]`.

---

## 3. Why Token-Efficient Snapshots Matter for AI Agents

Traditional browser automation tools for agents often dump raw HTML. In desktop web applications (React, Angular, Svelte, Tailwind), a single page can easily produce 20,000+ lines of DOM, consuming 40,000+ tokens and causing context overflow.

`agent-tauri` solves this through **Ref-Based Accessibility Snapshots**:
1. It traverses visible elements in the DOM.
2. It filters out invisible or irrelevant wrapper divs.
3. It assigns short alphanumeric references (`@e1`, `@e2`, ...).
4. The agent can perceive the entire interactive interface in ~200 tokens and make decisions with 100% selector accuracy.
