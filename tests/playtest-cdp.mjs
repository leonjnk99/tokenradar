// Browser playtest for Token Radar via the file:// bundle in headless Chromium.
// Exercises sort, search, category/chain filters, the three tabs and the detail
// drawer, and verifies the page's own farm plans and recomputed values against
// board.json, row by row. Zero console errors and zero network requests required.
// Usage: node tests/bundle.mjs && node tests/playtest-cdp.mjs
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connectCDP } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const board = JSON.parse(fs.readFileSync(join(root, 'out1', 'board.json'), 'utf8')).rows;
const bundleUrl = pathToFileURL(join(here, 'bundle.html')).href;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const cdp = await connectCDP();
const tab = await cdp.openTab(bundleUrl, 1280, 800);
try {
  await tab.waitFor('window.__RADAR_TEST && document.querySelectorAll("tbody tr").length > 0', 20000);
  await new Promise((r) => setTimeout(r, 400));

  const data = await tab.eval(`(() => {
    const t = window.__RADAR_TEST;
    return { rows: t.DATA.rows.length, candidates: t.DATA.candidate_size, excluded: t.DATA.excluded_size, live: t.DATA.live_size };
  })()`);
  check('page: data loaded (342 rows)', data.rows === 342, `${data.rows}`);
  check('page: 198 candidates / 144 excluded / 24 live',
    data.candidates === 198 && data.excluded === 144 && data.live === 24,
    `${data.candidates}/${data.excluded}/${data.live}`);

  const rowCount = await tab.eval(`document.querySelectorAll('tbody tr').length`);
  check('board: 198 candidate rows shown by default', rowCount === 198, `${rowCount}`);
  const firstRow = await tab.eval(`(() => { const tds = document.querySelectorAll('tbody tr')[0].querySelectorAll('td'); return { rank: tds[0].textContent, name: tds[1].querySelector('b').textContent }; })()`);
  check('board: first row is rank 1 Steakhouse Financial', firstRow.rank === '1' && firstRow.name === 'Steakhouse Financial', JSON.stringify(firstRow));

  // Sort by TVL: the first row must be the candidate with the highest TVL (Sentora Curator).
  await tab.eval(`(() => { const btns = [...document.querySelectorAll('th button')]; btns.find((b) => b.textContent.trim().startsWith('TVL')).click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const tvlFirst = await tab.eval(`(() => { const tds = document.querySelectorAll('tbody tr')[0].querySelectorAll('td'); return { name: tds[1].querySelector('b').textContent, tvl: tds[2].textContent }; })()`);
  check('sort: TVL desc puts Sentora Curator first', tvlFirst.name === 'Sentora Curator', JSON.stringify(tvlFirst));
  // Sort by name ascending.
  await tab.eval(`(() => { const btns = [...document.querySelectorAll('th button')]; btns.find((b) => b.textContent.trim().startsWith('Protocol')).click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const expectedFirstName = board.filter((r) => r.launch_candidate).map((r) => r.name).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)[0];
  const nameFirst = await tab.eval(`document.querySelectorAll('tbody tr')[0].querySelector('td:nth-child(2) b').textContent`);
  check('sort: name asc puts the alphabetically-first candidate first', nameFirst === expectedFirstName, `first=${nameFirst}, expected=${expectedFirstName}`);

  // Search: 'veda' matches exactly one candidate.
  await tab.eval(`(() => { const q = document.querySelector('#q'); q.value = 'veda'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const searchCount = await tab.eval(`document.querySelectorAll('tbody tr').length`);
  const searchName = await tab.eval(`document.querySelector('tbody tr td:nth-child(2) b') ? document.querySelector('tbody tr td:nth-child(2) b').textContent : ''`);
  check("search: 'veda' matches exactly 1 row (Veda)", searchCount === 1 && searchName === 'Veda', `${searchCount} rows, ${searchName}`);
  await tab.eval(`(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));

  // Category filter: Risk Curators candidates.
  const expectedCat = board.filter((r) => r.launch_candidate && r.category === 'Risk Curators').length;
  await tab.eval(`(() => { const s = document.querySelector('#category'); s.value = 'Risk Curators'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const catCount = await tab.eval(`document.querySelectorAll('tbody tr').length`);
  check('filter: category Risk Curators', catCount === expectedCat, `${catCount} rows, expected ${expectedCat}`);
  await tab.eval(`(() => { const s = document.querySelector('#category'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));

  // Chain filter: Solana candidates.
  const expectedChain = board.filter((r) => r.launch_candidate && r.chains.includes('Solana')).length;
  await tab.eval(`(() => { const s = document.querySelector('#chain'); s.value = 'Solana'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const chainCount = await tab.eval(`document.querySelectorAll('tbody tr').length`);
  check('filter: chain Solana', chainCount === expectedChain, `${chainCount} rows, expected ${expectedChain}`);
  await tab.eval(`(() => { const s = document.querySelector('#chain'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 300));

  // Excluded tab: 144 rows, first is rank 199 (Bybit).
  await tab.eval(`(() => { const btns = [...document.querySelectorAll('.tabs button')]; btns.find((b) => b.textContent.includes('Not a launch candidate')).click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const excl = await tab.eval(`(() => { const rows = document.querySelectorAll('tbody tr'); const first = rows[0].querySelectorAll('td'); return { count: rows.length, rank: first[0].textContent, name: first[1].querySelector('b').textContent, implied: first[5].textContent.trim() }; })()`);
  check('tab: excluded shows 144 rows, first is rank 199 Bybit at ≈ $0',
    excl.count === 144 && excl.rank === '199' && excl.name === 'Bybit' && excl.implied === '≈ $0', JSON.stringify(excl));

  // Live tab: 24 rows.
  await tab.eval(`(() => { const btns = [...document.querySelectorAll('.tabs button')]; btns.find((b) => b.textContent.includes('Live token')).click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const liveCount = await tab.eval(`document.querySelectorAll('tbody tr').length`);
  check('tab: live shows 24 rows', liveCount === 24, `${liveCount}`);
  // Live detail view.
  await tab.eval(`document.querySelector('tbody tr').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const liveDetail = await tab.eval(`(() => { const d = document.querySelector('dialog.detail'); return { open: d.open, title: (document.querySelector('#detail-title') || {}).textContent || '' }; })()`);
  check('detail: live row opens a detail view', liveDetail.open && liveDetail.title.length > 0, JSON.stringify(liveDetail));
  await tab.eval(`document.querySelector('dialog.detail .close').click()`);
  await new Promise((r) => setTimeout(r, 300));

  // Back to candidates; open the rank-1 detail view.
  await tab.eval(`(() => { const btns = [...document.querySelectorAll('.tabs button')]; btns.find((b) => b.textContent.includes('Launch candidates')).click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  await tab.eval(`document.querySelector('tbody tr').click()`);
  await new Promise((r) => setTimeout(r, 400));
  const detail = await tab.eval(`(() => {
    const d = document.querySelector('dialog.detail');
    const steps = d.querySelectorAll('ol.steps li').length;
    const text = d.textContent;
    return { open: d.open, title: (document.querySelector('#detail-title') || {}).textContent || '', steps, recompute: text.includes('the same number the board carries') };
  })()`);
  check('detail: rank-1 drawer opens with 8 farm steps', detail.open && detail.title === 'Steakhouse Financial' && detail.steps === 8, JSON.stringify(detail));
  check('detail: recompute matches the board', detail.recompute === true);
  await tab.eval(`document.querySelector('dialog.detail .close').click()`);
  await new Promise((r) => setTimeout(r, 300));

  // Page-generated farm plans vs board.json, all 342 rows (hash compare).
  const pageHashes = await tab.eval(`(() => {
    const t = window.__RADAR_TEST;
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }
    return t.DATA.rows.map((r) => hash(t.farmSteps(r).join('\\n')));
  })()`);
  const boardHashes = board.map((r) => hash(r.farm_steps.join('\n')));
  const hashMismatches = pageHashes.filter((h, i) => h !== boardHashes[i]).length;
  check('agreement: page farm steps == board.json steps for all 342 rows', hashMismatches === 0, `${hashMismatches} mismatches`);

  // Page-recomputed implied values vs board.json, all 198 candidates.
  const recompute = await tab.eval(`(() => {
    const t = window.__RADAR_TEST;
    let bad = 0;
    for (const r of t.DATA.rows) {
      if (r.launch_candidate && t.impliedOf(r, t.DATA.model) !== r.implied_value_usd) bad++;
    }
    return { bad, total: t.DATA.rows.filter((r) => r.launch_candidate).length };
  })()`);
  check('agreement: page recompute == board implied for all candidates', recompute.bad === 0, `${recompute.bad} mismatches of ${recompute.total}`);

  // Methodology section is present and states the model.
  const method = await tab.eval(`(() => { const el = document.querySelector('.model'); return el ? el.textContent : ''; })()`);
  check('methodology: formula + launch gate stated',
    method.includes('implied = round') && method.includes('launch gate') && method.includes('median age'));

  // No console errors, no network, no failed requests.
  const errors = tab.consoleErrors();
  check('browser: zero console errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  const http = tab.httpRequests();
  check('browser: zero network requests', http.length === 0, http.join(', ').slice(0, 200));
  const failed = tab.failedRequests();
  check('browser: zero failed requests', failed.length === 0, failed.join(' | ').slice(0, 200));
} finally {
  tab.close();
}
console.log(`\nplaytest: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
