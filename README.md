# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/leonjnk99/tokenradar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/leonjnk99/tokenradar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) — see the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

A token launch radar: it reads a frozen snapshot of every protocol DefiLlama tracks,
works out which ones still record no token and could plausibly launch one, ranks them
by what that launch would be worth, and hands in a web dashboard with the board, a
detail view for every protocol and the steps to farm it.

Built for make.fun's **token-radar-01** bounty ($1,325). The entry is a program plus
the dashboard it writes — no network anywhere, no hand-kept list of names.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later (standard library only — nothing is installed). The program reads
the snapshot, writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` into the output directory. Two runs write identical bytes.

The dashboard is static: open `out/dashboard/index.html` in a browser. It renders
from `out/data.js` beside it and makes no network request.

Tests (all local, no network):

```sh
node tests/logic.mjs        # model unit checks
node tests/gate-check.mjs   # the seven gate rows, hand-verified against out/
bash tests/chrome.sh 9227   # headless Chromium for the browser tests
node tests/bundle.mjs && node tests/playtest-cdp.mjs   # sort/filter/detail in a real browser
node tests/bundle.mjs && node tests/shots-cdp.mjs      # the three screenshots
```

## The model (radar-2), in plain words

**The launch gate first.** A protocol can only rank as a launch candidate if it
records no token *and* is not an exchange, a bridge, or a staking/wrapping product,
*and* its name carries no version marker or wrapped/staked word and does not start
with an exchange's name. That is the watchlist rule's own pattern set, applied to the
snapshot's fields — no protocol name is special-cased. A protocol the gate stops
stays on the board at the foot, at $1, with the reason: its launch is worth ~$0, so
a $13.8B exchange can never top a launch ranking.

**Then the value.** For a candidate, implied value follows only from the snapshot's
own figures:

```
implied = round( TVL x 0.25
  x (1 + clamp(7-day growth, -50%, +150%) / 100 x 0.6)
  x (0.7 + 0.3 x min(age, 1460 days) / 1460 days) )
```

A launch token is valued at a quarter of the TVL it secures, worth more when the
protocol is growing and the longer it has run with no token. Age is the time since
DefiLlama first listed the protocol; a protocol with no listing date is scored at
the snapshot's own median age of the candidates (418 days here), never a fixed
number.

**The separation.** Token-bearing protocols are never mixed into the ranking. They
are set aside in a Live token view with their market caps, which are facts, not a
model.

**The farm plan.** Eight steps per protocol, built from its own record: the action
follows its category, the gas follows its first chain (Ethereum mainnet about $6 a
transaction, the L2s about $0.30, Solana under $0.05), the capital follows its TVL
($250 above $1B, $150 above $250M, $100 above $50M, $50 below), and the hold
follows its age (90 days under 90 days old, 60 under a year, 45 after). Every step
states what it costs and how long it takes.

## What the snapshot is

`input/snapshot.json` is the sealed DefiLlama protocol data (758 protocols at or
above $5M TVL, 40 on the watchlist, as of 2026-11-14). It carries no ranking, no
implied value, no farm plan and no airdrop flag — deriving them is this entry's
work. It records no token for a protocol; it never proves the protocol has none.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard + dossier out
- `lib/model.ts` — the model: launch gate, implied value, farm plans, live set
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a detail view, a filtered view (1280x800 JPEG)
- `tests/` — logic tests, gate checks, CDP browser tests and screenshots
