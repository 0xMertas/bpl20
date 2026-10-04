import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHolders, parseToken, trimDecimal } from "../src/stats-data";

test("trimDecimal", () => {
  assert.equal(trimDecimal("21000000.000000000000000000"), "21000000");
  assert.equal(trimDecimal("1000.50"), "1000.5");
  assert.equal(trimDecimal("100"), "100");
});

test("parseToken + parseHolders on a documented-shape response", () => {
  const t = parseToken({
    token: { ticker: "ABCDE", mint_limit: "1000.000000000000000000", decimals: 18 },
    supply: { max_supply: "21000.000000000000000000", minted_supply: "5250.000000000000000000", holders: 42 },
  });
  assert.deepEqual([t.max, t.minted, t.mintLimit, t.holders, t.percentMinted], ["21000", "5250", "1000", 42, 25]);
  const h = parseHolders({ total: 42, results: [{ address: "bc1pxyz", overall_balance: "1050.000000000000000000" }] }, t.minted);
  assert.equal(h.total, 42);
  assert.equal(h.holders[0].balance, "1050");
  assert.equal(h.holders[0].percent, 20);
});

test("bad response is rejected, empty holders ok", () => {
  assert.throws(() => parseToken({ foo: 1 }), /Unexpected/);
  assert.deepEqual(parseHolders({}, "0").holders, []);
});
