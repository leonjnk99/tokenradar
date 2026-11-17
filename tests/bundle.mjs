// Build tests/bundle.html: the dashboard as one file for the headless-browser tests.
// Inlines out/data.js, dashboard/app.css and dashboard/app.js into out/dashboard/index.html.
// Usage: node tests/bundle.mjs   (run main.ts first so out/ exists)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'out1');

const html = readFileSync(join(out, 'dashboard', 'index.html'), 'utf8');
const css = readFileSync(join(out, 'dashboard', 'app.css'), 'utf8');
const dataJs = readFileSync(join(out, 'data.js'), 'utf8');
const appJs = readFileSync(join(out, 'dashboard', 'app.js'), 'utf8');

// Never let inlined script text close the script element early.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
// A replacer function, not a replacement string: app.js contains '$' sequences
// ('$' + ...) that String.replace would read as $-patterns and expand.
const bundled = html
  .replace('<link rel="stylesheet" href="app.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="../data.js"></script>', () => `<script>\n${safe(dataJs)}\n</script>`)
  .replace('<script src="app.js"></script>', () => `<script>\n${safe(appJs)}\n</script>`);
writeFileSync(join(here, 'bundle.html'), bundled);
console.log(`bundle: ${bundled.length} bytes -> tests/bundle.html`);
