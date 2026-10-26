const http = require('http');
const { readSession } = require('./session');

class TauriAgentClient {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
  }

  getSession() {
    const session = readSession(this.projectRoot);
    if (!session || !session.daemonPort) {
      throw new Error(
        'No active agent-tauri session found. Run "agent-tauri launch <app>" or "agent-tauri attach" first.'
      );
    }
    return session;
  }

  async request(method, path, body = null) {
    const session = this.getSession();
    const port = session.daemonPort;

    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = data ? JSON.parse(data) : {};
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
              } else {
                reject(new Error(parsed.error || `HTTP ${res.statusCode}: ${data}`));
              }
            } catch (e) {
              reject(new Error(`Failed to parse daemon response: ${e.message}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new Error(`Could not communicate with agent-tauri daemon on port ${port}: ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async getStatus() {
    return this.request('GET', '/session/status');
  }

  async attach(cdpPort = 9222) {
    return this.request('POST', '/session/attach', { cdpPort });
  }

  async close() {
    return this.request('POST', '/session/close');
  }

  async snapshot(options = {}) {
    const query = options.interactive ? '?interactive=true' : '';
    return this.request('GET', `/snapshot${query}`);
  }

  async click(target, options = {}) {
    return this.request('POST', '/action/click', { target, ...options });
  }

  async dblclick(target, options = {}) {
    return this.request('POST', '/action/dblclick', { target, ...options });
  }

  async fill(target, text, options = {}) {
    return this.request('POST', '/action/fill', { target, text, ...options });
  }

  async type(target, text, options = {}) {
    return this.request('POST', '/action/type', { target, text, ...options });
  }

  async press(key, target = null, options = {}) {
    return this.request('POST', '/action/press', { key, target, ...options });
  }

  async hover(target, options = {}) {
    return this.request('POST', '/action/hover', { target, ...options });
  }

  async focus(target, options = {}) {
    return this.request('POST', '/action/focus', { target, ...options });
  }

  async check(target, options = {}) {
    return this.request('POST', '/action/check', { target, ...options });
  }

  async uncheck(target, options = {}) {
    return this.request('POST', '/action/uncheck', { target, ...options });
  }

  async select(target, value, options = {}) {
    return this.request('POST', '/action/select', { target, value, ...options });
  }

  async scroll(direction = 'down', pixels = 300, target = null) {
    return this.request('POST', '/action/scroll', { direction, pixels, target });
  }

  async screenshot(options = {}) {
    return this.request('POST', '/action/screenshot', options);
  }

  async eval(script) {
    return this.request('POST', '/action/eval', { script });
  }

  async invoke(command, args = {}) {
    return this.request('POST', '/action/invoke', { command, args });
  }

  async getText(target) {
    return this.request('GET', `/action/text?target=${encodeURIComponent(target)}`);
  }

  async getAttr(target, name) {
    return this.request('GET', `/action/attr?target=${encodeURIComponent(target)}&name=${encodeURIComponent(name)}`);
  }

  async getValue(target) {
    return this.request('GET', `/action/value?target=${encodeURIComponent(target)}`);
  }

  async wait(targetOrTime, options = {}) {
    if (typeof targetOrTime === 'number') {
      return this.request('POST', '/action/wait', { time: targetOrTime });
    }
    return this.request('POST', '/action/wait', { target: targetOrTime, ...options });
  }

  async listWindows() {
    return this.request('GET', '/windows');
  }

  async switchWindow(index) {
    return this.request('POST', '/switch-window', { index });
  }

  async getLogs() {
    return this.request('GET', '/logs');
  }

  async clearLogs() {
    return this.request('POST', '/logs/clear');
  }
}

module.exports = { TauriAgentClient };
