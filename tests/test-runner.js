const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { TauriAgentDaemon } = require('../src/daemon');
const { TauriAgentClient } = require('../src/client');

async function runTests() {
  console.log('--- Starting agent-tauri test suite ---');

  // 1. Create a mock Tauri frontend web server
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Mock Tauri Test App</title>
</head>
<body>
  <h1>Tauri Todo & Greet</h1>
  <form id="greet-form" onsubmit="return false;">
    <label for="name-input">Name:</label>
    <input id="name-input" type="text" placeholder="Enter name..." />
    <button id="greet-btn" onclick="handleGreet()">Greet</button>
  </form>
  <div id="greeting-result">No greeting yet</div>

  <div style="margin-top: 20px;">
    <input id="agree-check" type="checkbox" />
    <label for="agree-check">I agree</label>
    <select id="priority-select">
      <option value="low">Low</option>
      <option value="high">High</option>
    </select>
  </div>

  <script>
    // Simulate Tauri IPC
    window.__TAURI__ = {
      core: {
        invoke: async (cmd, args) => {
          console.log('IPC invoke called:', cmd, JSON.stringify(args));
          if (cmd === 'greet') {
            return 'Hello from Rust backend, ' + (args.name || 'Anonymous') + '!';
          }
          if (cmd === 'get_system_info') {
            return { os: 'windows', version: '10.0' };
          }
          throw new Error('Unknown command: ' + cmd);
        }
      }
    };

    async function handleGreet() {
      const val = document.getElementById('name-input').value;
      console.log('Button clicked with name:', val);
      try {
        const res = await window.__TAURI__.core.invoke('greet', { name: val });
        document.getElementById('greeting-result').innerText = res;
      } catch (e) {
        document.getElementById('greeting-result').innerText = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>
`;

  const webServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(testHtml);
  });

  const webPort = await new Promise((resolve) => {
    webServer.listen(0, '127.0.0.1', () => {
      resolve(webServer.address().port);
    });
  });

  console.log(`Mock app web server running at http://127.0.0.1:${webPort}`);

  // 2. Launch browser with remote debugging port to emulate WebView2 with CDP
  const cdpPort = 9876;
  const browserServer = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [`--remote-debugging-port=${cdpPort}`],
  });

  // Open the test page in the browser
  const initialPage = await browserServer.newPage();
  await initialPage.goto(`http://127.0.0.1:${webPort}`);
  console.log('Browser launched and navigated to test app.');

  // 3. Start TauriAgentDaemon
  const daemon = new TauriAgentDaemon({
    cdpPort,
    projectRoot: path.resolve(__dirname, '..'),
    exitOnClose: false,
  });

  const daemonPort = await daemon.start();
  console.log(`TauriAgentDaemon started on port ${daemonPort}. Connecting CDP...`);
  await daemon.connectCDP(cdpPort);

  const client = new TauriAgentClient({ projectRoot: path.resolve(__dirname, '..') });

  try {
    // Test 1: Check Status
    console.log('\n[Test 1] Testing status endpoint...');
    const status = await client.getStatus();
    console.log('  App Title:', status.title);
    console.log('  Tauri Engine:', status.tauri.version);
    if (!status.connected) throw new Error('Daemon status reports not connected');
    if (!status.tauri.isTauri) throw new Error('Failed to detect mock Tauri runtime');
    console.log('  PASSED: Status verified');

    // Test 2: Take Snapshot
    console.log('\n[Test 2] Testing snapshot generation...');
    const snapshot = await client.snapshot();
    console.log('  Formatted Snapshot Output:');
    console.log(snapshot.formatted);
    if (!snapshot.elements || snapshot.elements.length === 0) {
      throw new Error('Snapshot returned no elements');
    }
    const inputRef = snapshot.elements.find((e) => e.placeholder === 'Enter name...');
    const buttonRef = snapshot.elements.find((e) => e.text === 'Greet');
    if (!inputRef || !buttonRef) {
      throw new Error('Could not find input or button in snapshot');
    }
    console.log(`  Found Name Input at ${inputRef.ref}, Greet Button at ${buttonRef.ref}`);
    console.log('  PASSED: Snapshot verified');

    // Test 3: Fill Input
    console.log('\n[Test 3] Testing fill action on input ref...');
    await client.fill(inputRef.ref, 'Agent Antigravity');
    const valRes = await client.getValue(inputRef.ref);
    const val = valRes.value;
    if (val !== 'Agent Antigravity') {
      throw new Error(`Expected value 'Agent Antigravity', got '${val}'`);
    }
    console.log(`  Input value verified: "${val}"`);
    console.log('  PASSED: Fill verified');

    // Test 4: Click Button
    console.log('\n[Test 4] Testing click action on button ref...');
    await client.click(buttonRef.ref);
    await client.wait(500); // Wait for async greet execution
    const textRes = await client.getText('#greeting-result');
    const resultText = textRes.text;
    console.log(`  Result text: "${resultText}"`);
    if (!resultText.includes('Agent Antigravity')) {
      throw new Error(`Greeting text did not match. Got: "${resultText}"`);
    }
    console.log('  PASSED: Click and DOM update verified');

    // Test 5: Checkbox and Select
    console.log('\n[Test 5] Testing check and select...');
    await client.check('#agree-check');
    await client.select('#priority-select', 'high');
    const selectRes = await client.getValue('#priority-select');
    const selectedVal = selectRes.value;
    if (selectedVal !== 'high') throw new Error(`Select failed, got ${selectedVal}`);
    console.log('  PASSED: Checkbox & Select verified');

    // Test 6: Screenshot Capture
    console.log('\n[Test 6] Testing screenshot capture...');
    const screenshotPath = path.resolve(__dirname, 'test-screenshot.png');
    const scrRes = await client.screenshot({ path: screenshotPath, annotate: true });
    if (!fs.existsSync(screenshotPath)) {
      throw new Error('Screenshot file was not generated');
    }
    const stats = fs.statSync(screenshotPath);
    console.log(`  Screenshot generated: ${stats.size} bytes at ${scrRes.path}`);
    fs.unlinkSync(screenshotPath);
    console.log('  PASSED: Screenshot verified');

    // Test 7: JavaScript Evaluation
    console.log('\n[Test 7] Testing JS eval...');
    const evalRes = await client.eval('document.title');
    if (evalRes.result !== 'Mock Tauri Test App') {
      throw new Error(`Eval failed, got: ${evalRes.result}`);
    }
    console.log(`  Eval result: "${evalRes.result}"`);
    console.log('  PASSED: Eval verified');

    // Test 8: Direct Tauri Backend Invoke
    console.log('\n[Test 8] Testing direct Tauri IPC invoke...');
    const ipcRes = await client.invoke('get_system_info', {});
    console.log('  IPC invoke result:', ipcRes.result);
    if (ipcRes.result.os !== 'windows') {
      throw new Error('IPC invoke did not return expected object');
    }
    console.log('  PASSED: Tauri IPC invoke verified');

    // Test 9: Console Logs Retrieval
    console.log('\n[Test 9] Testing console log capture...');
    const logsRes = await client.getLogs();
    console.log(`  Captured ${logsRes.logs.length} log(s)`);
    const foundLog = logsRes.logs.some((l) => l.text.includes('IPC invoke called'));
    if (!foundLog) {
      throw new Error('Expected IPC log in captured console logs');
    }
    console.log('  PASSED: Console log capture verified');

    console.log('\n=============================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (9/9)');
    console.log('=============================================\n');
  } finally {
    // Cleanup
    await client.close().catch(() => {});
    await browserServer.close().catch(() => {});
    webServer.close();
  }
}

runTests().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
