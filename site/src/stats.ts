// Public stats page: facts from this site's own data plus the chain (no third-party token indexer needed).
import { explorerTx, isSpent, type Config } from "./chain";
import type { Lot } from "./psbt";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const num = (n: number | string) => Number(n).toLocaleString("en-US");

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  return out;
}

async function main() {
  const cfg: Config & { deployTxid?: string } = await (await fetch("config.json")).json();
  const lots: Lot[] = await (await fetch("lots.json", { cache: "no-store" })).json();
  $("title").textContent = `${cfg.tick} stats`;

  const per = lots[0] ? Number(lots[0].amt) : 1000;
  const sold = (await mapLimit(lots, 8, (l) => isSpent(cfg.network, l.utxo.txid, l.utxo.vout).catch(() => false))).filter(Boolean).length;
  const row = (a: string, b: string) => `<div class="lot"><b>${a}</b><span>${b}</span></div>`;
  $("body").innerHTML =
    row("Ticker", cfg.tick) +
    (cfg.maxSupply ? row("Total supply", num(cfg.maxSupply)) : "") +
    row("Tokens per claim", num(per)) +
    row("Lots listed", num(lots.length)) +
    row("Lots claimed", num(sold)) +
    row("Lots still available", num(lots.length - sold)) +
    row("Tokens claimed so far", num(sold * per)) +
    (cfg.deployTxid ? `<p><a href="${explorerTx(cfg.network, cfg.deployTxid)}" target="_blank" rel="noopener">View the deploy transaction</a></p>` : "") +
    `<small>Numbers come from this site's lot list and the Bitcoin chain. The creator holds the rest of the supply.</small>`;
}
main().catch((e) => {
  $("body").textContent = e.message;
  $("body").className = "bad";
});
