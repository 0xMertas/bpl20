// Seller page: turn your transfer inscriptions into signed "lots". Run it yourself, locally or on the site.
// Your wallet signs; no key is ever typed here.
import * as bitcoin from "bitcoinjs-lib";
import { btcUsd, feeRate as fetchFee, getOutput, isSpent, type Config } from "./chain";
import { suggestPrice } from "./pricing";
import { SIGHASH_SINGLE_ACP, buildListingPsbt, networkFor, verifyListing } from "./psbt";
import { connect, unisat } from "./wallet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cfg: Config;
let me: { address: string; pubkeyHex: string } | null = null;
const lines: string[] = [];

const say = (msg: string, bad = false) => {
  $("status").textContent = msg;
  $("status").className = bad ? "bad" : "";
};

async function sign() {
  try {
    if (!me) throw new Error("Connect your wallet first.");
    const coins = $<HTMLTextAreaElement>("coin").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!coins.length) throw new Error("Enter at least one coin as txid:vout");
    const price = Number($<HTMLInputElement>("price").value);
    const amt = $<HTMLInputElement>("amt").value.trim();
    const payTo = $<HTMLInputElement>("payto").value.trim() || undefined;
    if (!/^\d+$/.test(amt) || !Number.isInteger(price) || price <= 0) throw new Error("Check amount and price");
    const seen = new Set(lines.map((l) => JSON.parse(l).coin));

    const net = networkFor(cfg.network);
    const listings: { coin: string; psbt: bitcoin.Psbt }[] = [];
    for (const [n, c] of coins.entries()) {
      const [txid, voutS] = c.split(":");
      const vout = Number(voutS);
      if (!/^[0-9a-f]{64}$/i.test(txid ?? "") || !Number.isInteger(vout)) throw new Error(`Line ${n + 1}: must look like txid:vout`);
      if (seen.has(c)) throw new Error(`Line ${n + 1}: already signed in this session`);
      say(`Checking coin ${n + 1} of ${coins.length} on chain...`);
      if (await isSpent(cfg.network, txid, vout)) throw new Error(`Line ${n + 1}: that coin is already spent.`);
      const out = await getOutput(cfg.network, txid, vout);
      listings.push({
        coin: c,
        psbt: buildListingPsbt({
          network: net, seller: me.address, sellerPubkeyHex: me.pubkeyHex,
          utxo: { txid, vout, value: out.value, scriptPk: out.scriptPk }, price, payTo,
        }),
      });
    }
    say("Approve in UniSat. It only signs the lots, it does not send anything.");
    const u = unisat() as any;
    const opts = { autoFinalized: false, toSignInputs: [{ index: 1, address: me.address, sighashTypes: [SIGHASH_SINGLE_ACP] }] };
    let signed: string[];
    if (typeof u.signPsbts === "function" && listings.length > 1) {
      signed = await u.signPsbts(listings.map((l) => l.psbt.toHex()), listings.map(() => opts));
    } else {
      signed = [];
      for (const [n, l] of listings.entries()) {
        say(`Approve lot ${n + 1} of ${listings.length} in UniSat...`);
        signed.push(await u.signPsbt(l.psbt.toHex(), opts));
      }
    }
    listings.forEach((l, n) => {
      const b64 = bitcoin.Psbt.fromHex(signed[n], { network: net }).toBase64();
      if (!verifyListing(b64, net)) throw new Error(`The wallet's signature for lot ${n + 1} did not verify. Nothing was saved.`);
      lines.push(JSON.stringify({ tick: cfg.tick, amt, psbt: b64, coin: l.coin }));
    });
    $("out").textContent = lines.join("\n");
    $<HTMLButtonElement>("dl").disabled = false;
    say(`${listings.length} lot(s) signed and verified (${lines.length} so far). Download when done.`);
  } catch (e: any) {
    say(e?.message ?? String(e), true);
  }
}

async function main() {
  cfg = await (await fetch("config.json")).json();
  $("net").textContent = cfg.network === "mainnet" ? "MAINNET: real money" : `TEST MODE (${cfg.network})`;
  $("connect").onclick = async () => {
    try {
      me = await connect(cfg.network);
      $("connect").textContent = me.address.slice(0, 8) + "..." + me.address.slice(-6);
      say("Wallet connected. This must be the wallet that holds the transfer inscriptions.");
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };
  const cfgPay = (cfg as any).payoutAddress as string | undefined;
  if (cfgPay) $<HTMLInputElement>("payto").value = cfgPay;
  $("sign").onclick = sign;

  let suggested = 0;
  const recalc = () => {
    try {
      const r = suggestPrice(
        Number($<HTMLInputElement>("rate").value),
        Number($<HTMLInputElement>("btc").value),
        Number($<HTMLInputElement>("profit").value),
      );
      suggested = r.price;
      $("suggest").textContent =
        `Your cost ${r.cost.toLocaleString()} sats ($${r.costUsd.toFixed(2)}) + profit ${r.profit.toLocaleString()} sats = suggested price ${r.price.toLocaleString()} sats ($${r.priceUsd.toFixed(2)}). The buyer also pays their own network fee.`;
    } catch (e: any) {
      suggested = 0;
      $("suggest").textContent = e.message;
    }
  };
  for (const id of ["rate", "btc", "profit"]) $(id).addEventListener("input", recalc);
  $("usesug").onclick = () => {
    if (suggested) $<HTMLInputElement>("price").value = String(suggested);
  };
  Promise.all([fetchFee(cfg.network === "mainnet" ? "mainnet" : cfg.network), btcUsd()])
    .then(([fee, usd]) => {
      $<HTMLInputElement>("rate").value = String(fee);
      $<HTMLInputElement>("btc").value = String(Math.round(usd));
      recalc();
    })
    .catch(() => ($("suggest").textContent = "Could not load live data. Type the fee rate and BTC price yourself."));
  $("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
    a.download = "signed-lots.jsonl";
    a.click();
  };
}
main().catch((e) => say(e.message, true));
