# Agent-Tauri CLI Reference

This document provides complete syntax, parameters, flags, and return formats for every `agent-tauri` command.

---

## 1. Lifecycle Commands

### `agent-tauri launch <app>`
Launches a Tauri executable or development command with WebView2/WebKit remote debugging arguments injected. Starts the background daemon and attaches automatically.

* **Arguments:**
  * `<app>`: Path to compiled executable (e.g. `./src-tauri/target/release/app.exe`) or shell command (e.g. `"cargo tauri dev"` or `"npm run tauri dev"`).
* **Options:**
  * `-p, --port <number>`: Remote debugging CDP port (default: `9222`).
  * `-t, --timeout <ms>`: Timeout in ms waiting for CDP port to open (default: `30000`).
  * `-a, --args <args...>`: Extra CLI arguments passed directly to the Tauri executable.

### `agent-tauri attach`
Attaches the background daemon to an existing Tauri application already running with `--remote-debugging-port`.

* **Options:**
  * `-p, --port <number>`: Port number to attach to (default: `9222`).

### `agent-tauri status`
Displays the connection status, daemon PID, active window title, current URL, and detected Tauri runtime engine (v1 vs v2).

### `agent-tauri close`
Disconnects from the app, cleans up session files, terminates any app process spawned by `launch`, and stops the background daemon.

---

## 2. Snapshot & Inspection

### `agent-tauri snapshot`
Scans the current active webview DOM and returns a ref-annotated tree.

* **Options:**
  * `-i, --interactive`: Filters out non-interactive semantic containers (drastically saves context window tokens).
  * `--json`: Outputs raw JSON array of elements with bounding boxes and metadata.

### `agent-tauri get <text|attr|value> <target>`
Retrieves property values from an element.

* `agent-tauri get text <target>`: Returns element's visible text.
* `agent-tauri get attr <target> <attribute>`: Returns attribute value (e.g., `placeholder`, `href`, `data-id`).
* `agent-tauri get value <target>`: Returns current input or textarea value.

---

## 3. Element Interaction

Every interaction command accepts either a ref marker (`@e1`, `@e2`, ...) or a standard CSS selector (`#login-btn`, `button.primary`).

### `agent-tauri click <target>`
Performs a mouse click on the targeted element.
* **Options:**
  * `-b, --button <left|right|middle>`: Mouse button (default: `left`).

### `agent-tauri dblclick <target>`
Performs a double-click on the targeted element.

### `agent-tauri fill <target> <text>`
Focuses the element, clears any existing text, and fills the new string.

### `agent-tauri type <target> <text>`
Types text keystroke-by-keystroke into the element without clearing first.

### `agent-tauri press <key>`
Dispatches a keyboard event.
* **Keys supported:** `Enter`, `Tab`, `Escape`, `Backspace`, `ArrowUp`, `ArrowDown`, `Control+a`, `Meta+c`, etc.
* **Options:**
  * `-t, --target <target>`: Target element to focus prior to keypress.

### `agent-tauri hover <target>`
Hovers mouse pointer over the specified element.

### `agent-tauri focus <target>`
Directs focus to the element.

### `agent-tauri check <target>` / `uncheck <target>`
Toggles checkboxes or radio inputs.

### `agent-tauri select <target> <value>`
Selects an option from a `<select>` dropdown by value or visible label.

### `agent-tauri scroll [direction] [pixels]`
Scrolls the active window or element.
* **Arguments:**
  * `direction`: `up`, `down`, `left`, `right` (default: `down`).
  * `pixels`: Number of pixels to scroll (default: `300`).
* **Options:**
  * `-t, --target <target>`: Target scrollable container.

---

## 4. Visual Capture & Screenshots

### `agent-tauri screenshot [path]`
Captures an image of the application window and saves it to disk.

* **Arguments:**
  * `[path]`: Filepath for the screenshot (default: `./screenshot-<timestamp>.png`).
* **Options:**
  * `-f, --full`: Captures full scrollable document.
  * `-a, --annotate`: Injects visual red bounding boxes and `@eX` labels over all interactive elements before capturing. Ideal for multimodal agent visual verification.
  * `-t, --target <target>`: Captures an image of only the selected element.

---

## 5. Tauri IPC & JavaScript Execution

### `agent-tauri invoke <command> [jsonArgs]`
Directly executes a Tauri backend command via the IPC bridge without needing UI elements.
* **Arguments:**
  * `<command>`: Rust command registered in `tauri::generate_handler![...]`.
  * `[jsonArgs]`: JSON string representing the command payload.
* **Example:**
  ```bash
  agent-tauri invoke perform_calculation '{"x": 10, "y": 25}'
  ```

### `agent-tauri eval <script>`
Executes arbitrary JavaScript within the webview global context.
* **Example:**
  ```bash
  agent-tauri eval "localStorage.getItem('auth_token')"
  ```

---

## 6. Logs & Multi-Window Management

### `agent-tauri console` (alias: `logs`)
Prints captured console logs (`console.log`, `console.warn`, `console.error`) and unhandled page errors.
* **Options:**
  * `-c, --clear`: Clears the log buffer after printing.

### `agent-tauri windows`
Lists all active Tauri webview windows.

### `agent-tauri switch-window <index>`
Switches the active automation context to the specified window index.
