# WORLDX launch checklist (2-day plan)

Tick each item. Do not announce a live claim until every box under "Gate" is ticked.

## Day 1: prepare and test

- [ ] New wallet (fresh seed on paper, never shared). It holds the WORLDX and a few dollars of BTC.
- [ ] Verify on UniSat's BRC-20 page that WORLDX shows, with 21,000,000 supply and your balance. (6-letter ticker: confirm indexers recognise it. If not, STOP.)
- [ ] `git clone`, `git checkout claude/practical-cerf-d6ox64`, `cd site`, `npm install`, `npm test` shows 13 pass / 0 fail.
- [ ] `npx serve .`, open `admin.html`, press Connect: no error.
- [ ] Wait for a low mempool (about 2 sat/vB). Inscribe 2-3 transfers of 1000 WORLDX each. Wait for confirmation.
- [ ] Sign them on `admin.html` (fee rate = what you paid, profit 1.20, Use suggested price, payout address set). Download `signed-lots.jsonl`.
- [ ] `npm run lots -- signed-lots.jsonl` prints `0 skipped`.

## Gate: real test claim (mainnet, small)

- [ ] Second wallet in a second browser profile, with 2 separate coins.
- [ ] Claim one lot from `http://localhost:3000/`.
- [ ] Transaction confirms. Second wallet shows 1,000 WORLDX. Payout wallet received the price.
- [ ] The confirmation text lists development fee + transfer cost + network fee, and totals match what UniSat shows.

## Day 2: scale up and publish

- [ ] Decide how many lots (one lot = one buyer of 1,000 WORLDX). Inscribe them in batches at low fees. Wait for confirmations.
- [ ] Sign all lots, rebuild `lots.json`, `npm run package`, drag the unzipped folder into Netlify Drop.
- [ ] Open the live link in a clean browser: lots show, Claim works for a fresh wallet.
- [ ] Post the supply, how much you hold, and how many lots are for sale. Say clearly: development fee + transfer cost + network fee.
- [ ] Pin the official link. Pin the line: "I will never DM first or ask for your seed phrase."

## Never

- Spend or move a lot's coin yourself while it is listed.
- Paste a seed phrase or private key anywhere (including to Claude or to anyone offering help).
- Announce "live" before the Gate is ticked.
