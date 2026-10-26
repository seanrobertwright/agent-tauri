# agent-tauri

> **Desktop Automation and AI Agent Skill for Tauri Applications (v1 & v2)**  
> *The `agent-browser` / Playwright equivalent for Tauri desktop applications.*

`agent-tauri` allows AI agents (such as **Claude Code**, **Google Antigravity**, Cursor, Copilot CLI, Cline) and automated test suites to control, inspect, and test desktop Tauri applications with token efficiency and precision.

---

## Key Features

- 🧠 **Token-Efficient Accessibility Snapshot Tree**: Converts complex UI DOM into compact, indented element trees with reference tags (`@e1`, `@e2`, ...). Saves thousands of context tokens compared to processing raw HTML.
- 🎯 **Ref-Based Element Interactions**: Click, double-click, fill inputs, type keystrokes, press keys, check boxes, select dropdowns, hover, and scroll using direct `@ref` targets.
- 📸 **Visual Screenshots & Annotation Badges**: Capture standard screenshots, full scrollable page captures, or annotated screenshots with overlaid red bounding boxes and `@ref` badges.
- ⚡ **Direct Tauri IPC Invocation**: Directly trigger Tauri backend Rust commands (`invoke <cmd> [args]`) without going through the UI. Works transparently with both Tauri v1 and Tauri v2.
- 📜 **Console & Error Stream Forwarding**: Streams frontend console messages (`log`, `warn`, `error`) and page errors back to the agent.
- 🪟 **Multi-Window Support**: List open Tauri webview windows and switch the automation target dynamically.
- 🔄 **Persistent Daemon Architecture**: Runs a lightweight background daemon so that state, page connections, and ref maps persist across individual agent shell invocations.

---

## Installation & Setup

In your project repository or globally:

```bash
# Install dependencies
npm install

# Optional: link globally so `agent-tauri` is in your PATH
npm link
```

---

## Quickstart

### 1. Launch or Attach
```bash
# Launch a compiled binary
agent-tauri launch ./src-tauri/target/release/my-app.exe

# Or attach to an already running app with remote debugging enabled
agent-tauri attach --port 9222
```

### 2. Take a Snapshot
```bash
# Compact snapshot of interactive elements (Recommended for AI agents)
agent-tauri snapshot -i
```

Output:
```text
Window: "My Tauri App" (http://tauri.localhost/)
------------------------------------------------------------
  - [@e1] [h1] "Tauri Todo & Greet"
  - [@e2] [label] "Name:"
  - [@e3] [input] placeholder="Enter name..." value=""
  - [@e4] [button] "Greet"
  - [@e5] [div] "No greeting yet"
  - [@e6] [checkbox] "I agree" (checked=false)
  - [@e7] [select] "Low High" (value="low")
```

### 3. Interact via Refs
```bash
# Fill input field
agent-tauri fill @e3 "Alice"

# Click button
agent-tauri click @e4

# Check checkbox
agent-tauri check @e6

# Take an annotated screenshot
agent-tauri screenshot ./evidence.png --annotate

# Invoke a Rust backend command directly
agent-tauri invoke greet '{"name": "Alice"}'
```

### 4. Close Session
```bash
agent-tauri close
```

---

## Agent Skill Locations

This repository provides ready-to-use Agent Skills compatible with:
- **Google Antigravity**: Discovered automatically in [`.agents/skills/agent-tauri/`](./.agents/skills/agent-tauri/SKILL.md) or global `~/.gemini/config/skills/`.
- **Claude Code**: Discovered automatically in `skills/agent-tauri/` or `~/.claude/skills/`.

### Skill Directory Layout:
```text
skills/agent-tauri/
├── SKILL.md                          # Main skill instructions with YAML frontmatter
├── references/
│   ├── cli-reference.md              # Full CLI syntax, flags, and options
│   ├── tauri-architecture.md         # Tauri IPC internals, WebView2 CDP, and token optimization
│   └── cross-platform.md             # Windows (WebView2), macOS (WKWebView), Linux (WebKitGTK)
├── examples/
│   ├── login-and-form.md             # Walkthrough: Form fill and authentication
│   └── ipc-and-state.md              # Walkthrough: Testing backend Rust commands & state
└── scripts/
    ├── agent-tauri.ps1               # PowerShell wrapper
    └── agent-tauri.sh                # Bash wrapper
```

---

## Running Automated Tests

Run the comprehensive 9-point integration test suite:

```bash
npm test
```

Tests verify:
1. Status endpoint & Tauri v1/v2 engine detection.
2. Snapshot generation & ref assignment.
3. Form input filling.
4. Button clicking & DOM reactive updates.
5. Checkboxes and `<select>` dropdowns.
6. Full & annotated screenshot creation.
7. JavaScript expression evaluation in the webview.
8. Direct Tauri IPC backend invocation.
9. Console log capture & buffer rotation.

---

## License

MIT
