# Example: Login and Form Automation

This walkthrough demonstrates an end-to-end agent interaction session: launching an application, analyzing the UI snapshot, filling authentication inputs, submitting, and verifying success with an annotated screenshot.

---

## Scenario: Authenticating into a Tauri Dashboard

### Step 1: Launch the Tauri Application
```bash
npx agent-tauri launch ./src-tauri/target/release/dashboard-app.exe
```

Output:
```text
Launching Tauri application: ./src-tauri/target/release/dashboard-app.exe (CDP port 9222)...
Application started (PID: 14092).
Agent daemon active on port 51234. Attached to CDP port 9222.
```

---

### Step 2: Inspect the Initial UI
```bash
npx agent-tauri snapshot -i
```

Output:
```text
Window: "Enterprise Dashboard - Sign In" (tauri://localhost/)
------------------------------------------------------------
  - [@e1] [h1] "Welcome Back"
  - [@e2] [input] placeholder="user@company.com" value=""
  - [@e3] [input] placeholder="Enter password" value=""
  - [@e4] [checkbox] "Remember this device" (checked=false)
  - [@e5] [button] "Sign In"
  - [@e6] [link] "Forgot password?"
```

---

### Step 3: Fill Credentials and Submit
```bash
# Enter username
npx agent-tauri fill @e2 "alice@example.com"

# Enter password
npx agent-tauri fill @e3 "S3cur3P@ssw0rd!"

# Check remember device
npx agent-tauri check @e4

# Click sign in button
npx agent-tauri click @e5
```

---

### Step 4: Verify Navigation and Capture Proof
```bash
# Wait for dashboard to load
npx agent-tauri wait 1000

# Take a new snapshot of dashboard
npx agent-tauri snapshot -i
```

Output:
```text
Window: "Enterprise Dashboard - Overview" (tauri://localhost/dashboard)
------------------------------------------------------------
  - [@e1] [h1] "System Health Overview"
  - [@e2] [button] "Refresh Metrics"
  - [@e3] [button] "Deploy Service"
  - [@e4] [button] "User Profile: Alice"
```

Capture an annotated screenshot for visual verification:
```bash
npx agent-tauri screenshot ./test-reports/login-success.png --annotate
```

Output:
```text
Screenshot saved to: C:\repos\my-project\test-reports\login-success.png (annotated with refs)
```

---

### Step 5: Clean Up
```bash
npx agent-tauri close
```
