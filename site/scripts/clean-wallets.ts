// Cleans a wallet-submission list.
//   npx tsx scripts/clean-wallets.ts submissions.csv
// Input: CSV with a header row. It looks for a column containing "handle"/"user"/"x" and one containing "address"/"wallet".
// Output: clean.csv (valid, unique rows) and rejected.csv (with the reason). Nothing is sent anywhere.
import { readFileSync, writeFileSync } from "node:fs";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";

bitcoin.initEccLib(ecc);
const file = process.argv[2];
if (!file) { console.error("usage: npx tsx scripts/clean-wallets.ts submissions.csv"); process.exit(1); }

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function validMainnet(addr: string): boolean {
  try { bitcoin.address.toOutputScript(addr.trim(), bitcoin.networks.bitcoin); return /^(bc1|[13])/.test(addr.trim()); } catch { return false; }
}
// Handles like name_001 .. name_157 (same stem + a counter) are the typical bot pattern.
export const handleStem = (h: string) => h.toLowerCase().replace(/^@/, "").replace(/[_\-.]?\d+$/, "");

const rows = parseCsv(readFileSync(file, "utf8"));
const head = rows[0].map((x) => x.toLowerCase());
const hi = head.findIndex((x) => /handle|user|^x$|twitter/.test(x));
const ai = head.findIndex((x) => /address|wallet|bc1/.test(x));
if (hi < 0 || ai < 0) { console.error(`Could not find the handle/address columns in: ${rows[0].join(" | ")}`); process.exit(1); }
const data = rows.slice(1).map((r) => ({ handle: (r[hi] ?? "").trim(), address: (r[ai] ?? "").trim() }));

const stemCount = new Map<string, number>();
for (const d of data) { const s = handleStem(d.handle); if (/\d+$/.test(d.handle.replace(/^@/, ""))) stemCount.set(s, (stemCount.get(s) ?? 0) + 1); }

const seenAddr = new Set<string>(), seenHandle = new Set<string>();
const clean: typeof data = [], rejected: (typeof data[number] & { reason: string })[] = [];
for (const d of data) {
  const h = d.handle.toLowerCase().replace(/^@/, "");
  let reason = "";
  if (!h) reason = "missing handle";
  else if (!validMainnet(d.address)) reason = "not a valid Bitcoin mainnet address";
  else if (seenAddr.has(d.address)) reason = "duplicate address";
  else if (seenHandle.has(h)) reason = "duplicate handle";
  else if ((stemCount.get(handleStem(d.handle)) ?? 0) >= 5 && /\d+$/.test(h)) reason = "numbered bot-style handle";
  if (reason) rejected.push({ ...d, reason });
  else { clean.push(d); seenAddr.add(d.address); seenHandle.add(h); }
}
writeFileSync("clean.csv", "handle,address\n" + clean.map((d) => `${esc(d.handle)},${esc(d.address)}`).join("\n") + "\n");
writeFileSync("rejected.csv", "handle,address,reason\n" + rejected.map((d) => `${esc(d.handle)},${esc(d.address)},${esc(d.reason)}`).join("\n") + "\n");
console.log(`rows: ${data.length} | clean: ${clean.length} | rejected: ${rejected.length}`);
const by = new Map<string, number>(); for (const r of rejected) by.set(r.reason, (by.get(r.reason) ?? 0) + 1);
for (const [k, v] of by) console.log(`  ${v} x ${k}`);
