// Logic tests for the token radar model. Run: node tests/logic.mjs
// Imports lib/model.ts directly (Node 24 strips erasable TypeScript).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODEL,
  buildBoard,
  buildRadar,
  boardIssue,
  farmSteps,
  impliedValue,
  isPreToken,
  launchGate,
  liveRows,
  medianAgeDays,
  parseSnapshot,
} from '../lib/model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const snapshot = parseSnapshot(
  readFileSync(join(root, '../token-radar-01-kit/token-radar-01-kit/input/snapshot.json'), 'utf8'),
);

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// --- snapshot shape ---
check('snapshot: 758 protocols', snapshot.protocols.length === 758, `${snapshot.protocols.length}`);
check('snapshot: 40 watchlist', snapshot.watchlist.length === 40, `${snapshot.watchlist.length}`);
check('snapshot: floor $50M', snapshot.floor_usd === 50_000_000);

// --- board shape ---
const { board, radar } = buildRadar(snapshot);
check('board: 342 rows (all pre-token)', board.length === 342, `${board.length}`);
check('board: ranks exactly 1..342', board.every((r, i) => r.rank === i + 1));
check('board: implied non-increasing with rank',
  board.every((r, i) => i === 0 || r.implied_value_usd <= board[i - 1].implied_value_usd));
check('board: not all implied equal', new Set(board.map((r) => r.implied_value_usd)).size > 1);
check('board: gate accepts it (boardIssue null)', boardIssue(board, snapshot) === null, boardIssue(board, snapshot) ?? '');
check('board: watchlist coverage 40/40',
  snapshot.watchlist.every((s) => board.some((r) => r.slug === s)));

// --- launch gate ---
const candidates = board.filter((r) => r.launch_candidate);
const excluded = board.filter((r) => !r.launch_candidate);
check('gate: 198 candidates', candidates.length === 198, `${candidates.length}`);
check('gate: 144 excluded', excluded.length === 144, `${excluded.length}`);
check('gate: all 40 watchlist rows are candidates',
  snapshot.watchlist.every((s) => board.find((r) => r.slug === s)?.launch_candidate === true));
const top20 = board.slice(0, 20);
const NON_CATS = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
check('gate: no CEX/Bridge/Liquid Staking/wrapped in top 20',
  top20.every((r) => !NON_CATS.has(r.category ?? '') && r.launch_candidate));
check('gate: Bybit is excluded, rank 199', board.find((r) => r.slug === 'bybit')?.rank === 199);
check('gate: WBTC is excluded', board.find((r) => r.slug === 'wbtc')?.launch_candidate === false);
check('gate: every excluded row is $1', excluded.every((r) => r.implied_value_usd === 1));
check('gate: every excluded row carries a reason', excluded.every((r) => typeof r.exclusion_reason === 'string' && r.exclusion_reason.length > 0));
check('gate: every candidate has null reason', candidates.every((r) => r.exclusion_reason === null));

// --- implied value sanity ---
check('model: rank 1 is Steakhouse Financial', board[0].name === 'Steakhouse Financial', board[0].name);
check('model: rank 1 implied $551,411,951', board[0].implied_value_usd === 551411951, `${board[0].implied_value_usd}`);
check('model: rank 2 is Sentora Curator', board[1].name === 'Sentora Curator', board[1].name);
const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
let sane = true;
for (const r of candidates) {
  const p = bySlug.get(r.slug);
  const lo = p.tvl_usd * MODEL.base_multiple * 0.7 * 0.7;
  const hi = p.tvl_usd * MODEL.base_multiple * 1.9 * 1.0;
  if (r.implied_value_usd < lo || r.implied_value_usd > hi) { sane = false; console.log('  out of range:', r.slug, r.implied_value_usd, lo, hi); break; }
}
check('model: every candidate implied inside TVL-multiple bounds', sane);
check('model: median age 418 days', medianAgeDays(snapshot) === 418, `${medianAgeDays(snapshot)}`);
const steak = bySlug.get('steakhouse-financial');
const iv = impliedValue(steak, snapshot.as_of, MODEL, medianAgeDays(snapshot));
check('model: impliedValue matches board row 1', iv.implied === board[0].implied_value_usd, `${iv.implied}`);

