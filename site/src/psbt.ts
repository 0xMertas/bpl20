// Atomic-sale PSBT logic. No wallet or network code in here, so it can be unit tested.
//
// Layout of the final transaction (the order matters, see README):
//   inputs : [0] buyer "dummy" coin   [1] seller's inscription coin   [2..] buyer payment coins
//   outputs: [0] buyer (dummy + inscription coin)  [1] seller payment  [2] buyer change
// The seller signs input 1 with SIGHASH_SINGLE|ANYONECANPAY, which commits only to
// input 1 and output 1. The inscription is the first sat of input 1, so it lands in output 0.
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";

bitcoin.initEccLib(ecc);

export const SIGHASH_SINGLE_ACP =
  bitcoin.Transaction.SIGHASH_SINGLE | bitcoin.Transaction.SIGHASH_ANYONECANPAY; // 0x83
export const DUST = 546;

export type Utxo = { txid: string; vout: number; value: number };
export type OwnedUtxo = Utxo & { scriptPk: string }; // scriptPk = hex scriptPubKey

export type Lot = {
  id: string;
  tick: string;
  amt: string;
  price: number; // sats the seller receives
  devFee?: number; // part of price that is the development fee (the rest covers preparing the lot)
  seller: string; // seller address
  utxo: OwnedUtxo; // the coin carrying the transfer inscription (inscription on its first sat)
  psbt: string; // base64, seller-signed on input 1
};

const FAKE_TXID = "00".repeat(31) + "01"; // placeholder input at index 0 in the listing

function xonly(pubkeyHex: string): Buffer {
  const p = Buffer.from(pubkeyHex, "hex");
  return p.length === 33 ? p.subarray(1, 33) : p;
}

function kind(script: Buffer): "p2tr" | "p2wpkh" | null {
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) return "p2tr";
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) return "p2wpkh";
  return null;
}

// Unsigned listing PSBT. The seller wallet signs ONLY input 1 with sighash 0x83.
export function buildListingPsbt(a: {
  network: bitcoin.Network;
  seller: string;
  sellerPubkeyHex: string;
  utxo: OwnedUtxo;
  price: number;
  payTo?: string; // where the buyer's payment goes; defaults to the seller address
}): bitcoin.Psbt {
  const script = bitcoin.address.toOutputScript(a.seller, a.network);
  if (!script.equals(Buffer.from(a.utxo.scriptPk, "hex"))) {
    throw new Error("The inscription coin is not at the connected wallet address");
  }
  const k = kind(script);
  if (!k) throw new Error("Seller address must be taproot (bc1p/tb1p) or native segwit (bc1q/tb1q)");
  if (a.price < DUST) throw new Error("Price is below the dust limit");

  const psbt = new bitcoin.Psbt({ network: a.network });
  // placeholder input 0 (never signed, replaced by the buyer's dummy coin)
  psbt.addInput({ hash: FAKE_TXID, index: 0, witnessUtxo: { script, value: DUST } });
  const real: any = {
    hash: a.utxo.txid,
    index: a.utxo.vout,
    witnessUtxo: { script, value: a.utxo.value },
    sighashType: SIGHASH_SINGLE_ACP,
  };
  if (k === "p2tr") real.tapInternalKey = xonly(a.sellerPubkeyHex);
  psbt.addInput(real);
  psbt.addOutput({ script, value: DUST }); // placeholder output 0
  const payTo = a.payTo?.trim() || a.seller;
  bitcoin.address.toOutputScript(payTo, a.network); // throws if the address is invalid for this network
  psbt.addOutput({ address: payTo, value: a.price }); // output 1 = the payment, signed over
  return psbt;
}

// Wallets sometimes finalize the input they sign; recover the raw signature from the witness.
function readWitness(w: Buffer): Buffer[] {
  let o = 0;
  const varint = () => {
    const b = w[o++];
    if (b < 0xfd) return b;
    if (b === 0xfd) { const v = w.readUInt16LE(o); o += 2; return v; }
    throw new Error("Unexpected witness encoding");
  };
  const n = varint();
  const items: Buffer[] = [];
  for (let i = 0; i < n; i++) { const l = varint(); items.push(w.subarray(o, o + l)); o += l; }
  return items;
}

