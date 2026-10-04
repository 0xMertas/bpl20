// Thin wrapper over the UniSat browser extension (window.unisat). Keys never leave the wallet.
import { UNISAT_CHAIN, type NetName } from "./chain";
import type { OwnedUtxo } from "./psbt";

type Unisat = {
  requestAccounts(): Promise<string[]>;
  getPublicKey(): Promise<string>;
  getChain?(): Promise<{ enum: string }>;
  switchChain?(c: string): Promise<unknown>;
  getBitcoinUtxos?(): Promise<any[]>;
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

// Plain spendable coins only. UniSat already leaves out coins that hold inscriptions or runes.
export async function plainUtxos(): Promise<OwnedUtxo[]> {
  const u = unisat();
  if (!u.getBitcoinUtxos) throw new Error("Please update the UniSat extension (getBitcoinUtxos is missing).");
  const list = await u.getBitcoinUtxos();
  return list
    .filter((x) => !(x.inscriptions?.length || x.atomicals?.length || x.runes?.length))
    .map((x) => ({ txid: x.txid, vout: x.vout, value: x.satoshis ?? x.value, scriptPk: x.scriptPk }));
}
