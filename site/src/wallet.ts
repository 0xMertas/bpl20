// Thin wrapper over the UniSat browser extension (window.unisat). Keys never leave the wallet.
import * as bitcoin from "bitcoinjs-lib";
import { UNISAT_CHAIN, addressUtxos, type NetName } from "./chain";
import { networkFor } from "./psbt";
import type { OwnedUtxo } from "./psbt";

type Unisat = {
  requestAccounts(): Promise<string[]>;
  getPublicKey(): Promise<string>;
  getChain?(): Promise<{ enum: string }>;
  switchChain?(c: string): Promise<unknown>;
  getBitcoinUtxos?(): Promise<any[]>;
  getInscriptions?(cursor: number, size: number): Promise<{ list: any[]; total: number }>;
  signPsbt(hex: string, o?: { autoFinalized?: boolean; toSignInputs?: any[] }): Promise<string>;
  pushTx?(o: { rawtx: string }): Promise<string>;
  sendBitcoin(to: string, sats: number): Promise<string>;
};

export const unisat = (): Unisat => {
  const u = (window as any).unisat;
  if (!u) throw new Error("UniSat wallet not found. Install the UniSat extension and reload.");
  return u;
};

export async function connect(net: NetName) {
  const u = unisat();
  const [address] = await u.requestAccounts();
  if (u.switchChain && u.getChain) {
    const c = await u.getChain();
    if (c.enum !== UNISAT_CHAIN[net]) await u.switchChain(UNISAT_CHAIN[net]);
  }
  const pubkeyHex = await u.getPublicKey();
  return { address, pubkeyHex };
}

// Outpoints (txid:vout) that hold inscriptions, from the wallet's own inscription list.
async function inscribedOutpoints(): Promise<Set<string>> {
  const u = unisat();
  if (!u.getInscriptions) throw new Error("Please update the UniSat extension (cannot list inscriptions).");
  const out = new Set<string>();
  for (let cursor = 0, total = Infinity; cursor < total; cursor += 100) {
    const page = await u.getInscriptions(cursor, 100);
    total = page.total;
    for (const i of page.list) {
      const loc: string | undefined = i.location ?? i.output;
      if (!loc) throw new Error("Unexpected inscription data from wallet; refusing to continue to protect your inscriptions.");
      const [txid, vout] = loc.split(":");
      out.add(`${txid}:${vout}`);
    }
    if (!page.list.length) break;
  }
  return out;
}

// Plain spendable coins only (never a coin that may hold an inscription, rune or atomical).
export async function plainUtxos(net: NetName, address: string): Promise<OwnedUtxo[]> {
  const u = unisat();
  if (u.getBitcoinUtxos) {
    const list = await u.getBitcoinUtxos();
    return list
      .filter((x) => !(x.inscriptions?.length || x.atomicals?.length || x.runes?.length))
      .map((x) => ({ txid: x.txid, vout: x.vout, value: x.satoshis ?? x.value, scriptPk: x.scriptPk }));
  }
  // Fallback: confirmed coins from the explorer, minus anything the wallet says is inscribed, minus dust-sized coins.
  const script = bitcoin.address.toOutputScript(address, networkFor(net)).toString("hex");
  const bad = await inscribedOutpoints();
  return (await addressUtxos(net, address))
    .filter((c) => c.value >= 1000 && !bad.has(`${c.txid}:${c.vout}`))
    .map((c) => ({ txid: c.txid, vout: c.vout, value: c.value, scriptPk: script }));
}
