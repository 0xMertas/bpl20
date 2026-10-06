// Turns signed-lots.jsonl (from admin.html) into lots.json for the site.
//   npm run lots -- signed-lots.jsonl [more.jsonl ...]
// Every signature is verified offline; bad or duplicate lots are skipped and reported.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as bitcoin from "bitcoinjs-lib";
import { networkFor, readSignedListing, verifyListing, type Lot } from "../src/psbt";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npm run lots -- signed-lots.jsonl [more.jsonl ...]");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
const net = networkFor(process.env.NETWORK ?? cfg.network); // NETWORK env overrides config (used by tests)

const lots = new Map<string, Lot>();
let bad = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).forEach((line, n) => {
    try {
      const { tick, amt, psbt, devFee } = JSON.parse(line);
      if (devFee !== undefined && !(Number.isInteger(devFee) && devFee >= 0)) throw new Error("bad devFee");
      if (!/^\d+$/.test(amt)) throw new Error("bad amt");
      if (!verifyListing(psbt, net)) throw new Error("signature does not verify");
      const l = readSignedListing(psbt, net);
      const key = `${l.utxo.txid}:${l.utxo.vout}`;
      if (lots.has(key)) throw new Error("duplicate coin");
      lots.set(key, {
        id: `${tick}-${l.utxo.txid.slice(0, 8)}-${l.utxo.vout}`,
        tick, amt, price: l.price, devFee: devFee !== undefined ? Math.min(devFee, l.price) : undefined,
        seller: bitcoin.address.fromOutputScript(l.sellerScript, net),
        utxo: l.utxo, psbt,
      });
    } catch (e: any) {
      bad++;
      console.error(`${f}:${n + 1} skipped: ${e.message}`);
    }
  });
}
const out = [...lots.values()].sort((a, b) => a.price - b.price);
writeFileSync(process.env.LOTS_OUT ?? join(root, "lots.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote lots.json with ${out.length} lot(s), ${bad} skipped`);
