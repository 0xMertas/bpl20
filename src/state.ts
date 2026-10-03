// state.ts  -  everything the indexer remembers
export type Op = { p: string; op: string; tick: string; amt?: string };

export const deployed = new Map<string, { max: bigint; lim: bigint }>();
export const minted = new Map<string, bigint>();
export const balances = new Map<string, bigint>();

export function parseAmt(s?: string): bigint | null {
  return s && /^\d+$/.test(s) ? BigInt(s) : null;
}

// Clears all state. Used by the tests.
export function resetState() {
  deployed.clear();
  minted.clear();
  balances.clear();
}
