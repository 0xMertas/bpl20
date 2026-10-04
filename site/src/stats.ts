import { parseHolders, parseToken } from "./stats-data";
import type { Config } from "./chain";

const API = "https://api.hiro.so/ordinals/v1/brc-20/tokens";
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const short = (a: string) => (a.length > 16 ? a.slice(0, 8) + "..." + a.slice(-6) : a);
const fmt = (s: string) => Number(s).toLocaleString("en-US", { maximumFractionDigits: 8 });

async function main() {
  const cfg: Config = await (await fetch("config.json")).json();
  const tick = (new URLSearchParams(location.search).get("tick") || cfg.tick).toLowerCase();
  $("title").textContent = `${tick.toUpperCase()} stats`;
  if (cfg.network !== "mainnet") {
    $("body").textContent =
      "Stats come from a public BRC-20 indexer, which only covers mainnet. This site is in test mode, so there is nothing to show yet.";
    return;
  }
  const r = await fetch(`${API}/${encodeURIComponent(tick)}`);
  if (r.status === 404) {
    $("body").textContent = `No BRC-20 token "${tick.toUpperCase()}" found yet. It appears after your deploy confirms and is indexed.`;
    return;
  }
  if (!r.ok) throw new Error(`Indexer error ${r.status}`);
  const t = parseToken(await r.json());
  const hr = await fetch(`${API}/${encodeURIComponent(tick)}/holders?limit=10`);
  const h = hr.ok ? parseHolders(await hr.json(), t.minted) : { total: t.holders ?? 0, holders: [] };

  $("body").innerHTML = `
    <div class="lot"><b>Max supply</b><span>${fmt(t.max)}</span></div>
    <div class="lot"><b>Minted</b><span>${fmt(t.minted)}${t.percentMinted != null ? ` (${t.percentMinted.toFixed(2)}%)` : ""}</span></div>
    ${t.mintLimit ? `<div class="lot"><b>Limit per mint</b><span>${fmt(t.mintLimit)}</span></div>` : ""}
    <div class="lot"><b>Holders</b><span>${(t.holders ?? h.total).toLocaleString()}</span></div>
    <h2>Top holders</h2>
    ${h.holders.map((x, i) => `<div class="lot"><b>${i + 1}. ${short(x.address)}</b><span>${fmt(x.balance)}${x.percent != null ? ` (${x.percent.toFixed(2)}%)` : ""}</span></div>`).join("") || "<p>No holder data.</p>"}
    <small>Data from the Hiro Ordinals indexer. Balances can lag a few blocks behind the chain.</small>`;
}
main().catch((e) => {
  $("body").textContent = e.message;
  $("body").className = "bad";
});
