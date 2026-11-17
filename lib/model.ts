// Token Radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers EVERY pre-token protocol in the snapshot (342 rows), not just the watchlist:
// the watchlist is the floor, never the ceiling. But a launch ranking must not be topped by an
// exchange or a wrapped product of a token that already trades, so the model first runs a LAUNCH
// GATE over the snapshot's own fields. A protocol passes the gate when it records no token AND
// its category is not an exchange, a bridge or a staking/wrapping product, AND its name carries
// no version marker or wrapped/staked word and does not start with an exchange's name. The gate
// is the watchlist rule's own pattern set, stated in the snapshot's field guide — no protocol
// name is ever special-cased, and the same function scores every row.
//
// A protocol the gate stops is still on the board, at its foot, at an implied value of $1: the
// model's statement that its launch is worth ~$0. It is shown apart from the candidates, with
// the reason the gate stopped it, so the board covers the whole pre-token universe without
// letting a $13.8B exchange top a launch ranking.
//
// Implied value, for a protocol the gate passes, follows only from the snapshot's own figures:
//
//   base         = tvl_usd x 0.25            (a launch token valued at a quarter of the TVL it secures)
//   growth       = clamp(change_7d, -50, 150) per cent (null growth counts as 0)
//   growthMult   = 1 + (growth / 100) x 0.6
//   maturity     = 0.7 + 0.3 x min(age_days, 1460) / 1460
//                  (age = as_of minus listed_at; an unlisted age uses the snapshot's own median
//                   age of the protocols the gate passes, never a fixed number)
//   implied      = max(1, round(base x growthMult x maturity))
//
// Token-bearing protocols (416) are never mixed into the ranking: they are set aside as the live
// set, shown with their market caps, which are facts, not a model.
//
// Farm plans are derived from the protocol's own record — category, first chain, TVL tier and
// age — never from a hand-written list of names. Gas costs follow the first chain's tier
// (Ethereum mainnet costs the most, Solana and the L2s the least); capital follows the TVL
// tier; the hold follows the age. Every step states what it costs and how long it takes.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories whose token, if any, is the product itself, not a launch: the gate stops them. */
export const NON_LAUNCH_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Exchange names a protocol name must not start with: the gate stops those too. */
export const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  launch_candidate: boolean;
  exclusion_reason: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    median_age_days: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm plan from it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_candidate: boolean;
  exclusion_reason: string | null;
  growth_multiplier: number;
  maturity_multiplier: number;
  median_age_days: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  candidate_size: number;
  excluded_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The launch gate: whether a pre-token protocol can plausibly launch a token of its own, and
 * the reason when it cannot. The reasons name the rule that stopped it, never a judgement
 * about the protocol itself. Non-pre-token protocols are stopped by the first rule.
 */
export function launchGate(p: SnapshotProtocol): { candidate: boolean; reason: string | null } {
  if (!isPreToken(p)) return { candidate: false, reason: 'its token already trades' };
  if (p.category !== null && NON_LAUNCH_CATEGORIES.has(p.category)) {
    return { candidate: false, reason: `a ${p.category} product, not a protocol awaiting its own launch` };
  }
  if (VERSIONED.test(p.name)) return { candidate: false, reason: 'a versioned pool of another protocol' };
  if (WRAPPED_WORD.test(p.name)) return { candidate: false, reason: 'a wrapped or staked product of a token that already trades' };
  for (const exchange of EXCHANGE_NAMES) {
    if (p.name.startsWith(exchange)) return { candidate: false, reason: `an ${exchange} product, not a protocol awaiting its own launch` };
  }
  return { candidate: true, reason: null };
}

/** The median of a sorted list of day counts; 365 when the list is empty. */
function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 365;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * The snapshot's own median age, in days, of the pre-token protocols the launch gate passes
 * that carry a listing date. Unknown ages are scored at this median: the snapshot's middle-aged
 * protocol, not a number picked by hand.
 */
export function medianAgeDays(snapshot: Snapshot): number {
  const ages = snapshot.protocols
    .filter((p) => launchGate(p).candidate)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  return medianOf(ages);
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  medianAge: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? medianAge;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * The protocols the board ranks, strongest first, with ranks 1..n. Candidates first, by
 * implied value; then every protocol the gate stopped, at $1, by TVL — the board covers the
 * whole pre-token universe, and the gate's verdict is visible in the order itself.
 */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const medianAge = medianAgeDays(snapshot);
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  const missingWatchlist = snapshot.watchlist.filter((s) => !index.has(s));
  if (missingWatchlist.length > 0) throw new SnapshotError(`snapshot's watchlist names ${missingWatchlist.length} slug(s) the protocols list does not carry`);

  const preToken = snapshot.protocols.filter(isPreToken);
  const scored = preToken.map((p) => {
    const gate = launchGate(p);
    const { implied, growthPct, growthMult, maturityMult, age } = gate.candidate
      ? impliedValue(p, snapshot.as_of, model, medianAge)
      : { implied: 1, growthPct: 0, growthMult: 1, maturityMult: 1, age: ageDays(snapshot.as_of, p.listed_at) };
    return { p, gate, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => {
    if (a.gate.candidate !== b.gate.candidate) return a.gate.candidate ? -1 : 1;
    if (a.gate.candidate) {
      return b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);
    }
    return b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);
  });
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    launch_candidate: s.gate.candidate,
    exclusion_reason: s.gate.reason,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
      median_age_days: medianAge,
    },
    farm_steps: farmSteps(s.p, s.age, s.gate).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** The gas tier of a chain, in the words the plan uses. */
