import { test } from "node:test";
import assert from "node:assert/strict";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import {
  buildListingPsbt, verifyListing, buildBuyPsbt, finalizeAndExtract, SIGHASH_SINGLE_ACP, type Lot, type OwnedUtxo,
} from "../src/psbt";

const ECPair = ECPairFactory(ecc);
const pub = (kp: any) => Buffer.from(kp.publicKey);
const net = bitcoin.networks.testnet;

const taggedHash = (tag: string, data: Buffer) => bitcoin.crypto.taggedHash(tag as any, data);
function tweakSigner(kp: any) {
  let priv = Buffer.from(kp.privateKey!);
  if (pub(kp)[0] === 3) priv = Buffer.from(ecc.privateNegate(priv));
  const xonly = pub(kp).subarray(1, 33);
  const tweak = taggedHash("TapTweak", xonly);
  const tweaked = Buffer.from(ecc.privateAdd(priv, tweak)!);
  const t = ECPair.fromPrivateKey(tweaked);
  return { publicKey: pub(t), sign: (h: Buffer) => Buffer.from(t.sign(h)), signSchnorr: (h: Buffer) => Buffer.from(t.signSchnorr(h)) };
}
const p2tr = (kp: any) => bitcoin.payments.p2tr({ internalPubkey: pub(kp).subarray(1, 33), network: net });
const p2wpkh = (kp: any) => bitcoin.payments.p2wpkh({ pubkey: pub(kp), network: net });
const hex32 = (n: number) => n.toString(16).padStart(64, "0");

function setup(buyerKind: "p2wpkh" | "p2tr") {
  const sellerKp = ECPair.makeRandom({ network: net });
  const buyerKp = ECPair.makeRandom({ network: net });
  const sellerPay = p2tr(sellerKp);
  const buyerPay = buyerKind === "p2tr" ? p2tr(buyerKp) : p2wpkh(buyerKp);
  const lotCoin: OwnedUtxo = { txid: hex32(11), vout: 0, value: 546, scriptPk: sellerPay.output!.toString("hex") };
  const mk = (n: number, value: number): OwnedUtxo => ({
    txid: hex32(100 + n), vout: 0, value, scriptPk: buyerPay.output!.toString("hex"),
  });
  return { sellerKp, buyerKp, sellerPay, buyerPay, lotCoin, mk };
}

function sellerSign(s: ReturnType<typeof setup>, price: number, payTo?: string): Lot {
  const psbt = buildListingPsbt({
    network: net, seller: s.sellerPay.address!, sellerPubkeyHex: pub(s.sellerKp).toString("hex"),
    utxo: s.lotCoin, price, payTo,
  });
  psbt.signInput(1, tweakSigner(s.sellerKp), [SIGHASH_SINGLE_ACP]);
  return {
    id: "lot-1", tick: "ABCDE", amt: "1000", price, seller: s.sellerPay.address!, utxo: s.lotCoin, psbt: psbt.toBase64(),
  };
}

for (const kind of ["p2wpkh", "p2tr"] as const) {
  test(`full sale, buyer is ${kind}`, () => {
    const s = setup(kind);
    const price = 20000;
    const lot = sellerSign(s, price);
    assert.ok(verifyListing(lot.psbt, net), "seller signature valid");

    const buyer = {
      address: s.buyerPay.address!, pubkeyHex: pub(s.buyerKp).toString("hex"),
      utxos: [s.mk(1, 1000), s.mk(2, 15000), s.mk(3, 30000)],
    };
    const plan = buildBuyPsbt(lot, buyer, 5, net);

    // wallet signs the buyer inputs only
    const signer: any = kind === "p2tr" ? tweakSigner(s.buyerKp) : { publicKey: pub(s.buyerKp), sign: (h: Buffer) => Buffer.from(s.buyerKp.sign(h)) };
    for (const i of plan.buyerInputIndexes) plan.psbt.signInput(i, signer);
    assert.ok(plan.psbt.validateSignaturesOfInput(1, (pk, h, sg) => ecc.verifySchnorr(h, pk, sg)), "seller sig still valid in final tx");
    const { hex, vsize } = finalizeAndExtract(plan.psbt);
    const tx = bitcoin.Transaction.fromHex(hex);

    // ordinal flow: first sat of the lot coin sits at offset = dummy value (1000) in the input stream
    const inscriptionOffset = plan.psbt.data.inputs[0].witnessUtxo!.value;
    assert.equal(tx.outs[0].value, inscriptionOffset + 546);
    assert.ok(inscriptionOffset < tx.outs[0].value, "inscription sat lands in output 0");
    assert.ok(tx.outs[0].script.equals(s.buyerPay.output!), "output 0 is the buyer");
    assert.ok(tx.outs[1].script.equals(s.sellerPay.output!) && tx.outs[1].value === price, "seller gets the price");

    const inSum = plan.psbt.data.inputs.reduce((a, i) => a + i.witnessUtxo!.value, 0);
    const outSum = tx.outs.reduce((a, o) => a + o.value, 0);
    assert.equal(inSum - outSum, plan.fee);
    assert.ok(plan.fee / vsize >= 4.9 && plan.fee / vsize < 5.6, `fee rate close to the 5 sat/vB asked: ${plan.fee / vsize}`);
  });
}

