// Minimal CDP driver over Node's built-in WebSocket (no Puppeteer).
// This VM's Chromium blocks http://127.0.0.1 navigations from CDP, so every page is
// opened in a FRESH tab whose first navigation is the target URL.
// Usage: import { connectCDP } from './cdp.mjs'; const cdp = await connectCDP();
import fs from 'node:fs';

const DEBUG_PORT = process.env.CDP_PORT || 9227;

function makeSession(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const entry = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(JSON.stringify(data.error)));
      else entry.resolve(data.result);
    } else if (data.method) {
      events.push(data);
    }
  };
  async function send(method, params = {}) {
    const mid = ++id;
    ws.send(JSON.stringify({ id: mid, method, params }));
    return new Promise((resolve, reject) => pending.set(mid, { resolve, reject }));
  }
  return {
    send,
    events,
    async enable() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');
    },
    async waitFor(fnSource, timeoutMs = 30000) {
      const start = Date.now();
      for (;;) {
        try {
          const r = await send('Runtime.evaluate', { expression: fnSource, returnByValue: true });
          if (r.result && r.result.value === true) return true;
        } catch { /* target may still be loading */ }
        if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for: ' + fnSource);
        await new Promise((r2) => setTimeout(r2, 200));
      }
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
      return r.result ? r.result.value : undefined;
    },
    async screenshot(path, quality = 88) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality });
      fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
      return fs.statSync(path).size;
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    consoleErrors() {
      return events
        .filter((e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || (e.method === 'Runtime.exceptionThrown'))
        .map((e) => JSON.stringify(e.params).slice(0, 400));
    },
    failedRequests() {
      return events
        .filter((e) => e.method === 'Network.loadingFailed')
        .map((e) => JSON.stringify(e.params).slice(0, 300));
    },
    httpRequests() {
      return events
        .filter((e) => e.method === 'Network.requestWillBeSent')
        .map((e) => e.params.request.url)
        .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    },
    close() { ws.close(); },
  };
}

async function connectWs(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(new Error('ws error ' + e.message));
  });
  return ws;
}

export async function connectCDP() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = await connectWs(page.webSocketDebuggerUrl);
  const session = makeSession(ws);
  return {
    ...session,
    // Open the URL in a FRESH tab (its first navigation) and return a session.
    // Device metrics are set BEFORE navigation so the page never sees a resize.
    async openTab(url, width = 1280, height = 800) {
      const t = await session.send('Target.createTarget', { url: 'about:blank' });
      let target = null;
      for (let i = 0; i < 30; i += 1) {
        const l = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        target = l.find((x) => x.id === t.targetId);
        if (target) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!target) throw new Error('new target never appeared');
      const tabWs = await connectWs(target.webSocketDebuggerUrl);
      const tab = makeSession(tabWs);
      await tab.enable();
      await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await tab.send('Page.navigate', { url });
      return tab;
    },
  };
}