export function gasText(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $6 of gas';
  if (c === 'solana') return 'under $0.05 of gas';
  if (
    c === 'base' ||
    c === 'arbitrum' ||
    c === 'optimism' ||
    c === 'zksync era' ||
    c === 'linea' ||
    c === 'scroll' ||
    c === 'blast' ||
    c === 'mantle' ||
    c === 'mode' ||
    c === 'ink' ||
    c === 'unichain' ||
    c === 'world chain'
  ) {
    return 'about $0.30 of gas';
  }
  return 'about $1 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's core action, in the words a farmer can follow. */
export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield aggregator')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farming position on ${name} on ${chain} and keep it open.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('basis trading')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('cdp manager')) return `Open a $${capital} vault on ${name} on ${chain} and manage the position.`;
  if (c.includes('chain')) return `Stake $${capital} with a validator through ${name} on ${chain} and keep the stake.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different move from the core one. */
export function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 against the supply on ${name} and repay it a week later, so the account shows both sides.`;
  if (c.includes('dex') || c.includes('yield aggregator')) return `Swap $20 through ${name}'s main pool on ${chain} so the account shows trading as well as liquidity.`;
  if (c.includes('leveraged farm')) return `Add $20 more collateral to the ${name} position on ${chain} and rebalance it once.`;
  if (c.includes('yield') || c.includes('farm')) return `Claim the vault's rewards on ${name} and restake them, so the account shows a second deposit.`;
  if (c.includes('bridge')) return `Bridge $20 back through ${name} so the account shows two-way volume.`;
  if (c.includes('staking') || c.includes('restak')) return `Add a $20 top-up stake through ${name} and leave both stakes in place.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} and open a fresh one half its size.`;
  if (c.includes('prediction')) return `Settle the first market position on ${name} and open a second one.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('basis trading')) return `Allocate $20 to a second ${name} vault on ${chain} and keep both shares.`;
  if (c.includes('stable')) return `Swap $20 of the stable asset through ${name} on ${chain} and hold the rest.`;
  if (c.includes('rwa')) return `Check the yield accrual on the ${name} position and reinvest $20 of it.`;
  if (c.includes('insurance')) return `Extend the ${name} cover by a second policy period on ${chain}.`;
  if (c.includes('cdp manager')) return `Adjust the ${name} vault's collateral by $20 and keep the ratio healthy.`;
  if (c.includes('chain')) return `Delegate $20 more stake through ${name} on ${chain}.`;
  return `Make a second $20 deposit into ${name} on ${chain} and vote once if it opens a governance vote.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, first chain, TVL, age, launch gate), never
 * from a hand-written list of names. A protocol the gate stopped gets the same plan, headed by
 * the reason it is not a launch candidate: the plan earns yield, not a future token.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, gate: { candidate: boolean; reason: string | null }): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasText(chain);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const head = gate.candidate
    ? `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`
    : `Note that ${p.name} is not a launch candidate (${gate.reason ?? 'the launch gate stopped it'}), so this plan earns yield and fees, not a future token. Use a fresh wallet that holds only the funds you plan to farm.`;
  return [
    { text: head, cost: 'nothing to create; under $3 of gas for the first transaction', time: '5 minutes' },
    {
      text: `Move $${capital + 10} of USDC to ${chain} and keep $10 aside for gas, so the farm never stalls on fees.`,
      cost: `about $2 to bridge plus ${gas} on ${chain}`,
      time: '20 minutes',
    },
    { text: action, cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' },
    { text: second, cost: `$20 of capital and ${gas}`, time: '10 minutes' },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and unwind in reverse: withdraw, bridge back, then close the wallet's approvals.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js; the page regenerates the farm plan from it. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_candidate: row.launch_candidate,
    exclusion_reason: row.exclusion_reason,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    median_age_days: row.model.median_age_days,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const candidates = board.filter((r) => r.launch_candidate).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    candidate_size: candidates,
    excluded_size: board.length - candidates,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
