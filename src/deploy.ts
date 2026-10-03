import { deployed, parseAmt } from "./state";

export type DeployOp = { p: string; op: string; tick: string; max?: string; lim?: string };

export function applyDeploy(op: DeployOp) {
  if (op.p !== "bpl20" || op.op !== "deploy") return;
  if (deployed.has(op.tick)) return; // first deploy wins
  const max = parseAmt(op.max);
  const lim = parseAmt(op.lim);
  if (max === null || lim === null) return;
  if (max === 0n || lim === 0n) return;
  deployed.set(op.tick, { max, lim });
}
