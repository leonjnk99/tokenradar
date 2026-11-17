// Take the 3 real screenshots of Token Radar via the file:// bundle in headless
// Chromium. Reads shots.json for the shot list. Waits for the board to render
// (and, for the detail shot, for the drawer to open) before each capture.
// Usage: node tests/bundle.mjs && node tests/shots-cdp.mjs
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectCDP } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = JSON.parse(fs.readFileSync(join(here, 'shots.json'), 'utf8'));
const bundleUrl = pathToFileURL(join(here, 'bundle.html')).href;
const outDir = join(root, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

function jpegSize(buf) {
  // Walk JPEG markers to the first SOF frame: its width and height.
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

const cdp = await connectCDP();
let ok = true;
for (const shot of shots) {
  const tab = await cdp.openTab(bundleUrl + shot.query, 1280, 800);
  try {
    await tab.waitFor('window.__RADAR_TEST && document.querySelectorAll("tbody tr").length > 0', 20000);
    if (shot.query.includes('#p=')) {
      await tab.waitFor('document.querySelector("dialog.detail") && document.querySelector("dialog.detail").open', 10000);
    }
    await new Promise((r) => setTimeout(r, 700));
    const info = await tab.eval(`(() => {
      const rows = document.querySelectorAll('tbody tr').length;
      const dialog = document.querySelector('dialog.detail');
      return { rows, dialogOpen: dialog ? dialog.open : false, title: (document.querySelector('#detail-title') || {}).textContent || '' };
    })()`);
    const size = await tab.screenshot(join(outDir, shot.name));
    const dims = jpegSize(fs.readFileSync(join(outDir, shot.name)));
    console.log(`${shot.name}: ${size} B  ${dims ? dims.width + 'x' + dims.height : 'no dims'}  rows=${info.rows} dialog=${info.dialogOpen} title=${info.title}`);
    if (size > 524288) { console.log('  FAIL: over 512 KiB'); ok = false; }
    if (!dims || dims.width !== 1280 || dims.height !== 800) { console.log('  FAIL: not 1280x800'); ok = false; }
    const errors = tab.consoleErrors();
    if (errors.length > 0) { console.log('  console errors:', errors); ok = false; }
    const http = tab.httpRequests();
    if (http.length > 0) { console.log('  http requests:', http); ok = false; }
    const failed = tab.failedRequests();
    if (failed.length > 0) { console.log('  failed requests:', failed); ok = false; }
  } finally {
    tab.close();
  }
}
console.log(ok ? 'SHOTS OK' : 'SHOTS FAILED');
process.exit(ok ? 0 : 1);
