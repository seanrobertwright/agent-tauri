const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { writeSession, readSession } = require('./session');

/**
 * Polls the CDP HTTP endpoint until it responds with 200 OK or timeout expires.
 */
async function waitForCDP(port, timeoutMs = 30000) {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/json/version`;

  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (ok) return true;
    } catch (e) {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Timed out waiting for Tauri application CDP port ${port} after ${timeoutMs}ms.`);
}

/**
 * Ensures the background daemon is running. If not, spawns it.
 */
async function ensureDaemon(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const cdpPort = options.cdpPort || 9222;

  let session = readSession(projectRoot);
  if (session && session.daemonPort) {
    // Check if daemon is actually alive
    try {
      const isAlive = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${session.daemonPort}/session/status`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1500, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (isAlive) {
        return session;
      }
    } catch (e) {
      // not alive, spawn new one
    }
  }

  // Spawn background daemon process
  const daemonScript = path.resolve(__dirname, 'daemon.js');
  const daemonArgs = [
    daemonScript,
    '--cdp-port', String(cdpPort),
    '--project-root', projectRoot,
  ];

  if (options.appPid) {
    daemonArgs.push('--app-pid', String(options.appPid));
  }

  const daemonProcess = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
    cwd: projectRoot,
    windowsHide: true,
  });

  daemonProcess.unref();

  // Wait for daemon to write session.json
  const start = Date.now();
  while (Date.now() - start < 10000) {
    await new Promise((r) => setTimeout(r, 200));
    session = readSession(projectRoot);
    if (session && session.daemonPort) {
      // Verify daemon HTTP is responsive
      try {
        const isReady = await new Promise((resolve) => {
          const req = http.get(`http://127.0.0.1:${session.daemonPort}/session/status`, (res) => {
            resolve(res.statusCode === 200);
          });
          req.on('error', () => resolve(false));
        });
        if (isReady) return session;
      } catch (e) {
        // wait
      }
    }
  }

  throw new Error('Failed to start background agent-tauri daemon.');
}

/**
 * Launches a Tauri binary or command with WebView2 remote debugging flags injected.
 */
async function launchTauriApp(targetCommand, options = {}) {
  const cdpPort = options.cdpPort || 9222;
  const projectRoot = options.projectRoot || process.cwd();
  const extraArgs = options.args || [];

  const env = {
    ...process.env,
    // Key injection for Windows WebView2:
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    // Linux WebKitGTK / WebKit remote inspector support:
    WEBKIT_INSPECTOR_SERVER: `127.0.0.1:${cdpPort}`,
  };

  let appProcess;
  if (targetCommand.includes(' ') && !targetCommand.endsWith('.exe')) {
    // Shell command like "cargo tauri dev" or "npm run tauri dev"
    appProcess = spawn(targetCommand, extraArgs, {
      shell: true,
      env,
      cwd: projectRoot,
      stdio: 'pipe',
    });
  } else {
    // Executable binary path
    const exePath = path.isAbsolute(targetCommand)
      ? targetCommand
      : path.resolve(projectRoot, targetCommand);

    appProcess = spawn(exePath, extraArgs, {
      env,
      cwd: projectRoot,
      stdio: 'pipe',
      detached: true,
    });
    appProcess.unref();
  }

  // Wait for CDP port to come up
  await waitForCDP(cdpPort, options.timeout || 30000);

  // Start daemon and connect
  const session = await ensureDaemon({
    projectRoot,
    cdpPort,
    appPid: appProcess.pid,
  });

  return {
    appPid: appProcess.pid,
    cdpPort,
    daemonPort: session.daemonPort,
  };
}

module.exports = {
  waitForCDP,
  ensureDaemon,
  launchTauriApp,
};
