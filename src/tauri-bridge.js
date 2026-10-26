/**
 * Tauri IPC bridge and runtime inspection utilities.
 */

async function detectTauri(page) {
  return await page.evaluate(() => {
    const hasTauriGlobal = typeof window.__TAURI__ !== 'undefined';
    const hasTauriInternals = typeof window.__TAURI_INTERNALS__ !== 'undefined';

    let version = 'unknown';
    let isV2 = false;
    let isV1 = false;

    if (window.__TAURI__?.core?.invoke) {
      version = 'v2';
      isV2 = true;
    } else if (window.__TAURI__?.invoke) {
      version = 'v1';
      isV1 = true;
    } else if (hasTauriInternals) {
      version = 'v2-internal';
      isV2 = true;
    }

    return {
      isTauri: hasTauriGlobal || hasTauriInternals,
      version,
      isV1,
      isV2,
      availableApis: window.__TAURI__ ? Object.keys(window.__TAURI__) : [],
    };
  });
}

async function invokeTauriCommand(page, command, args = {}) {
  return await page.evaluate(async ({ cmd, payload }) => {
    // 1. Try Tauri v2 standard
    if (window.__TAURI__?.core?.invoke) {
      return await window.__TAURI__.core.invoke(cmd, payload);
    }
    // 2. Try Tauri v1 standard
    if (window.__TAURI__?.invoke) {
      return await window.__TAURI__.invoke(cmd, payload);
    }
    // 3. Try Tauri v2 internals
    if (window.__TAURI_INTERNALS__?.invoke) {
      return await window.__TAURI_INTERNALS__.invoke(cmd, payload);
    }
    // 4. Try window.__TAURI_INVOKE__ (legacy)
    if (typeof window.__TAURI_INVOKE__ === 'function') {
      return await window.__TAURI_INVOKE__(cmd, payload);
    }

    throw new Error('No Tauri invoke function found on window. Ensure the app was built with Tauri or window.__TAURI__ is exposed.');
  }, { cmd: command, payload: args });
}

async function emitTauriEvent(page, eventName, payload = {}) {
  return await page.evaluate(async ({ event, data }) => {
    if (window.__TAURI__?.event?.emit) {
      return await window.__TAURI__.event.emit(event, data);
    }
    throw new Error('window.__TAURI__.event.emit is not available.');
  }, { event: eventName, data: payload });
}

module.exports = {
  detectTauri,
  invokeTauriCommand,
  emitTauriEvent,
};
