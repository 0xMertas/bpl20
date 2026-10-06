import * as bitcoin from "bitcoinjs-lib";
import { broadcast, feeRate, isSpent, explorerTx, type Config } from "./chain";
import { buildBuyPsbt, finalizeAndExtract, networkFor, type Lot } from "./psbt";
import { connect, existingAccount, hasWallet, onWalletChange, plainUtxos, unisat } from "./wallet";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cfg: Config;
let me: { address: string; pubkeyHex: string } | null = null;

const say = (msg: string, bad = false) => {
  const el = $("status");
  el.textContent = msg;
  el.className = bad ? "bad" : "";
};

async function claim(lot: Lot) {
  if (!me) return say("Connect your wallet first.", true);
  try {
    const net = networkFor(cfg.network);
    say("Checking the lot is still available...");
    if (await isSpent(cfg.network, lot.utxo.txid, lot.utxo.vout)) throw new Error("Sorry, this lot was just sold.");
    const [utxos, rate] = await Promise.all([plainUtxos(cfg.network, me.address), feeRate(cfg.network)]);
    const plan = buildBuyPsbt(lot, { ...me, utxos }, rate, net);
    const parts = lot.devFee !== undefined
      ? `${lot.devFee} sats development fee + ${lot.price - lot.devFee} sats transfer cost`
      : `${lot.price} sats (includes the development fee)`;
    if (!confirm(`Pay ${parts} + ${plan.fee} sats Bitcoin network fee = ${plan.total} sats total, for ${lot.amt} ${lot.tick}?`)) {
      return say("Cancelled.");
    }
    say("Approve the transaction in UniSat...");
    const signedHex = await unisat().signPsbt(plan.psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: plan.buyerInputIndexes.map((index) => ({ index, address: me!.address })),
    });
    const { hex, txid } = finalizeAndExtract(bitcoin.Psbt.fromHex(signedHex, { network: net }));
    say("Broadcasting...");
    const sentTxid = await broadcast(cfg.network, hex);
    $("status").innerHTML = `Done! Your transfer inscription is on its way. <a href="${explorerTx(cfg.network, sentTxid || txid)}" target="_blank" rel="noopener">View transaction</a>`;
    $("status").className = "";
  } catch (e: any) {
    say(e?.message ?? String(e), true);
  }
}

async function prepare() {
  if (!me) return say("Connect your wallet first.", true);
  try {
    say("Approve a 1000 sat payment to yourself in UniSat...");
    const txid = await unisat().sendBitcoin(me.address, 1000);
    say(`Prepared (tx ${txid.slice(0, 10)}...). Wait for 1 confirmation, then press Claim.`);
  } catch (e: any) {
    say(e?.message ?? String(e), true);
  }
}

async function main() {
  cfg = await (await fetch("config.json")).json();
  document.title = cfg.siteName;
  $("title").textContent = cfg.siteName;
  $("net").textContent = cfg.network === "mainnet" ? "" : `TEST MODE (${cfg.network}). No real money.`;

  const setMe = (w: { address: string; pubkeyHex: string } | null) => {
    me = w;
    $("connect").textContent = w ? w.address.slice(0, 8) + "..." + w.address.slice(-6) : "Connect UniSat";
  };
  $("connect").onclick = async () => {
    try {
      setMe(await connect(cfg.network));
      say("Wallet connected.");
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };
  if (!hasWallet()) {
    $("status").innerHTML = 'UniSat wallet not found. <a href="https://unisat.io/download" target="_blank" rel="noopener">Install UniSat</a>, then reload this page.';
  } else {
    existingAccount(cfg.network).then((w) => w && setMe(w));
    onWalletChange(async (what) => {
      setMe(null);
      say(what === "network" ? `Network changed. Press Connect UniSat to continue on ${cfg.network}.` : "Account changed. Press Connect UniSat to continue.");
    });
  }
  $("prepare").onclick = prepare;

  $("disclosure").innerHTML = (cfg.disclosure ?? []).map((t) => `<p>${t.replace(/</g, "&lt;")}</p>`).join("");
  const lots: Lot[] = await (await fetch("lots.json", { cache: "no-store" })).json();
  const box = $("lots");
  box.textContent = lots.length ? "" : "No lots are available right now. Follow the official account for the next release.";
  // One plain price line when every lot is the same (clean page), per-lot prices only if lots differ.
  const same = lots.length > 0 && lots.every((l) => l.price === lots[0].price && l.amt === lots[0].amt);
  if (same) {
    const l0 = lots[0];
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = cfg.showPrice === false
      ? `Each claim gives you ${Number(l0.amt).toLocaleString()} ${l0.tick}. Claiming requires a payment plus the Bitcoin network fee. The exact amount is shown to you before you approve, and again in your wallet.`
      : l0.devFee !== undefined
        ? `Each claim: ${Number(l0.amt).toLocaleString()} ${l0.tick} for ${l0.price.toLocaleString()} sats = ${l0.devFee.toLocaleString()} sats development fee (goes to the project creator) + ${(l0.price - l0.devFee).toLocaleString()} sats transfer cost (preparing your lot, depends on the mempool). You also pay your own Bitcoin network fee. You see the exact total before you approve.`
        : `Each claim: ${Number(l0.amt).toLocaleString()} ${l0.tick} for ${l0.price.toLocaleString()} sats. The price includes a development fee that goes to the project creator, plus the cost of preparing your lot. You also pay the Bitcoin network fee. You see the exact total before you approve.`;
    box.before(note);
  }
  for (const lot of lots) {
    const card = document.createElement("div");
    card.className = "lot";
    const perTok = lot.price / Number(lot.amt);
    card.innerHTML = same
      ? `<b>${Number(lot.amt).toLocaleString()} ${lot.tick}</b>`
      : `<b>${Number(lot.amt).toLocaleString()} ${lot.tick}</b><span>${lot.price.toLocaleString()} sats<span class="price-tok">${perTok.toFixed(perTok < 1 ? 3 : 1)} sats / token + network fee</span></span>`;
    const btn = document.createElement("button");
    btn.textContent = "Claim";
    btn.onclick = () => claim(lot);
    card.append(btn);
    box.append(card);
    isSpent(cfg.network, lot.utxo.txid, lot.utxo.vout)
      .then((sold) => {
        if (sold) {
          btn.disabled = true;
          btn.textContent = "Sold";
        }
      })
      .catch(() => {});
  }
}
main().catch((e) => say(e.message, true));
