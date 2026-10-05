// Read-only chain data from the free mempool.space API, plus the UniSat chain names.
export type NetName = "mainnet" | "testnet4" | "signet";
export type Config = { network: NetName; tick: string; siteName: string; maxSupply?: string; disclosure?: string[] };

const API: Record<NetName, string> = {
  mainnet: "https://mempool.space/api",
  testnet4: "https://mempool.space/testnet4/api",
  signet: "https://mempool.space/signet/api",
};
const EXPLORER: Record<NetName, string> = {
  mainnet: "https://mempool.space",
  testnet4: "https://mempool.space/testnet4",
  signet: "https://mempool.space/signet",
};
export const UNISAT_CHAIN: Record<NetName, string> = {
  mainnet: "BITCOIN_MAINNET",
  testnet4: "BITCOIN_TESTNET4",
  signet: "BITCOIN_SIGNET",
};

export const explorerTx = (n: NetName, txid: string) => `${EXPLORER[n]}/tx/${txid}`;

async function get<T>(n: NetName, path: string): Promise<T> {
  const r = await fetch(API[n] + path);
  if (!r.ok) throw new Error(`mempool.space ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function isSpent(n: NetName, txid: string, vout: number): Promise<boolean> {
  const o = await get<{ spent: boolean }>(n, `/tx/${txid}/outspend/${vout}`);
  return o.spent;
}

export async function getOutput(n: NetName, txid: string, vout: number) {
  const tx = await get<{ vout: { scriptpubkey: string; scriptpubkey_address: string; value: number }[] }>(n, `/tx/${txid}`);
  const o = tx.vout[vout];
  if (!o) throw new Error("That output does not exist");
  return { value: o.value, scriptPk: o.scriptpubkey, address: o.scriptpubkey_address };
}

export async function feeRate(n: NetName): Promise<number> {
  const f = await get<{ halfHourFee: number }>(n, "/v1/fees/recommended");
  return Math.max(1, Math.ceil(f.halfHourFee));
}

// Broadcast a raw transaction through the public explorer API (same approach other UniSat integrations use).
export async function broadcast(n: NetName, rawHex: string): Promise<string> {
  const r = await fetch(API[n] + "/tx", { method: "POST", body: rawHex });
  const body = await r.text();
  if (!r.ok) throw new Error(`Broadcast failed: ${body}`);
  return body.trim();
}

export async function addressUtxos(n: NetName, address: string) {
  const list = await get<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }[]>(n, `/address/${address}/utxo`);
  return list.filter((u) => u.status.confirmed);
}

// Current BTC price in USD (mainnet price feed; used only for the seller's price calculator).
export async function btcUsd(): Promise<number> {
  const p = await get<{ USD: number }>("mainnet", "/v1/prices");
  return p.USD;
}
