// Lot pricing: price = your cost to create the lot + your profit.
// Cost model (atomic claim): one transfer inscription (~350 vB at the fee rate you pay) + 546 sats postage that goes to the buyer.
export const INSCRIBE_VB = 350;
export const POSTAGE = 546;

export const lotCostSats = (feeRate: number) => Math.ceil(INSCRIBE_VB * feeRate) + POSTAGE;
export const usdToSats = (usd: number, btcUsd: number) => Math.ceil((usd / btcUsd) * 1e8);
export const satsToUsd = (sats: number, btcUsd: number) => (sats / 1e8) * btcUsd;

export function suggestPrice(feeRate: number, btcUsd: number, profitUsd: number) {
  if (!(feeRate > 0) || !(btcUsd > 0) || !(profitUsd >= 0)) throw new Error("Enter positive fee rate, BTC price and profit");
  const cost = lotCostSats(feeRate);
  const profit = usdToSats(profitUsd, btcUsd);
  const price = cost + profit;
  return { cost, profit, price, costUsd: satsToUsd(cost, btcUsd), priceUsd: satsToUsd(price, btcUsd) };
}
