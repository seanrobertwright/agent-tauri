const http = require('http');
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { collectElements, formatSnapshotText, injectAnnotations, removeAnnotations } = require('./snapshot-engine');
const { detectTauri, invokeTauriCommand, emitTauriEvent } = require('./tauri-bridge');
const { writeSession, removeSession } = require('./session');

class TauriAgentDaemon {
  constructor(options = {}) {
    this.port = options.port || 0; // 0 for dynamic port
    this.cdpPort = options.cdpPort || 9222;
    this.projectRoot = options.projectRoot || process.cwd();
    this.appPid = options.appPid || null;
    this.exitOnClose = options.exitOnClose !== false;
    this.browser = null;
    this.context = null;
    this.activePage = null;
    this.pages = [];
    this.refMap = new Map();
    this.consoleLogs = [];
    this.server = null;
    this.maxLogs = 200;
  }

  async start() {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    await new Promise((resolve) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });

    // Write initial session info
    writeSession({
      daemonPort: this.port,
      cdpPort: this.cdpPort,
      daemonPid: process.pid,
      appPid: this.appPid,
      startTime: new Date().toISOString(),
      projectRoot: this.projectRoot,
    }, this.projectRoot);

    return this.port;
  }

  async connectCDP(cdpPort) {
    if (cdpPort) this.cdpPort = cdpPort;
    const cdpUrl = `http://127.0.0.1:${this.cdpPort}`;

    try {
      this.browser = await chromium.connectOverCDP(cdpUrl);
      const contexts = this.browser.contexts();
      this.context = contexts[0] || (await this.browser.newContext());

      this.updatePages();
      this.browser.on('disconnected', () => {
        this.cleanup();
      });

      return { success: true, cdpUrl, pageCount: this.pages.length };
    } catch (err) {
      throw new Error(`Failed to connect to CDP at ${cdpUrl}: ${err.message}`);
    }
  }

  updatePages() {
    if (!this.context) return;
    this.pages = this.context.pages();
    if (!this.activePage && this.pages.length > 0) {
      this.setActivePage(this.pages[0]);
    }
  }

  setActivePage(page) {
    this.activePage = page;
    this.setupPageListeners(page);
  }

  setupPageListeners(page) {
    if (page._hasAgentListeners) return;
    page._hasAgentListeners = true;

    page.on('console', (msg) => {
      this.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        time: new Date().toISOString(),
      });
      if (this.consoleLogs.length > this.maxLogs) {
        this.consoleLogs.shift();
      }
    });

    page.on('pageerror', (err) => {
      this.consoleLogs.push({
        type: 'pageerror',
        text: err.message,
        stack: err.stack,
        time: new Date().toISOString(),
      });
    });
  }

  resolveSelector(target) {
    if (!target) throw new Error('Target selector or ref cannot be empty');
    if (target.startsWith('@')) {
      const refId = target.substring(1);
      return `[data-agent-ref="${refId}"]`;
    }
    return target;
  }

  async resolveLocator(target) {
    if (!this.activePage) throw new Error('No active Tauri page connected');
    const selector = this.resolveSelector(target);
    return this.activePage.locator(selector).first();
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS headers for local tooling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const sendJson = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const getBody = async () => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          if (!body) return resolve({});
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Invalid JSON body: ${e.message}`));
          }
        });
        req.on('error', reject);
      });
    };

    try {
      this.updatePages();

      // Routing
      if (pathname === '/session/status' && method === 'GET') {
        const title = this.activePage ? await this.activePage.title().catch(() => '') : '';
        const url = this.activePage ? this.activePage.url() : '';
        const tauriInfo = this.activePage ? await detectTauri(this.activePage).catch(() => null) : null;

        return sendJson(200, {
          connected: !!this.browser && !!this.activePage,
          daemonPid: process.pid,
          daemonPort: this.port,
          cdpPort: this.cdpPort,
          appPid: this.appPid,
          title,
          url,
          windowCount: this.pages.length,
          tauri: tauriInfo,
        });
      }

      if (pathname === '/session/attach' && method === 'POST') {
        const body = await getBody();
        const result = await this.connectCDP(body.cdpPort || this.cdpPort);
        return sendJson(200, result);
      }

      if (pathname === '/session/close' && method === 'POST') {
        sendJson(200, { message: 'Closing daemon and session' });
        setTimeout(() => this.cleanup(), 100);
        return;
      }

      if (pathname === '/snapshot' && method === 'GET') {
        if (!this.activePage) throw new Error('No active page');
        const interactive = parsedUrl.searchParams.get('interactive') === 'true';
        const snapshotData = await collectElements(this.activePage, { interactive });
        
        // Cache refs
        this.refMap.clear();
        for (const el of snapshotData.elements) {
          this.refMap.set(el.ref, el);
        }

        const formattedText = formatSnapshotText(snapshotData);
        return sendJson(200, {
          ...snapshotData,
          formatted: formattedText,
        });
      }

      if (pathname === '/action/click' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.click({
          button: body.button || 'left',
          modifiers: body.modifiers,
          timeout: body.timeout || 10000,
        });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/dblclick' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.dblclick({ timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/fill' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.fill(body.text || '', { timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target, filled: body.text });
      }

      if (pathname === '/action/type' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.type(body.text || '', { delay: body.delay || 30, timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target, typed: body.text });
      }

      if (pathname === '/action/press' && method === 'POST') {
        const body = await getBody();
        if (!this.activePage) throw new Error('No active page');
        if (body.target) {
          const locator = await this.resolveLocator(body.target);
          await locator.press(body.key, { timeout: body.timeout || 10000 });
        } else {
          await this.activePage.keyboard.press(body.key);
        }
        return sendJson(200, { success: true, key: body.key });
      }

      if (pathname === '/action/hover' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.hover({ timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/focus' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.focus({ timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/check' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.check({ timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/uncheck' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        await locator.uncheck({ timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target });
      }

      if (pathname === '/action/select' && method === 'POST') {
        const body = await getBody();
        const locator = await this.resolveLocator(body.target);
        const values = await locator.selectOption(body.value, { timeout: body.timeout || 10000 });
        return sendJson(200, { success: true, target: body.target, selected: values });
      }

      if (pathname === '/action/scroll' && method === 'POST') {
        const body = await getBody();
        const dir = body.direction || 'down';
        const px = body.pixels || 300;
        let deltaX = 0;
        let deltaY = 0;
        if (dir === 'up') deltaY = -px;
        else if (dir === 'down') deltaY = px;
        else if (dir === 'left') deltaX = -px;
        else if (dir === 'right') deltaX = px;

        if (body.target) {
          const locator = await this.resolveLocator(body.target);
          await locator.evaluate((el, { x, y }) => el.scrollBy(x, y), { x: deltaX, y: deltaY });
        } else {
          await this.activePage.mouse.wheel(deltaX, deltaY);
        }
        return sendJson(200, { success: true, direction: dir, pixels: px });
      }

      if (pathname === '/action/screenshot' && method === 'POST') {
        const body = await getBody();
        if (!this.activePage) throw new Error('No active page');

        const screenshotPath = body.path
          ? path.resolve(this.projectRoot, body.path)
          : path.resolve(this.projectRoot, `screenshot-${Date.now()}.png`);

        // Ensure target directory exists
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (body.annotate) {
          await collectElements(this.activePage, { interactive: true });
          await injectAnnotations(this.activePage);
        }

        try {
          if (body.target) {
            const locator = await this.resolveLocator(body.target);
            await locator.screenshot({ path: screenshotPath });
          } else {
            await this.activePage.screenshot({
              path: screenshotPath,
              fullPage: body.fullPage === true,
            });
          }
        } finally {
          if (body.annotate) {
            await removeAnnotations(this.activePage).catch(() => {});
          }
        }

        return sendJson(200, {
          success: true,
          path: screenshotPath,
          annotated: !!body.annotate,
        });
      }

      if (pathname === '/action/eval' && method === 'POST') {
        const body = await getBody();
        if (!this.activePage) throw new Error('No active page');
        const result = await this.activePage.evaluate(body.script);
        return sendJson(200, { success: true, result });
      }

      if (pathname === '/action/invoke' && method === 'POST') {
        const body = await getBody();
        if (!this.activePage) throw new Error('No active page');
        const result = await invokeTauriCommand(this.activePage, body.command, body.args || {});
        return sendJson(200, { success: true, command: body.command, result });
      }

      if (pathname === '/action/text' && method === 'GET') {
        const target = parsedUrl.searchParams.get('target');
        const locator = await this.resolveLocator(target);
        const text = await locator.innerText();
        return sendJson(200, { success: true, target, text });
      }

      if (pathname === '/action/attr' && method === 'GET') {
        const target = parsedUrl.searchParams.get('target');
        const attr = parsedUrl.searchParams.get('name');
        const locator = await this.resolveLocator(target);
        const value = await locator.getAttribute(attr);
        return sendJson(200, { success: true, target, attribute: attr, value });
      }

      if (pathname === '/action/value' && method === 'GET') {
        const target = parsedUrl.searchParams.get('target');
        const locator = await this.resolveLocator(target);
        const value = await locator.inputValue();
        return sendJson(200, { success: true, target, value });
      }

      if (pathname === '/action/wait' && method === 'POST') {
        const body = await getBody();
        if (!this.activePage) throw new Error('No active page');
        if (body.time) {
          await this.activePage.waitForTimeout(body.time);
        } else if (body.target) {
          const selector = this.resolveSelector(body.target);
          await this.activePage.waitForSelector(selector, {
            state: body.state || 'visible',
            timeout: body.timeout || 10000,
          });
        }
        return sendJson(200, { success: true });
      }

      if (pathname === '/windows' && method === 'GET') {
        const windowList = [];
        for (let i = 0; i < this.pages.length; i++) {
          const p = this.pages[i];
          const title = await p.title().catch(() => 'Untitled');
          windowList.push({
            index: i,
            title,
            url: p.url(),
            isActive: p === this.activePage,
          });
        }
        return sendJson(200, { windows: windowList });
      }

      if (pathname === '/switch-window' && method === 'POST') {
        const body = await getBody();
        const idx = parseInt(body.index, 10);
        if (isNaN(idx) || idx < 0 || idx >= this.pages.length) {
          throw new Error(`Invalid window index: ${body.index}`);
        }
        this.setActivePage(this.pages[idx]);
        return sendJson(200, { success: true, activeIndex: idx, title: await this.activePage.title() });
      }

      if (pathname === '/logs' && method === 'GET') {
        return sendJson(200, { logs: this.consoleLogs });
      }

      if (pathname === '/logs/clear' && method === 'POST') {
        this.consoleLogs = [];
        return sendJson(200, { success: true, message: 'Logs cleared' });
      }

      // 404 for unknown endpoint
      sendJson(404, { error: `Not found: ${method} ${pathname}` });
    } catch (err) {
      sendJson(500, { error: err.message, stack: err.stack });
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
      if (this.server) {
        this.server.close();
      }
      removeSession(this.projectRoot);
    } catch (e) {
      // ignore
    } finally {
      if (this.exitOnClose) {
        process.exit(0);
      }
    }
  }
}

// If executed directly as daemon process
if (require.main === module) {
  const args = process.argv.slice(2);
  let cdpPort = 9222;
  let daemonPort = 0;
  let projectRoot = process.cwd();
  let appPid = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cdp-port' && args[i + 1]) cdpPort = parseInt(args[++i], 10);
    if (args[i] === '--port' && args[i + 1]) daemonPort = parseInt(args[++i], 10);
    if (args[i] === '--project-root' && args[i + 1]) projectRoot = args[++i];
    if (args[i] === '--app-pid' && args[i + 1]) appPid = parseInt(args[++i], 10);
  }

  const daemon = new TauriAgentDaemon({
    port: daemonPort,
    cdpPort,
    projectRoot,
    appPid,
  });

  daemon.start().then(async (port) => {
    // Attempt connecting to CDP right away if port is specified
    if (cdpPort) {
      try {
        await daemon.connectCDP(cdpPort);
      } catch (e) {
        // May connect later via attach endpoint
      }
    }
    console.log(`[agent-tauri-daemon] Running on http://127.0.0.1:${port}`);
  }).catch((err) => {
    console.error(`[agent-tauri-daemon] Failed to start:`, err);
    process.exit(1);
  });
}

module.exports = { TauriAgentDaemon };