// --- farm plans ---
let stepsOk = true;
let stepsDetail = '';
for (const r of board) {
  if (r.farm_steps.length !== 8) { stepsOk = false; stepsDetail = `${r.slug}: ${r.farm_steps.length} steps`; break; }
  for (const s of r.farm_steps) {
    if (s.length < 20 || s.length > 600 || !s.includes('Cost:') || !s.includes('Time:')) {
      stepsOk = false; stepsDetail = `${r.slug}: step ${s.length} chars: ${s.slice(0, 80)}`; break;
    }
  }
  if (!stepsOk) break;
}
check('farm: 8 steps per row, 20-600 chars, Cost+Time each', stepsOk, stepsDetail);
const stepLens = board.flatMap((r) => r.farm_steps.map((s) => s.length));
check('farm: step lengths 107-342', Math.min(...stepLens) === 107 && Math.max(...stepLens) === 342, `${Math.min(...stepLens)}-${Math.max(...stepLens)}`);
// Plans differ by category: two different categories must not produce identical step 3.
const dex = board.find((r) => r.category === 'Dexs' && r.launch_candidate);
const lend = board.find((r) => r.category === 'Lending' && r.launch_candidate);
check('farm: step 3 differs by category (Dexs vs Lending)',
  dex !== undefined && lend !== undefined && dex.farm_steps[2] !== lend.farm_steps[2]);
const eth = board.find((r) => r.chains[0] === 'Ethereum' && r.launch_candidate);
const sol = board.find((r) => r.chains[0] === 'Solana' && r.launch_candidate);
check('farm: gas differs by chain (Ethereum vs Solana)',
  eth !== undefined && sol !== undefined && eth.farm_steps[1] !== sol.farm_steps[1]
    && eth.farm_steps[1].includes('$6') && sol.farm_steps[1].includes('$0.05'));
// Excluded rows get the gate note in step 1.
const bybit = board.find((r) => r.slug === 'bybit');
check('farm: excluded row step 1 names the gate', bybit.farm_steps[0].includes('not a launch candidate'));

// --- live set ---
const live = liveRows(snapshot);
check('live: 24 rows', live.length === 24, `${live.length}`);
check('live: all token-bearing', live.every((r) => !isPreToken(bySlug.get(r.slug))));
check('live: no CEX', live.every((r) => r.category !== 'CEX'));
check('live: sorted by market cap desc', live.every((r, i) => i === 0 || (r.mcap_usd ?? 0) <= (live[i - 1].mcap_usd ?? 0)));

// --- determinism ---
const again = buildRadar(snapshot);
check('determinism: buildRadar twice is byte-identical',
  JSON.stringify(buildBoard(snapshot)) === JSON.stringify(board) &&
  JSON.stringify(again.radar) === JSON.stringify(radar));

// --- data.js parses ---
const { dataScript } = await import('../lib/model.ts');
const script = dataScript(radar);
const window = {};
new Function('window', script)(window);
check('data.js: parses and holds 342 rows', window.RADAR.rows.length === 342);

// --- gate function unit checks ---
check('launchGate: CEX stopped', launchGate(bySlug.get('bybit')).candidate === false);
check('launchGate: versioned stopped', launchGate({ ...bySlug.get('steakhouse-financial'), name: 'Steakhouse V2' }).candidate === false);
check('launchGate: candidate passes', launchGate(bySlug.get('steakhouse-financial')).candidate === true);
check('farmSteps: 8 steps from the generator', farmSteps(bySlug.get('steakhouse-financial'), 543, { candidate: true, reason: null }).length === 8);

console.log(`\nlogic: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
