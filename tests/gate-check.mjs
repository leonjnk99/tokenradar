// Independent hand-verification of the seven gate rows against out/, written from the
// rules as the competition states them (the kit ships no local scorer). Run: node tests/gate-check.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'out');
const kit = join(root, '../token-radar-01-kit/token-radar-01-kit');
const snapshot = JSON.parse(readFileSync(join(kit, 'input/snapshot.json'), 'utf8'));
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
const slugs = new Set(snapshot.protocols.map((p) => p.slug));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function jpegDims(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// --- 1. dashboard_files ---
const dashFiles = readdirSync(join(out, 'dashboard')).filter((f) => !f.startsWith('.'));
const dashBytes = dashFiles.reduce((n, f) => n + statSync(join(out, 'dashboard', f)).size, 0);
check('gate dashboard_files: index.html + .css + .js present',
  dashFiles.includes('index.html') && dashFiles.some((f) => f.endsWith('.css')) && dashFiles.some((f) => f.endsWith('.js')));
check('gate dashboard_files: ≤400 files, ≤4 MiB', dashFiles.length <= 400 && dashBytes <= 4 * 1024 * 1024, `${dashFiles.length} files, ${dashBytes} B`);
let netOffenders = [];
for (const f of dashFiles) {
  const text = readFileSync(join(out, 'dashboard', f), 'utf8');
  if (f.endsWith('.html')) {
    const attrs = [...text.matchAll(/(?:href|src|action|poster|cite|data)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
    attrs.filter((u) => u.startsWith('http://') || u.startsWith('https://')).forEach((u) => netOffenders.push(`${f}: ${u}`));
    const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    styles.forEach((s) => { if (/https?:\/\//.test(s)) netOffenders.push(`${f}: <style> has a URL`); });
  }
  if (f.endsWith('.css') && /https?:\/\//.test(text)) netOffenders.push(`${f}: CSS has a URL`);
  if (f.endsWith('.js')) {
    const imps = [...text.matchAll(/(?:import\s+[^'"]*['"]|from\s+['"]|require\s*\(\s*['"]|import\s*\(\s*['"])([^'"]+)/g)].map((m) => m[1]);
    imps.filter((u) => u.startsWith('http://') || u.startsWith('https://')).forEach((u) => netOffenders.push(`${f}: import ${u}`));
  }
}
check('gate dashboard_files: no http(s) address in attributes/CSS/JS imports', netOffenders.length === 0, netOffenders.join('; '));
check('gate dashboard_files: source under 64,000 B (judge reads it whole)', dashBytes < 64000, `${dashBytes} B`);

// --- 2. board_file ---
check('gate board_file: 100-4000 rows', rows.length >= 100 && rows.length <= 4000, `${rows.length}`);
check('gate board_file: ≤8 MiB', statSync(join(out, 'board.json')).size <= 8 * 1024 * 1024, `${statSync(join(out, 'board.json')).size} B`);
let rowBad = '';
for (const r of rows) {
  if (!slugs.has(r.slug)) { rowBad = `${r.slug}: slug not in snapshot`; break; }
  if (typeof r.name !== 'string' || r.name.length === 0) { rowBad = `${r.slug}: empty name`; break; }
  if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { rowBad = `${r.slug}: rank ${r.rank}`; break; }
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { rowBad = `${r.slug}: implied ${r.implied_value_usd}`; break; }
  if (!Array.isArray(r.farm_steps)) { rowBad = `${r.slug}: no farm_steps`; break; }
}
check('gate board_file: every row has a snapshot slug, a name, a positive rank, a positive implied ≤1e14', rowBad === '', rowBad);

// --- 3. sorted_by_value ---
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
check('gate sorted_by_value: ranks exactly 1..N', ranks.every((v, i) => v === i + 1));
check('gate sorted_by_value: implied non-increasing with rank',
  rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd));
check('gate sorted_by_value: not all implied equal', new Set(rows.map((r) => r.implied_value_usd)).size > 1);

// --- 4. coverage ---
const have = new Set(rows.map((r) => r.slug));
const missing = snapshot.watchlist.filter((s) => !have.has(s));
check('gate coverage: watchlist 40/40', missing.length === 0, missing.join(', '));

// --- 5. farm_steps ---
let stepBad = '';
for (const r of rows) {
  if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { stepBad = `${r.slug}: ${r.farm_steps.length} steps`; break; }
  for (const s of r.farm_steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600) { stepBad = `${r.slug}: step ${t.length} chars`; break; }
  }
  if (stepBad) break;
}
check('gate farm_steps: 3-12 strings, 20-600 chars each', stepBad === '', stepBad);

// --- 6. screenshots ---
const shots = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'));
check('gate screenshots: 3 images', shots.length === 3, `${shots.length}`);
let shotBad = '';
for (const f of shots) {
  const buf = readFileSync(join(out, 'screenshots', f));
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) { shotBad = `${f}: not JPEG/PNG`; break; }
  if (buf.length > 524288) { shotBad = `${f}: ${buf.length} B over 512 KiB`; break; }
  const dims = isJpeg ? jpegDims(buf) : null;
  if (isJpeg && dims) {
    const long = Math.max(dims.width, dims.height);
    const short = Math.min(dims.width, dims.height);
    if (long > 1440 || short < 800) { shotBad = `${f}: ${dims.width}x${dims.height}`; break; }
  }
}
check('gate screenshots: whole JPEG/PNG, ≤512 KiB, long ≤1440, short ≥800', shotBad === '', shotBad);
for (const f of shots) {
  const buf = readFileSync(join(out, 'screenshots', f));
  const dims = jpegDims(buf);
  console.log(`  shot ${f}: ${buf.length} B, ${dims.width}x${dims.height}`);
}

// --- 7. dossier_matches ---
const dossierBytes = readFileSync(join(out, 'dossier.json'));
const rebuilt = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
check('gate dossier_matches: byte-for-byte what buildDossier writes',
  Buffer.compare(Buffer.from(dossierBytes), Buffer.from(rebuilt)) === 0,
  `${dossierBytes.length} B vs rebuilt ${rebuilt.length} B`);
check('gate dossier_matches: dossier ≤1.5 MiB', dossierBytes.length <= 1572864, `${dossierBytes.length} B`);
const dossier = JSON.parse(dossierBytes.toString('utf8'));
check('gate dossier_matches: text ≤65,536 B (whole source fits)', Buffer.byteLength(dossier.text, 'utf8') <= 65536, `${Buffer.byteLength(dossier.text, 'utf8')} B`);

console.log(`\ngate-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
