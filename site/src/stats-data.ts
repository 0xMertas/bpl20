// Pure parsing/formatting for the stats page (no network, so it is unit tested).
// Source: Hiro Ordinals API (free, no key, mainnet only):
//   GET /ordinals/v1/brc-20/tokens/{ticker}
//   GET /ordinals/v1/brc-20/tokens/{ticker}/holders?limit=N

export type TokenStats = {
  ticker: string;
  max: string;
  minted: string;
  mintLimit: string | null;
  holders: number | null;
  percentMinted: number | null;
};
export type Holder = { address: string; balance: string; percent: number | null };

// "21000000.000000000000000000" -> "21000000"
export function trimDecimal(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function parseToken(j: any): TokenStats {
  const t = j?.token;
  const s = j?.supply;
  if (!t?.ticker) throw new Error("Unexpected response from the indexer");
  const max = String(s?.max_supply ?? t.max_supply ?? "0");
  const minted = String(s?.minted_supply ?? t.minted_supply ?? "0");
  const m = Number(max);
  return {
    ticker: String(t.ticker),
    max: trimDecimal(max),
    minted: trimDecimal(minted),
    mintLimit: t.mint_limit != null ? trimDecimal(String(t.mint_limit)) : null,
    holders: typeof s?.holders === "number" ? s.holders : null,
    percentMinted: m > 0 ? Math.min(100, (Number(minted) / m) * 100) : null,
  };
}

export function parseHolders(j: any, minted: string): { total: number; holders: Holder[] } {
  const m = Number(minted);
  const rows: any[] = Array.isArray(j?.results) ? j.results : [];
  return {
    total: typeof j?.total === "number" ? j.total : rows.length,
    holders: rows.map((r) => ({
      address: String(r.address),
      balance: trimDecimal(String(r.overall_balance ?? r.balance ?? "0")),
      percent: m > 0 ? (Number(r.overall_balance ?? r.balance ?? 0) / m) * 100 : null,
    })),
  };
}