// Pull the seller's signature (and everything needed to reuse it) out of a signed listing.
export function readSignedListing(psbtB64: string, network: bitcoin.Network) {
  const psbt = bitcoin.Psbt.fromBase64(psbtB64, { network });
  if (psbt.inputCount !== 2 || psbt.txOutputs.length !== 2) throw new Error("Not a listing PSBT");
  const inp = psbt.data.inputs[1];
  const tx = psbt.txInputs[1];
  if (!inp.witnessUtxo) throw new Error("Listing is missing witnessUtxo");
  let tapKeySig = inp.tapKeySig;
  let partialSig = inp.partialSig;
  if (!tapKeySig && !partialSig?.length && inp.finalScriptWitness) {
    const w = readWitness(inp.finalScriptWitness);
    if (w.length === 1) tapKeySig = w[0];
    else if (w.length === 2) partialSig = [{ pubkey: w[1], signature: w[0] }];
  }
  const sig = tapKeySig ?? partialSig?.[0]?.signature;
  if (!sig) throw new Error("Listing is not signed on input 1");
  if (sig[sig.length - 1] !== SIGHASH_SINGLE_ACP) throw new Error("Listing must use sighash 0x83");
  return {
    utxo: {
      txid: Buffer.from(tx.hash).reverse().toString("hex"),
      vout: tx.index,
      value: inp.witnessUtxo.value,
      scriptPk: inp.witnessUtxo.script.toString("hex"),
    } as OwnedUtxo,
    price: psbt.txOutputs[1].value,
    sellerScript: psbt.txOutputs[1].script,
    sig,
    tapKeySig,
    partialSig,
    tapInternalKey: inp.tapInternalKey,
    psbt,
  };
}

// True if the signature in a signed listing is valid for input 1.
export function verifyListing(psbtB64: string, network: bitcoin.Network): boolean {
  const l = readSignedListing(psbtB64, network);
  const psbt = l.psbt;
  if (!psbt.data.inputs[1].tapKeySig && !psbt.data.inputs[1].partialSig?.length) {
    psbt.updateInput(1, l.tapKeySig ? { tapKeySig: l.tapKeySig } : { partialSig: l.partialSig });
    delete (psbt.data.inputs[1] as any).finalScriptWitness;
  }
  const k = kind(psbt.data.inputs[1].witnessUtxo!.script);
  const validator =
    k === "p2tr"
      ? (pk: Buffer, h: Buffer, s: Buffer) => ecc.verifySchnorr(h, pk, s)
      : (pk: Buffer, h: Buffer, s: Buffer) => ecc.verify(h, pk, s);
  return psbt.validateSignaturesOfInput(1, validator);
}

export type Buyer = {
  address: string;
  pubkeyHex: string;
  utxos: OwnedUtxo[]; // plain coins with no inscriptions/runes, from the wallet
};

const VB = { p2wpkh: 68, p2tr: 58, out: 43, overhead: 11 };

export function estimateFee(buyerInputs: OwnedUtxo[], feeRate: number): number {
  let vb = VB.overhead + 58 /*seller input*/ + 3 * VB.out; // buyerInputs already includes the dummy coin
  for (const u of buyerInputs) vb += kind(Buffer.from(u.scriptPk, "hex")) === "p2tr" ? VB.p2tr : VB.p2wpkh;
  return Math.ceil(vb * feeRate);
}

export type BuyPlan = {
  psbt: bitcoin.Psbt;
  buyerInputIndexes: number[]; // inputs the buyer's wallet must sign
  total: number; // what the buyer spends from their coins in total, including fee
  fee: number;
};

