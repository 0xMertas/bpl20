// Seller page: turn your transfer inscriptions into signed "lots". Run it yourself, locally or on the site.
// Your wallet signs; no key is ever typed here.
import * as bitcoin from "bitcoinjs-lib";
import { getOutput, isSpent, type Config } from "./chain";
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
    const [txid, voutS] = $<HTMLInputElement>("coin").value.trim().split(":");
    const vout = Number(voutS);
    const price = Number($<HTMLInputElement>("price").value);
    const amt = $<HTMLInputElement>("amt").value.trim();
    const payTo = $<HTMLInputElement>("payto").value.trim() || undefined;
    if (!/^[0-9a-f]{64}$/i.test(txid ?? "") || !Number.isInteger(vout)) throw new Error("Coin must look like txid:vout");
    if (!/^\d+$/.test(amt) || !Number.isInteger(price) || price <= 0) throw new Error("Check amount and price");

    const net = networkFor(cfg.network);
    say("Checking the coin on chain...");
    if (await isSpent(cfg.network, txid, vout)) throw new Error("That coin is already spent.");
    const out = await getOutput(cfg.network, txid, vout);
    const psbt = buildListingPsbt({
      network: net, seller: me.address, sellerPubkeyHex: me.pubkeyHex,
      utxo: { txid, vout, value: out.value, scriptPk: out.scriptPk }, price, payTo,
    });
    say("Approve the signature in UniSat. It only signs the lot, it does not send anything.");
    const signedHex = await unisat().signPsbt(psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: [{ index: 1, address: me.address, sighashTypes: [SIGHASH_SINGLE_ACP] }],
    });
    const b64 = bitcoin.Psbt.fromHex(signedHex, { network: net }).toBase64();
    if (!verifyListing(b64, net)) throw new Error("The wallet's signature did not verify. Nothing was saved.");
    lines.push(JSON.stringify({ tick: cfg.tick, amt, psbt: b64 }));
    $("out").textContent = lines.join("\n");
    $<HTMLButtonElement>("dl").disabled = false;
    say(`Lot signed and verified (${lines.length} so far). Download when done.`);
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
  $("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
    a.download = "signed-lots.jsonl";
    a.click();
  };
}
main().catch((e) => say(e.message, true));
