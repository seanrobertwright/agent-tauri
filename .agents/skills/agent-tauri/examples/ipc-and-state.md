# Example: Testing Backend IPC & State

Tauri apps frequently execute business logic inside native Rust backend commands registered with `#[tauri::command]`. With `agent-tauri`, agents can test Rust commands directly and verify how state changes propagate to the frontend.

---

## Scenario: Testing a Rust Data Fetch Command

Suppose our Tauri app has a Rust backend command registered in `main.rs`:

```rust
#[tauri::command]
fn get_disk_usage(path: String) -> Result<DiskStats, String> {
    // computes disk usage
    Ok(DiskStats { total_gb: 512, free_gb: 210 })
}
```

---

### Step 1: Connect to the Running Tauri App
```bash
npx agent-tauri attach --port 9222
```

---

### Step 2: Invoke the Command Directly via Agent-Tauri
```bash
npx agent-tauri invoke get_disk_usage '{"path": "C:\\"}'
```

Output:
```text
Invoke 'get_disk_usage' response:
{
  "total_gb": 512,
  "free_gb": 210
}
```

---

### Step 3: Verify the UI Reflects This State
Now trigger the corresponding UI button in the webview:
```bash
# Snapshot interactive elements
npx agent-tauri snapshot -i

# Click the 'Scan Disk' button
npx agent-tauri click @e3

# Wait for UI to update
npx agent-tauri wait 500

# Verify disk label text
npx agent-tauri get text @e4
```

Output:
```text
Free Space: 210 GB / 512 GB
```

---

### Step 4: Check Console Logs for Errors
```bash
npx agent-tauri console
```

Output:
```text
[2026-10-26T13:50:11.234Z] [INFO] Scan initiated for drive C:\
[2026-10-26T13:50:11.450Z] [INFO] Scan completed successfully.
```
