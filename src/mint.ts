import { Op, deployed, minted, balances, parseAmt } from "./state";

export function applyMint(op: Op, owner: string) {
  if (op.p !== "bpl20" || op.op !== "mint") return;
  const t = deployed.get(op.tick);
  let amt = parseAmt(op.amt);
  if (!t || amt === null || amt === 0n || amt > t.lim) return;

  const left = t.max - (minted.get(op.tick) ?? 0n);
  if (left <= 0n) return;
  if (amt > left) amt = left;

  minted.set(op.tick, (minted.get(op.tick) ?? 0n) + amt);
  const key = owner + ":" + op.tick;
  balances.set(key, (balances.get(key) ?? 0n) + amt);
}
