import * as bitcoin from "bitcoinjs-lib";
import { feeRate, isSpent, explorerTx, type Config } from "./chain";
import { buildBuyPsbt, finalizeAndExtract, networkFor, type Lot } from "./psbt";
import { connect, plainUtxos, unisat } from "./wallet";

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
    const [utxos, rate] = await Promise.all([plainUtxos(), feeRate(cfg.network)]);
    const plan = buildBuyPsbt(lot, { ...me, utxos }, rate, net);
    if (!confirm(`Pay ${lot.price} sats + ${plan.fee} sats network fee (${plan.total} total) for ${lot.amt} ${lot.tick}?`)) {
      return say("Cancelled.");
    }
    say("Approve the transaction in UniSat...");
    const signedHex = await unisat().signPsbt(plan.psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: plan.buyerInputIndexes.map((index) => ({ index, address: me!.address })),
    });
    const { hex, txid } = finalizeAndExtract(bitcoin.Psbt.fromHex(signedHex, { network: net }));
    say("Broadcasting...");
    const u = unisat();
    if (u.pushTx) await u.pushTx({ rawtx: hex });
    else throw new Error("Wallet cannot broadcast. Update UniSat.");
    $("status").innerHTML = `Done! Your transfer inscription is on its way. <a href="${explorerTx(cfg.network, txid)}" target="_blank" rel="noopener">View transaction</a>`;
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

  $("connect").onclick = async () => {
    try {
      me = await connect(cfg.network);
      $("connect").textContent = me.address.slice(0, 8) + "..." + me.address.slice(-6);
      say("Wallet connected.");
    } catch (e: any) {
      say(e?.message ?? String(e), true);
    }
  };
  $("prepare").onclick = prepare;

  $("disclosure").innerHTML = (cfg.disclosure ?? []).map((t) => `<p>${t.replace(/</g, "&lt;")}</p>`).join("");
  const lots: Lot[] = await (await fetch("lots.json", { cache: "no-store" })).json();
  const box = $("lots");
  box.textContent = lots.length ? "" : "No lots are available right now. Follow the official account for the next release.";
  for (const lot of lots) {
    const card = document.createElement("div");
    card.className = "lot";
    const perTok = lot.price / Number(lot.amt);
    card.innerHTML = `<b>${Number(lot.amt).toLocaleString()} ${lot.tick}</b><span>${lot.price.toLocaleString()} sats<span class="price-tok">${perTok.toFixed(perTok < 1 ? 3 : 1)} sats / token + network fee</span></span>`;
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
