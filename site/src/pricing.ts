// Lot pricing: price = your cost to create the lot + your profit.
// Cost model (atomic claim): one transfer inscription (~350 vB at the fee rate you pay) + 546 sats postage that goes to the buyer.
export const INSCRIBE_VB = 350;
export const POSTAGE = 546;

export const lotCostSats = (feeRate: number) => Math.ceil(INSCRIBE_VB * feeRate) + POSTAGE;
export const usdToSats = (usd: number, btcUsd: number) => Math.round((usd * 1e8) / btcUsd);
export const satsToUsd = (sats: number, btcUsd: number) => (sats / 1e8) * btcUsd;

export function suggestPrice(feeRate: number, btcUsd: number, profitUsd: number) {
  if (!(feeRate > 0) || !(btcUsd > 0) || !(profitUsd >= 0)) throw new Error("Enter positive fee rate, BTC price and profit");
  const cost = lotCostSats(feeRate);
  const profit = usdToSats(profitUsd, btcUsd);
  const price = cost + profit;
  return { cost, profit, price, costUsd: satsToUsd(cost, btcUsd), priceUsd: satsToUsd(price, btcUsd) };
}

// Fixed USD price per lot (e.g. $2.20 for 1000 tokens): shows what you keep at the fee rate you paid.
export function fixedPrice(priceUsd: number, feeRate: number, btcUsd: number) {
  if (!(priceUsd > 0) || !(feeRate > 0) || !(btcUsd > 0)) throw new Error("Enter positive price, fee rate and BTC price");
  const price = usdToSats(priceUsd, btcUsd);
  const cost = lotCostSats(feeRate);
  const profit = price - cost;
  return { price, cost, profit, profitUsd: satsToUsd(profit, btcUsd), costUsd: satsToUsd(cost, btcUsd) };
}