export function buildBuyPsbt(lot: Lot, buyer: Buyer, feeRate: number, network: bitcoin.Network): BuyPlan {
  const listing = readSignedListing(lot.psbt, network);
  if (listing.utxo.txid !== lot.utxo.txid || listing.utxo.vout !== lot.utxo.vout || listing.price !== lot.price) {
    throw new Error("Lot data does not match its signed PSBT");
  }
  const buyerScript = bitcoin.address.toOutputScript(buyer.address, network);
  const bk = kind(buyerScript);
  if (!bk) throw new Error("Buyer address must be taproot or native segwit");
  for (const u of buyer.utxos) {
    if (!Buffer.from(u.scriptPk, "hex").equals(buyerScript)) throw new Error("Coin does not belong to buyer address");
  }

  // the dummy coin goes first and is returned to the buyer; pick the smallest usable one
  const sorted = [...buyer.utxos].filter((u) => u.value >= DUST).sort((x, y) => x.value - y.value);
  if (sorted.length < 2) {
    throw new Error("You need at least 2 plain coins in your wallet. Use 'Prepare wallet' first.");
  }
  const dummy = sorted[0];
  const pool = sorted.slice(1).sort((x, y) => y.value - x.value); // largest first

  const chosen: OwnedUtxo[] = [];
  let sum = 0;
  let fee = 0;
  for (const u of pool) {
    chosen.push(u);
    sum += u.value;
    fee = estimateFee([dummy, ...chosen], feeRate);
    if (sum >= lot.price + fee) break;
  }
  if (sum < lot.price + fee) throw new Error(`Not enough funds: need ${lot.price + fee} sats incl. fee`);

  let change = sum - lot.price - fee;
  if (change < DUST) {
    fee += change; // too small to be an output, goes to miners
    change = 0;
  }

  const psbt = new bitcoin.Psbt({ network });
  const addBuyerInput = (u: OwnedUtxo) => {
    const i: any = { hash: u.txid, index: u.vout, witnessUtxo: { script: buyerScript, value: u.value } };
    if (bk === "p2tr") i.tapInternalKey = xonly(buyer.pubkeyHex);
    psbt.addInput(i);
  };
  addBuyerInput(dummy); // 0
  const sellerIn: any = {
    hash: listing.utxo.txid,
    index: listing.utxo.vout,
    witnessUtxo: { script: Buffer.from(listing.utxo.scriptPk, "hex"), value: listing.utxo.value },
    sighashType: SIGHASH_SINGLE_ACP,
  };
  if (listing.tapKeySig) {
    sellerIn.tapKeySig = listing.tapKeySig;
    if (listing.tapInternalKey) sellerIn.tapInternalKey = listing.tapInternalKey;
  } else {
    sellerIn.partialSig = listing.partialSig;
  }
  psbt.addInput(sellerIn); // 1
  chosen.forEach(addBuyerInput); // 2..

  psbt.addOutput({ script: buyerScript, value: dummy.value + listing.utxo.value }); // 0: receives the inscription
  psbt.addOutput({ script: listing.sellerScript, value: listing.price }); // 1: seller gets paid
  if (change > 0) psbt.addOutput({ script: buyerScript, value: change }); // 2

  const buyerInputIndexes = [0, ...chosen.map((_, i) => i + 2)];
  return { psbt, buyerInputIndexes, total: lot.price + fee, fee };
}

// After the wallet has signed the buyer inputs (not finalized): finalize everything, return raw tx hex.
export function finalizeAndExtract(psbt: bitcoin.Psbt): { hex: string; txid: string; vsize: number } {
  psbt.data.inputs.forEach((inp, i) => {
    if (!inp.finalScriptWitness && !inp.finalScriptSig) psbt.finalizeInput(i);
  });
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId(), vsize: tx.virtualSize() };
}

export function networkFor(name: "mainnet" | "testnet4" | "signet"): bitcoin.Network {
  return name === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

// Build the lots.json entry for one signed listing (same data the lots CLI writes).
export function lotFromSigned(
  line: { tick: string; amt: string; psbt: string; devFee?: number },
  network: bitcoin.Network,
): Lot {
  if (!/^\d+$/.test(line.amt)) throw new Error("bad amt");
  if (!verifyListing(line.psbt, network)) throw new Error("signature does not verify");
  const l = readSignedListing(line.psbt, network);
  return {
    id: `${line.tick}-${l.utxo.txid.slice(0, 8)}-${l.utxo.vout}`,
    tick: line.tick,
    amt: line.amt,
    price: l.price,
    devFee: line.devFee !== undefined ? Math.min(line.devFee, l.price) : undefined,
    seller: bitcoin.address.fromOutputScript(l.sellerScript, network),
    utxo: l.utxo,
    psbt: line.psbt,
  };
}
