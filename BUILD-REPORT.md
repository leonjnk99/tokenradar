# Token Radar — build report

## Entry

- Competition: **token-radar-01** — Build the best token launch radar ($1,325)
- Model: **radar-2** (own design, in `lib/model.ts`)
- Snapshot: 758 protocols, floor $50M, watchlist 40, as of 2026-11-14

## Model

- **Launch gate** (binary, from the watchlist rule's own patterns): pre-token AND
  category not in {CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
  Restaked BTC} AND name not versioned AND no whole word wrapped/staked/staking AND
  not starting with an exchange name. Non-candidates sit at the foot of the board at
  $1 with the reason — their launch is worth ~$0.
- **Implied value**: `round(TVL x 0.25 x (1 + clamp(change_7d, -50, 150)/100 x 0.6)
  x (0.7 + 0.3 x min(age, 1460)/1460))`; unknown age uses the snapshot's own median
  age of the candidates (418 days), not a fixed number.
- **Farm plans**: 8 steps each, derived from category + first chain + TVL tier + age;
  gas by chain tier (Ethereum ~$6, L2s ~$0.30, Solana <$0.05), capital $50–$250 by
  TVL, hold 45–90 days by age.
- **Live set**: 24 token-bearing protocols (non-CEX) by market cap, set aside.

## Board

- **342 rows** — every pre-token protocol in the snapshot: 198 launch candidates
  (ranks 1–198) + 144 stopped by the gate (ranks 199–342 at $1).
- Watchlist coverage: **40/40**. Ranks exactly 1..342, implied value strictly
  non-increasing, not all equal. No CEX / Bridge / Liquid Staking / wrapped product
  in the top 20 (Bybit rank 199, WBTC rank 202, both $1).

### Top 10

| Rank | Protocol | Implied value | TVL | Category |
| ---: | --- | ---: | ---: | --- |
| 1 | Steakhouse Financial | $551,411,951 | $2,753,981,495 | Risk Curators |
| 2 | Sentora Curator | $547,904,814 | $2,757,585,593 | Risk Curators |
| 3 | Gauntlet | $330,944,532 | $1,577,685,462 | Risk Curators |
| 4 | Veda | $308,222,134 | $1,563,415,482 | Onchain Capital Allocator |
| 5 | USDD | $214,233,200 | $1,055,793,606 | CDP |
| 6 | Upshift | $110,805,963 | $499,083,733 | Onchain Capital Allocator |
| 7 | Nonce Capital | $85,777,211 | $513,783,671 | Risk Curators |
| 8 | Polymarket International | $79,528,830 | $320,193,439 | Prediction Market |
| 9 | Bittensor dTAO | $64,253,990 | $376,026,255 | Dexs |
| 10 | OnRe | $61,837,746 | $308,882,355 | RWA |

## Sizes

| Artifact | Bytes |
| --- | ---: |
| dashboard source (index.html + app.css + app.js) | 44,651 (cap 64,000) |
| dossier.json | 561,021 (cap 1,572,864) |
| dossier text (whole source fits, nothing cut) | 44,915 (cap 65,536) |
| board.json (342 rows) | 649,420 (cap 8,388,608) |
| data.js | 140,149 |
| 1-board.jpg | 123,998 (1280x800) |
| 2-detail.jpg | 137,565 (1280x800) |
| 3-filtered.jpg | 124,559 (1280x800) |

## Verification

- **Logic tests** (`node tests/logic.mjs`): **39 passed, 0 failed** — snapshot shape,
  board shape and monotonicity, watchlist 40/40, gate counts and top-20 exclusion,
  implied-value bounds and exact rank-1 value, farm-step lengths (107–342 chars)
  and category/chain variation, live set, determinism, data.js parsing.
- **Browser playtest** (`node tests/playtest-cdp.mjs`, real headless Chromium over
  `file://`): **20 passed, 0 failed** — data loads (342 rows), default board shows
  198 candidates with Steakhouse first, sort by TVL/name, search "veda" (1 row),
  category filter (Risk Curators, 34 rows), chain filter (Solana, 32 rows), excluded
  tab (144 rows, Bybit rank 199 at ≈ $0), live tab (24 rows), live detail view,
  rank-1 detail drawer (8 farm steps, recompute matches), **page farm steps ==
  board.json steps for all 342 rows (0 mismatches)**, **page recompute == board
  implied for all 198 candidates (0 mismatches)**, methodology present, **zero
  console errors, zero network requests, zero failed requests**.
- **Screenshots** (`node tests/shots-cdp.mjs`): **SHOTS OK** — 3 JPEGs, 1280x800,
  each ≤512 KiB, board / detail (Steakhouse Financial drawer open) / filtered
  (Risk Curators, 34 rows). Visually verified: dark radar theme, KPI strip, controls
  and table all legible.
- **Determinism**: `main.ts` run twice into separate dirs — `diff -r` empty
  (byte-identical), run again with the real screenshots — still byte-identical.
- **Gate rows** (`node tests/gate-check.mjs`, hand-verified against `out/`): **17
  passed, 0 failed** — dashboard files + no-network + source <64 KB; board rows,
  slugs, ranks and implied bounds; ranks 1..342 + monotonicity; watchlist 40/40;
  farm steps 3–12 strings of 20–600 chars; 3 screenshots within size and dimension
  caps; dossier byte-for-byte what `buildDossier` writes, ≤1.5 MiB.
- **Kit check** (`node cli/makefun.mjs check --repo <dir> --worktree`): only
  **transcripts_present fails** — no transcripts were bundled (the main agent does
  that at submission). All other checks pass: competition_open, snapshot,
  license_osi, entrypoint; repo checks are submission-time.

## Known limits (not verified)

- Audio: none (a dashboard has none).
- Touch input: not tested (desktop browser only).
- Low-end performance: not measured; the page renders 198 rows by default and
  filters client-side.
- The farm plans' gas figures are the model's approximate tiers, stated as such in
  the dashboard; they are not live quotes.
- The entry has not been submitted and no GitHub repository has been created for it;
  that step belongs to the main agent.
