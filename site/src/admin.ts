// Seller page: turn your transfer inscriptions into signed "lots". Run it yourself, locally or on the site.
// Your wallet signs; no key is ever typed here.
import * as bitcoin from "bitcoinjs-lib";
import { btcUsd, feeRate as fetchFee, getOutput, isSpent, type Config } from "./chain";
import { fixedPrice, lotCostSats, suggestPrice } from "./pricing";
import { SIGHASH_SINGLE_ACP, buildListingPsbt, lotFromSigned, networkFor, verifyListing, type Lot } from "./psbt";
import { connect, newestInscriptions, unisat } from "./wallet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cfg: Config;
let me: { address: string; pubkeyHex: string } | null = null;
const lines: string[] = [];

const say = (msg: string, bad = false) => {
  $("status").textContent = msg;
  $("status").className = bad ? "bad" : "";
};

async function sign(): Promise<boolean> {
  try {
    if (!me) throw new Error("Connect your wallet first.");
    const coins = $<HTMLTextAreaElement>("coin").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!coins.length) throw new Error("Enter at least one coin as txid:vout");
    const price = Number($<HTMLInputElement>("price").value);
    const amt = $<HTMLInputElement>("amt").value.trim();
    const payTo = $<HTMLInputElement>("payto").value.trim() || undefined;
    if (!/^\d+$/.test(amt) || !Number.isInteger(price) || price <= 0) throw new Error("Check amount and price");
    const rate = Number($<HTMLInputElement>("rate").value);
    if (!(rate > 0)) throw new Error("Enter the fee rate (sat/vB) you paid for the lots, so the development fee can be worked out");
    const devFee = Math.max(0, price - lotCostSats(rate)); // what is left of the price after your cost to prepare the lot
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
      lines.push(JSON.stringify({ tick: cfg.tick, amt, psbt: b64, coin: l.coin, devFee }));
    });
    $("out").textContent = lines.join("\n");
    $<HTMLButtonElement>("dl").disabled = false;
    $<HTMLButtonElement>("dllots").disabled = false;
    say(`${listings.length} lot(s) signed and verified (${lines.length} so far). Download when done.`);
    return true;
  } catch (e: any) {
    say(e?.message ?? String(e), true);
    return false;
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
  const updateSel = () => {
    const n = $<HTMLTextAreaElement>("coin").value.split("\n").map((l) => l.trim()).filter(Boolean).length;
    $("selcount").textContent = `${n} lot${n === 1 ? "" : "s"} selected`;
  };
  $("coin").addEventListener("input", updateSel);

  $("load").onclick = async () => {
    try {
      if (!me) throw new Error("Connect your wallet first.");
      say("Reading your newest inscriptions (read-only)...");
      const list = await newestInscriptions(12);
      const box = $("insclist");
      box.style.display = "block";
      box.innerHTML = "<b>Tap the transfer inscription(s) you just created (newest first):</b>";
      if (!list.length) box.append(" none found.");
      for (const i of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ghost";
        b.style.cssText = "display:block;margin:6px 0;width:100%;text-align:left";
        const ok = i.offset === 0;
        b.textContent = `#${i.number ?? "?"}  ${i.id.slice(0, 12)}...  coin ${i.coin.slice(0, 10)}...:${i.coin.split(":")[1]}${i.value ? `  (${i.value} sats)` : ""}${ok ? "" : "  - not on first sat, cannot use"}`;
        b.disabled = !ok;
        b.onclick = () => {
          const ta = $<HTMLTextAreaElement>("coin");
          if (!ta.value.split("\n").includes(i.coin)) ta.value = (ta.value ? ta.value.trim() + "\n" : "") + i.coin;
          updateSel();
          b.textContent = "added: " + b.textContent;
          b.disabled = true;
        };
        box.append(b);
      }
      say("Tap your transfer inscription to add it. Not sure which one? Check its content in UniSat: it must say \"op\":\"transfer\".");
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };

  $("dllots").onclick = async () => {
    try {
      const net = networkFor(cfg.network);
      let existing: Lot[] = [];
      try {
        existing = await (await fetch("lots.json", { cache: "no-store" })).json();
      } catch {}
      const byCoin = new Map<string, Lot>(existing.map((l) => [`${l.utxo.txid}:${l.utxo.vout}`, l]));
      for (const raw of lines) {
        const { tick, amt, psbt, devFee } = JSON.parse(raw);
        const lot = lotFromSigned({ tick, amt, psbt, devFee }, net);
        byCoin.set(`${lot.utxo.txid}:${lot.utxo.vout}`, lot);
      }
      const out = [...byCoin.values()].sort((a, b) => a.price - b.price);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" }));
      a.download = "lots.json";
      a.click();
      say(`lots.json has ${out.length} lot(s). Put it in your site folder, replacing the old lots.json, and refresh the claim page.`);
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };

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
  let fixedSats = 0;
  const recalcFixed = () => {
    try {
      const r = fixedPrice(Number($<HTMLInputElement>("fixed").value), Number($<HTMLInputElement>("rate").value), Number($<HTMLInputElement>("btc").value));
      fixedSats = r.price;
      const warn = r.profit <= 0 ? " LOSS: fees are too high for this price, wait for a lower fee rate." : r.profitUsd < 0.5 ? " Low profit: wait for a lower fee rate if you can." : "";
      $("fixedinfo").textContent = `Price ${r.price.toLocaleString()} sats. Your cost ${r.cost.toLocaleString()} sats ($${r.costUsd.toFixed(2)}). You keep ${r.profit.toLocaleString()} sats ($${r.profitUsd.toFixed(2)}).${warn}`;
    } catch (e: any) {
      fixedSats = 0;
      $("fixedinfo").textContent = e.message;
    }
  };
  for (const id of ["rate", "btc", "profit"]) $(id).addEventListener("input", recalc);
  for (const id of ["rate", "btc", "fixed"]) $(id).addEventListener("input", recalcFixed);
  $("usefixed").onclick = () => {
    if (fixedSats) $<HTMLInputElement>("price").value = String(fixedSats);
  };
  const mode = () => (document.querySelector('input[name="mode"]:checked') as HTMLInputElement).value;
  const readout = () => {
    $("readout").textContent = (mode() === "fixed" ? $("fixedinfo").textContent : $("suggest").textContent) ?? "";
  };
  for (const id of ["rate", "btc", "profit", "fixed"]) $(id).addEventListener("input", readout);
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", readout));
  $("go").onclick = async () => {
    try {
      recalc();
      recalcFixed();
      const sats = mode() === "fixed" ? fixedSats : suggested;
      if (!sats) throw new Error("The price has not loaded yet. Open Advanced and type the fee rate and the BTC price.");
      $<HTMLInputElement>("price").value = String(sats);
      if (!(await sign())) return;
      await ($("dllots") as any).onclick();
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };
  $("usesug").onclick = () => {
    if (suggested) $<HTMLInputElement>("price").value = String(suggested);
  };
  Promise.all([fetchFee(cfg.network === "mainnet" ? "mainnet" : cfg.network), btcUsd()])
    .then(([fee, usd]) => {
      $<HTMLInputElement>("rate").value = String(fee);
      $<HTMLInputElement>("btc").value = String(Math.round(usd));
      recalc();
      recalcFixed();
      readout();
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
