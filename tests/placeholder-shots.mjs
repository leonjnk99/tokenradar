// Temporary: screenshot a blank page 3x so main.ts has screenshots to copy.
// These placeholders are replaced by the real dashboard screenshots before submit.
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectCDP } from './cdp.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cdp = await connectCDP();
for (const name of ['1-board.jpg', '2-detail.jpg', '3-filtered.jpg']) {
  const tab = await cdp.openTab('about:blank', 1280, 800);
  try {
    await new Promise((r) => setTimeout(r, 500));
    const size = await tab.screenshot(join(root, 'screenshots', name));
    console.log(name, size, 'B');
  } finally { tab.close(); }
}
process.exit(0);
