# Claim site (atomic BRC-20 sale)

A static site where a buyer connects UniSat, presses **Claim**, and in **one transaction** pays the seller and receives a BRC-20
transfer inscription. There is no server and no key anywhere in this repo: your wallet signs the lots, the buyer's wallet signs the purchase.

## How it works

Each lot is one BRC-20 **transfer inscription** that you already hold, plus your signature saying
"this coin goes to whoever pays me `price` sats". The signature (`SIGHASH_SINGLE|ANYONECANPAY`) covers only your coin and your payment,
so the buyer can add their own coins and cannot change the price. Final transaction:

| | inputs | outputs |
|---|---|---|
| 0 | buyer's spare ("dummy") coin | buyer: dummy + the inscription coin |
| 1 | **your inscription coin (signed by you)** | **you: the price** |
| 2+ | buyer's payment coins | buyer: change |

`src/psbt.ts` holds this logic; `test/psbt.test.ts` checks it with real signatures.

## Seller steps (all in your own wallet)

1. Deploy the 5-letter self-mint ticker and mint the supply to your wallet.
2. Inscribe transfer inscriptions for each lot (e.g. 1000, 5000, 10000 tokens). Wait for them to confirm.
3. Set `config.json` (`network`, `tick`). **Start with `testnet4`.**
4. Serve this folder (`npx serve .` or GitHub Pages) and open `admin.html`. Connect UniSat, enter each lot's `txid:vout`,
   token amount and price, press **Sign lot**. Download `signed-lots.jsonl`.
5. Run `npm install && npm run lots -- signed-lots.jsonl`. This verifies every signature and writes `lots.json`.
6. Commit `lots.json` and publish the folder (GitHub Pages: Settings > Pages > deploy from branch, folder `/site`).

A lot sells once. The page hides sold lots by checking whether the coin is spent (free mempool.space API).
Do **not** move a lot's coin yourself while it is listed, and keep it in the wallet you listed from.

## Price must cover fees

You pay the on-chain cost of each transfer inscription up front (~2.5k sats at 5 sat/vB, ~11k at 30). The buyer pays their network fee
on top of the price. Set the price above your inscription cost or you lose money on each sale.

## Buyer needs two coins

The transaction uses one small spare coin from the buyer. If their wallet has only one coin, the **Prepare wallet** button sends
1000 sats to themselves; after 1 confirmation they can claim.

## Develop

```
npm install
npm test            # signature + transaction tests, and the lots CLI
npm run typecheck
npm run build       # bundles src/ into js/ (commit js/ so GitHub Pages can serve it)
```

## Not verified against real hardware

Tested: transaction construction and signatures with real keys, the lots CLI, and the page in headless Chromium against a mocked
wallet and chain. **Not tested:** the real UniSat extension. The code relies on `window.unisat` methods `getBitcoinUtxos`, `signPsbt`
(with `toSignInputs`/`sighashTypes`/`autoFinalized`), `pushTx`, `switchChain` and chain name `BITCOIN_TESTNET4`; check them against the
current UniSat docs and run a full testnet purchase before using mainnet. Also confirm your transfer inscription sits on the
first sat of its coin (the normal case); the site assumes that.

## Safety

- Never put a private key or seed phrase in this repo, `config.json`, or any page. None is needed.
- Buyers can only be harmed by a lot that is not what it claims to be. Show the inscription id and check `lots.json` before publishing.
- Fees estimated by this code are slightly generous; the buyer sees the exact total before approving.
