const http = require('http');
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testCli() {
  console.log('--- Testing agent-tauri CLI via child process execution ---');

  const cdpPort = 9888;
  const webServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><head><title>CLI Test Page</title></head><body><button id="cli-btn" onclick="document.body.dataset.clicked=\'true\'">Click Me</button></body></html>');
  });

  const webPort = await new Promise((resolve) => {
    webServer.listen(0, '127.0.0.1', () => resolve(webServer.address().port));
  });

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [`--remote-debugging-port=${cdpPort}`],
  });

  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${webPort}`);

  const cliBin = path.resolve(__dirname, '../bin/agent-tauri.js');
  const run = (cmd) => {
    return execSync(`node "${cliBin}" ${cmd}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf-8' });
  };

  try {
    // 1. Attach CLI
    console.log('[CLI 1] Attaching via CLI...');
    const attachOut = run(`attach -p ${cdpPort}`);
    console.log(attachOut.trim());

    // 2. Status CLI
    console.log('[CLI 2] Checking status via CLI...');
    const statusOut = run('status');
    console.log(statusOut.trim());

    // 3. Snapshot CLI
    console.log('[CLI 3] Taking snapshot via CLI...');
    const snapOut = run('snapshot');
    console.log(snapOut.trim());

    // 4. Click CLI
    console.log('[CLI 4] Clicking @e1 or button via CLI...');
    const clickOut = run('click @e1');
    console.log(clickOut.trim());

    // 5. Screenshot CLI
    console.log('[CLI 5] Capturing screenshot via CLI...');
    const screenFile = path.resolve(__dirname, 'cli-screenshot.png');
    const screenOut = run(`screenshot "${screenFile}"`);
    console.log(screenOut.trim());
    if (fs.existsSync(screenFile)) {
      fs.unlinkSync(screenFile);
      console.log('Verified screenshot file created and cleaned up.');
    }

    // 6. Close CLI
    console.log('[CLI 6] Closing session via CLI...');
    const closeOut = run('close');
    console.log(closeOut.trim());

    console.log('CLI tests passed cleanly!');
  } finally {
    await browser.close().catch(() => {});
    webServer.close();
  }
}

testCli().catch((err) => {
  console.error('CLI test failed:', err);
  process.exit(1);
});
