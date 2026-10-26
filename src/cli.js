const { Command } = require('commander');
const path = require('path');
const { TauriAgentClient } = require('./client');
const { launchTauriApp, ensureDaemon } = require('./launcher');
const { readSession } = require('./session');

function createProgram() {
  const program = new Command();
  const client = new TauriAgentClient();

  program
    .name('agent-tauri')
    .description('AI agent CLI for automating, inspecting, and interacting with Tauri desktop applications')
    .version('1.0.0');

  // Launch
  program
    .command('launch <app>')
    .description('Launch a Tauri executable or dev command with debugging enabled')
    .option('-p, --port <number>', 'CDP port for remote debugging', '9222')
    .option('-t, --timeout <number>', 'Timeout in ms waiting for app', '30000')
    .option('-a, --args <args...>', 'Additional arguments to pass to the application')
    .action(async (app, opts) => {
      try {
        const cdpPort = parseInt(opts.port, 10);
        console.log(`Launching Tauri application: ${app} (CDP port ${cdpPort})...`);
        const res = await launchTauriApp(app, {
          cdpPort,
          timeout: parseInt(opts.timeout, 10),
          args: opts.args || [],
        });
        console.log(`Application started (PID: ${res.appPid}).`);
        console.log(`Agent daemon active on port ${res.daemonPort}. Attached to CDP port ${res.cdpPort}.`);
      } catch (err) {
        console.error(`Error launching app: ${err.message}`);
        process.exit(1);
      }
    });

  // Attach
  program
    .command('attach')
    .description('Attach to an already running Tauri app with remote debugging enabled')
    .option('-p, --port <number>', 'CDP port to connect to', '9222')
    .action(async (opts) => {
      try {
        const cdpPort = parseInt(opts.port, 10);
        console.log(`Connecting to Tauri application on CDP port ${cdpPort}...`);
        await ensureDaemon({ cdpPort });
        const res = await client.attach(cdpPort);
        console.log(`Successfully attached to Tauri app (${res.pageCount} page(s) detected).`);
      } catch (err) {
        console.error(`Error attaching: ${err.message}`);
        process.exit(1);
      }
    });

  // Status
  program
    .command('status')
    .description('Show current connection and Tauri application status')
    .action(async () => {
      try {
        const status = await client.getStatus();
        console.log('Status:');
        console.log(`  Connected:    ${status.connected}`);
        console.log(`  Daemon PID:   ${status.daemonPid}`);
        console.log(`  Daemon Port:  ${status.daemonPort}`);
        console.log(`  CDP Port:     ${status.cdpPort}`);
        console.log(`  Title:        "${status.title}"`);
        console.log(`  URL:          ${status.url}`);
        console.log(`  Windows:      ${status.windowCount}`);
        if (status.tauri) {
          console.log(`  Tauri Engine: ${status.tauri.version} (isTauri: ${status.tauri.isTauri})`);
        }
      } catch (err) {
        console.error(`Error getting status: ${err.message}`);
        process.exit(1);
      }
    });

  // Snapshot
  program
    .command('snapshot')
    .description('Capture an accessibility/element tree with reference IDs (@e1, @e2, ...)')
    .option('-i, --interactive', 'Only show interactive elements to save tokens', false)
    .option('--json', 'Output raw JSON structure', false)
    .action(async (opts) => {
      try {
        const res = await client.snapshot({ interactive: opts.interactive });
        if (opts.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(res.formatted);
        }
      } catch (err) {
        console.error(`Error taking snapshot: ${err.message}`);
        process.exit(1);
      }
    });

  // Click
  program
    .command('click <target>')
    .description('Click an element by @ref or CSS selector (e.g. @e1, button#submit)')
    .option('-b, --button <type>', 'Mouse button (left, right, middle)', 'left')
    .action(async (target, opts) => {
      try {
        await client.click(target, { button: opts.button });
        console.log(`Clicked ${target}`);
      } catch (err) {
        console.error(`Error clicking ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // DblClick
  program
    .command('dblclick <target>')
    .description('Double click an element by @ref or CSS selector')
    .action(async (target) => {
      try {
        await client.dblclick(target);
        console.log(`Double-clicked ${target}`);
      } catch (err) {
        console.error(`Error double-clicking ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Fill
  program
    .command('fill <target> <text>')
    .description('Clear and fill an input element with text')
    .action(async (target, text) => {
      try {
        await client.fill(target, text);
        console.log(`Filled ${target} with "${text}"`);
      } catch (err) {
        console.error(`Error filling ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Type
  program
    .command('type <target> <text>')
    .description('Type text into an element without clearing first')
    .action(async (target, text) => {
      try {
        await client.type(target, text);
        console.log(`Typed "${text}" into ${target}`);
      } catch (err) {
        console.error(`Error typing into ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Press
  program
    .command('press <key>')
    .description('Press a keyboard key (e.g. Enter, Tab, Escape, Control+a)')
    .option('-t, --target <target>', 'Target element to receive the keypress')
    .action(async (key, opts) => {
      try {
        await client.press(key, opts.target);
        console.log(`Pressed key ${key}`);
      } catch (err) {
        console.error(`Error pressing key ${key}: ${err.message}`);
        process.exit(1);
      }
    });

  // Hover
  program
    .command('hover <target>')
    .description('Hover mouse over an element')
    .action(async (target) => {
      try {
        await client.hover(target);
        console.log(`Hovered over ${target}`);
      } catch (err) {
        console.error(`Error hovering over ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Focus
  program
    .command('focus <target>')
    .description('Focus an element')
    .action(async (target) => {
      try {
        await client.focus(target);
        console.log(`Focused ${target}`);
      } catch (err) {
        console.error(`Error focusing ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Check / Uncheck
  program
    .command('check <target>')
    .description('Check a checkbox or radio button')
    .action(async (target) => {
      try {
        await client.check(target);
        console.log(`Checked ${target}`);
      } catch (err) {
        console.error(`Error checking ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('uncheck <target>')
    .description('Uncheck a checkbox')
    .action(async (target) => {
      try {
        await client.uncheck(target);
        console.log(`Unchecked ${target}`);
      } catch (err) {
        console.error(`Error unchecking ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Select
  program
    .command('select <target> <value>')
    .description('Select a dropdown option by value or label')
    .action(async (target, value) => {
      try {
        const res = await client.select(target, value);
        console.log(`Selected "${value}" in ${target} (result: ${JSON.stringify(res.selected)})`);
      } catch (err) {
        console.error(`Error selecting in ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Scroll
  program
    .command('scroll [direction] [pixels]')
    .description('Scroll the page or element (up, down, left, right)')
    .option('-t, --target <target>', 'Target element to scroll within')
    .action(async (direction = 'down', pixels = '300', opts) => {
      try {
        const px = parseInt(pixels, 10);
        await client.scroll(direction, px, opts.target);
        console.log(`Scrolled ${direction} ${px}px`);
      } catch (err) {
        console.error(`Error scrolling: ${err.message}`);
        process.exit(1);
      }
    });

  // Screenshot
  program
    .command('screenshot [path]')
    .description('Capture a screenshot of the Tauri application')
    .option('-f, --full', 'Capture full scrollable page', false)
    .option('-a, --annotate', 'Overlay @ref boxes on interactive elements for visual models', false)
    .option('-t, --target <target>', 'Capture specific element only')
    .action(async (outPath, opts) => {
      try {
        const res = await client.screenshot({
          path: outPath,
          fullPage: opts.full,
          annotate: opts.annotate,
          target: opts.target,
        });
        console.log(`Screenshot saved to: ${res.path} ${res.annotated ? '(annotated with refs)' : ''}`);
      } catch (err) {
        console.error(`Error capturing screenshot: ${err.message}`);
        process.exit(1);
      }
    });

  // Eval
  program
    .command('eval <script>')
    .description('Evaluate arbitrary JavaScript expression in the Tauri webview context')
    .action(async (script) => {
      try {
        const res = await client.eval(script);
        if (typeof res.result === 'object' && res.result !== null) {
          console.log(JSON.stringify(res.result, null, 2));
        } else {
          console.log(res.result);
        }
      } catch (err) {
        console.error(`Error evaluating script: ${err.message}`);
        process.exit(1);
      }
    });

  // Invoke (Tauri IPC)
  program
    .command('invoke <command> [jsonArgs]')
    .description('Invoke a Tauri backend command via IPC (e.g. invoke greet \'{"name":"Alice"}\')')
    .action(async (cmd, jsonArgs) => {
      try {
        let parsedArgs = {};
        if (jsonArgs) {
          try {
            parsedArgs = JSON.parse(jsonArgs);
          } catch (e) {
            throw new Error(`Invalid JSON arguments: ${e.message}`);
          }
        }
        const res = await client.invoke(cmd, parsedArgs);
        console.log(`Invoke '${cmd}' response:`);
        if (typeof res.result === 'object' && res.result !== null) {
          console.log(JSON.stringify(res.result, null, 2));
        } else {
          console.log(res.result);
        }
      } catch (err) {
        console.error(`Error invoking Tauri command '${cmd}': ${err.message}`);
        process.exit(1);
      }
    });

  // Get
  const getCmd = program.command('get').description('Retrieve information from elements');
  getCmd
    .command('text <target>')
    .description('Get text content of an element')
    .action(async (target) => {
      try {
        const res = await client.getText(target);
        console.log(res.text);
      } catch (err) {
        console.error(`Error getting text from ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  getCmd
    .command('attr <target> <attribute>')
    .description('Get attribute value from an element')
    .action(async (target, attr) => {
      try {
        const res = await client.getAttr(target, attr);
        console.log(res.value);
      } catch (err) {
        console.error(`Error getting attribute ${attr} from ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  getCmd
    .command('value <target>')
    .description('Get value of an input element')
    .action(async (target) => {
      try {
        const res = await client.getValue(target);
        console.log(res.value);
      } catch (err) {
        console.error(`Error getting value from ${target}: ${err.message}`);
        process.exit(1);
      }
    });

  // Wait
  program
    .command('wait <targetOrTime>')
    .description('Wait for element to appear or wait for timeout in ms')
    .action(async (targetOrTime) => {
      try {
        const parsedMs = parseInt(targetOrTime, 10);
        if (!isNaN(parsedMs) && String(parsedMs) === targetOrTime) {
          await client.wait(parsedMs);
          console.log(`Waited ${parsedMs}ms`);
        } else {
          await client.wait(targetOrTime);
          console.log(`Element ${targetOrTime} is now ready`);
        }
      } catch (err) {
        console.error(`Error waiting for ${targetOrTime}: ${err.message}`);
        process.exit(1);
      }
    });

  // Windows
  program
    .command('windows')
    .description('List all open Tauri Webview windows')
    .action(async () => {
      try {
        const res = await client.listWindows();
        console.log('Open Windows:');
        for (const w of res.windows) {
          console.log(`  [${w.index}] "${w.title}" - ${w.url} ${w.isActive ? '(active)' : ''}`);
        }
      } catch (err) {
        console.error(`Error listing windows: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('switch-window <index>')
    .description('Switch active Webview window')
    .action(async (index) => {
      try {
        const res = await client.switchWindow(parseInt(index, 10));
        console.log(`Switched to window [${res.activeIndex}]: "${res.title}"`);
      } catch (err) {
        console.error(`Error switching window: ${err.message}`);
        process.exit(1);
      }
    });

  // Logs
  program
    .command('console')
    .alias('logs')
    .description('Display captured console logs from the Tauri webview')
    .option('-c, --clear', 'Clear console logs buffer after displaying', false)
    .action(async (opts) => {
      try {
        const res = await client.getLogs();
        if (res.logs.length === 0) {
          console.log('(No console logs captured)');
        } else {
          for (const l of res.logs) {
            console.log(`[${l.time}] [${l.type.toUpperCase()}] ${l.text}`);
          }
        }
        if (opts.clear) {
          await client.clearLogs();
        }
      } catch (err) {
        console.error(`Error fetching logs: ${err.message}`);
        process.exit(1);
      }
    });

  // Close
  program
    .command('close')
    .description('Close the agent-tauri session, disconnect, and shut down daemon')
    .action(async () => {
      try {
        await client.close();
        console.log('Session closed and daemon shut down.');
      } catch (err) {
        // If daemon was already shut down
        console.log('Session closed.');
      }
    });

  return program;
}

module.exports = { createProgram };