test("tampered price breaks the seller signature", () => {
  const s = setup("p2wpkh");
  const lot = sellerSign(s, 20000);
  const lie = { ...lot, price: 1 };
  const buyer = { address: s.buyerPay.address!, pubkeyHex: pub(s.buyerKp).toString("hex"), utxos: [s.mk(1, 1000), s.mk(2, 5000)] };
  assert.throws(() => buildBuyPsbt(lie, buyer, 5, net), /does not match/);
});

test("changing output 1 after signing invalidates the signature", () => {
  const s = setup("p2wpkh");
  const lot = sellerSign(s, 20000);
  const p = bitcoin.Psbt.fromBase64(lot.psbt, { network: net });
  (p as any).__CACHE.__TX.outs[1].value = 1; // simulate a buyer shaving the price
  assert.equal(p.validateSignaturesOfInput(1, (pk, h, sg) => ecc.verifySchnorr(h, pk, sg)), false);
});

test("needs 2 coins and enough funds", () => {
  const s = setup("p2wpkh");
  const lot = sellerSign(s, 20000);
  const base = { address: s.buyerPay.address!, pubkeyHex: pub(s.buyerKp).toString("hex") };
  assert.throws(() => buildBuyPsbt(lot, { ...base, utxos: [s.mk(1, 50000)] }, 5, net), /at least 2/);
  assert.throws(() => buildBuyPsbt(lot, { ...base, utxos: [s.mk(1, 1000), s.mk(2, 5000)] }, 5, net), /Not enough/);
});

