# ARCADE PAD

**Launch a token. Launch a game.**

A launchpad on Pons V2 (Robinhood Chain, chain id 4663) where every token
comes with its own arcade cabinet — Snake, Breakout, Racer or Invaders,
skinned with the token. The token's trading fees fill the cabinet's prize
pot; the high score of each round takes the pot.

```
launch ──► token + curve (Pons V2) + FeeVault + cabinet
trade  ──► Pons pays the creator fees to the FeeVault, not the creator
collect ─► 10 % pad · potBps % pot · rest creator   (anyone can press it)
play   ──► free; hold 0.01 % of the supply to post a score
score  ──► the referee replays the run and signs it; postScore() checks
bell   ──► settle(): the round's high score gets the pot; no score → rollover
```

## Layout

```
src/game/            the four games: pure, deterministic simulations (60 Hz,
                     integer state, seeded PRNG) + their pixel renderers + bots
src/game/replay.ts   the run format (seed + input changes) and the replay
src/app/api/referee  the referee: replays a run in Node, signs the score (EIP-712)
src/components/      Cabinet (canvas runner + arcade chrome), LaunchForm,
                     PlayView, TradePanel, RoundPanel, …
src/lib/             chain, market reads (multicall, no indexer), skin, referee client
contracts/           ArcadePad.sol + FeeVault.sol (Hardhat 2, OZ 5.1, paris)
scripts/sim-test.ts  headless game tests (bots play, replays must match)
scripts/capture.mjs  headless-Chrome screenshots → docs/captures
```

## Run it

```bash
npm install && (cd contracts && npm install)
cd contracts && npm test && cd ..          # 20 contract tests on a Pons mock
npm run test:games                         # 131 checks: determinism, replay, bots
npm run dev                                # http://localhost:3000
```

Without a deployed pad the site runs the games (home page, demo bots,
"press start") and shows the arcade as empty; launching is off.

### Rehearsal on a local network

```bash
cd contracts
HARDHAT_CHAIN_ID=4663 npm run serve:fork                       # mock Pons, instant
FORK_URL=https://rpc.mainnet.chain.robinhood.com HARDHAT_CHAIN_ID=4663 npm run serve:fork   # real fork (public RPC rate-limits)
```

The script deploys the pad, seeds four cabinets (one with a funded pot),
warms every read, serves JSON-RPC on 8697 and writes `.env.local`
(RPC, pad address, `REFEREE_KEY` = hardhat account #1, `NEXT_PUBLIC_DEV_WALLET=1`).
Start `next dev` **after** that; in the browser console:

```js
localStorage.setItem("arcadepad:dev-wallet", JSON.stringify({ rpc: "http://127.0.0.1:8697", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }))
```

then reload — `public/dev-wallet.js` is a stub wallet the fork signs for.
Delete `.env.local` and restart the dev server when done.

### Prove it against the real Pons factory

```bash
cd contracts && FORK_URL=https://rpc.mainnet.chain.robinhood.com npm run fork:check
```

22 checks on a fork of Robinhood Chain: a launch through Pons' forwarder
(the curve's fee recipient is the cabinet's vault, the creator receives
exactly the locally quoted tokens), a launch without a first buy, a real
graduation that makes Pons sweep creator fees to its escrow → `collect()`
splits them through the real escrow, a referee-signed score accepted, a
non-holder's refused, settle and withdraw.

## Deploy

1. Make a referee key (any fresh private key). Its **address** is `REFEREE`
   for the contract; the **key** is `REFEREE_KEY` on the site's host. Keep
   it server-side only; the owner can rotate it with `setReferee`.
2. `contracts/.env`: `DEPLOYER_PRIVATE_KEY`, `REFEREE`, optional `TREASURY`.
3. `cd contracts && npm run deploy:robinhood` — writes
   `contracts/deployments/robinhood.json`, which `next.config.ts` reads.
   Nothing to paste into the site.
4. Host the Next app (Vercel: import the repo at its root; it is a plain
   Next.js app with `contracts/` beside it). Set `REFEREE_KEY`, optionally
   `PINATA_JWT` (logo upload), `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`,
   `NEXT_PUBLIC_SITE_URL`.

Without `REFEREE_KEY` the site plays for free and signs nothing.

## The rules, exactly

- **Launch**: Pons' launch fee (0.0005 ETH) + your first buy. `potBps`
  10–90 %, `roundLength` 1–30 days, creator tax ≤ 10 % (Pons' cap). ETH
  pairs only, config 0. The cabinet colour is stored in the token's fifth
  social (`arcadepad:v1;accent=…`).
- **Fees**: Pons takes 1 % per curve trade and pays the creator's 70 % of
  it to the creator-fee recipient — the cabinet's `FeeVault`, which has no
  owner and can only forward to the pad. Fees accrue on the curve and Pons
  sweeps them to its escrow in batches; `collect(token)` pulls what is
  swept: 10 % to the treasury, `potBps` to the pot, the rest to the
  creator. All payouts are pull (`withdraw()`).
- **Scores**: `postScore(token, player, score, deadline, sig)` needs a
  signature by the pad's `referee` over
  `Score(cabinet, player, round, score, deadline)`, `score > bestScore`,
  and `balanceOf(player) ≥ 0.01 %` of the launch supply. The referee only
  signs a run it replayed to the end (max 15 minutes at 60 Hz) whose score
  is above zero, for the current round, with a 15-minute deadline.
- **Rounds**: past the bell, the next `postScore`, `collect` or `settle`
  pays the pot to the round's best player and opens the next round on the
  same schedule. No score → the pot rolls over. A signature for a finished
  round is worthless; the referee signs for the round that will be open.
- **Bots**: the referee proves a run happened under the rules, not who
  played. Said on the site, in the FAQ, on every cabinet.

## Verified

- `contracts`: 20 Hardhat tests (mock Pons with a creditable escrow).
- `fork:check`: 22/22 against the real Pons V2 factory, forwarder and
  escrow on a fork of Robinhood Chain (block 63 572 218).
- `test:games`: 131 checks — every game's bot run replays to the same
  score twice, other seeds give other runs, idle runs end, malformed logs
  are rejected.
- In the browser (mock network, stub wallet): refereed Snake run → score
  signed → posted on chain; an Invaders run on a cabinet with
  a funded pot → posted → bell → `settle` → `withdraw 0.0378 Ξ` from the
  page; a 0.01 ETH buy delivering exactly the quoted 4 060 336 tokens; a
  launch from the form (TOAD on Racer) with the success card decoded from
  the event.
- `next build`, `eslint`, `tsc` clean.

## Open

- **Not deployed.** No pad on Robinhood Chain, no referee hosted, no
  domain (`arcadepad.fun` is a placeholder in `src/lib/site.ts`).
- The referee key is a single hot key on the host; rotate with
  `setReferee` if it leaks. A signed score is only valid 15 minutes.
- A graduated token's price is read from the curve at graduation, not
  from the Uniswap v4 pool; fees swept after graduation still collect.
- Bots can play (by design, documented). Rate limiting of `/api/referee`
  is left to the host.
- Pons' image upload is Origin-gated; logos are https URLs or Pinata.