test("listing for a coin at someone else's address is refused", () => {
  const s = setup("p2wpkh");
  assert.throws(() => buildListingPsbt({
    network: net, seller: s.buyerPay.address!, sellerPubkeyHex: pub(s.buyerKp).toString("hex"), utxo: s.lotCoin, price: 20000,
  }), /not at the connected/);
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("build-lots CLI keeps valid lots and skips bad/duplicate ones", () => {
  const s = setup("p2wpkh");
  const good = sellerSign(s, 20000);
  const dir = mkdtempSync(join(tmpdir(), "lots-"));
  const f = join(dir, "signed.jsonl");
  const bad = { tick: "ABCDE", amt: "1000", psbt: good.psbt.slice(0, -8) + "AAAAAAAA" };
  writeFileSync(f, [
    JSON.stringify({ tick: "ABCDE", amt: "1000", psbt: good.psbt, devFee: 1200 }),
    JSON.stringify({ tick: "ABCDE", amt: "1000", psbt: good.psbt }), // duplicate
    JSON.stringify(bad),
  ].join("\n"));
  const out = join(dir, "lots.json");
  execFileSync(process.execPath, [join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/build-lots.ts", f], { env: { ...process.env, LOTS_OUT: out, NETWORK: "testnet4" }, stdio: "pipe" });
  const lots = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(lots.length, 1);
  assert.equal(lots[0].price, 20000);
  assert.equal(lots[0].devFee, 1200);
  assert.equal(lots[0].seller, s.sellerPay.address);
});

test("profit can be paid to a different payout wallet", () => {
  const s = setup("p2wpkh");
  const profitKp = ECPair.makeRandom({ network: net });
  const profitPay = p2wpkh(profitKp);
  const lot = sellerSign(s, 20000, profitPay.address!);
  assert.ok(verifyListing(lot.psbt, net));
  const buyer = {
    address: s.buyerPay.address!, pubkeyHex: pub(s.buyerKp).toString("hex"),
    utxos: [s.mk(1, 1000), s.mk(2, 15000), s.mk(3, 30000)],
  };
  const plan = buildBuyPsbt(lot, buyer, 5, net);
  for (const i of plan.buyerInputIndexes) plan.psbt.signInput(i, { publicKey: pub(s.buyerKp), sign: (h: Buffer) => Buffer.from(s.buyerKp.sign(h)) } as any);
  const tx = bitcoin.Transaction.fromHex(finalizeAndExtract(plan.psbt).hex);
  assert.ok(tx.outs[1].script.equals(profitPay.output!), "payment goes to the payout wallet");
  assert.equal(tx.outs[1].value, 20000);
  assert.throws(() => buildListingPsbt({ network: net, seller: s.sellerPay.address!, sellerPubkeyHex: pub(s.sellerKp).toString("hex"), utxo: s.lotCoin, price: 20000, payTo: "bc1qnotavalidaddress" }), /./);
});

import { suggestPrice, lotCostSats } from "../src/pricing";
test("price calculator: cost + profit follows the fee rate", () => {
  assert.equal(lotCostSats(5), 350 * 5 + 546);
  const lo = suggestPrice(2, 100000, 1.2);
  assert.equal(lo.cost, 1246);
  assert.equal(lo.profit, 1200);
  assert.equal(lo.price, 2446);
  const hi = suggestPrice(10, 100000, 1.2);
  assert.ok(hi.price > lo.price, "price rises with the mempool");
  assert.throws(() => suggestPrice(0, 100000, 1.2));
});

import { fixedPrice } from "../src/pricing";
test("fixed $2.20 price: profit depends on the fee rate", () => {
  const lo = fixedPrice(2.2, 2, 100000);
  assert.equal(lo.price, 2200);
  assert.equal(lo.cost, 1246);
  assert.equal(lo.profit, 954);
  assert.ok(fixedPrice(2.2, 10, 100000).profit < 0, "loss when the mempool is busy");
});

import { contentFromRevealTx, parseEnvelope } from "../src/inscription";
function revealTx(json: string, contentType = "text/plain;charset=utf-8") {
  const script = bitcoin.script.compile([
    Buffer.alloc(32, 7), bitcoin.opcodes.OP_CHECKSIG, bitcoin.opcodes.OP_FALSE, bitcoin.opcodes.OP_IF,
    Buffer.from("ord"), Buffer.from([1]), Buffer.from(contentType), bitcoin.opcodes.OP_0, Buffer.from(json), bitcoin.opcodes.OP_ENDIF,
  ]);
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 1), 0);
  tx.addOutput(Buffer.from("5120" + "11".repeat(32), "hex"), 330);
  tx.setWitness(0, [Buffer.alloc(64, 2), script, Buffer.alloc(33, 3)]);
  return { hex: tx.toHex(), txid: tx.getId() };
}
test("reads inscription content from a reveal transaction", () => {
  const deploy = '{"p":"brc-20","op":"deploy","tick":"WORLDX","max":"21000000","self_mint":"true"}';
  const t = revealTx(deploy);
  const c = contentFromRevealTx(t.hex, t.txid + "i0");
  assert.ok(c);
  assert.equal(c!.contentType, "text/plain;charset=utf-8");
  assert.equal(JSON.parse(c!.body).op, "deploy");
  const tr = revealTx('{"p":"brc-20","op":"transfer","tick":"WORLDX","amt":"1000"}');
  assert.equal(JSON.parse(contentFromRevealTx(tr.hex, tr.txid + "i0")!.body).op, "transfer");
  assert.equal(contentFromRevealTx(t.hex, "nonsense"), null);
  assert.equal(parseEnvelope(Buffer.from([0x51])), null);
});

import { lotCostSats as lotCost2, suggestPrice as suggest2 } from "../src/pricing";
test("real UniSat inscribe-page cost model (mint order: 700 + 330 + 3150 = 4180 sats at 2 sat/vB)", () => {
  const m = { vbytes: 350, postage: 330, serviceFee: 3150 };
  assert.equal(lotCost2(2, m), 4180);
  const r = suggest2(2, 85544, 1.2, m);
  assert.equal(r.cost, 4180);
  assert.equal(r.price, 4180 + 1403);
});
