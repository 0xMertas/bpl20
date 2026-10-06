import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { buildListingPsbt, SIGHASH_SINGLE_ACP } from "/home/user/bpl20/site/src/psbt";
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const net = bitcoin.networks.testnet;
const pub = (k: any) => Buffer.from(k.publicKey);
function tweak(kp: any) {
  let priv = Buffer.from(kp.privateKey);
  if (pub(kp)[0] === 3) priv = Buffer.from(ecc.privateNegate(priv)!);
  const t = ECPair.fromPrivateKey(Buffer.from(ecc.privateAdd(priv, bitcoin.crypto.taggedHash("TapTweak", pub(kp).subarray(1, 33)))!));
  return { publicKey: pub(t), sign: (h: Buffer) => Buffer.from(t.sign(h)), signSchnorr: (h: Buffer) => Buffer.from(t.signSchnorr(h)) };
}
const sellerKp = ECPair.makeRandom({ network: net }), buyerKp = ECPair.makeRandom({ network: net });
const sellerPay = bitcoin.payments.p2tr({ internalPubkey: pub(sellerKp).subarray(1, 33), network: net });
const buyerPay = bitcoin.payments.p2wpkh({ pubkey: pub(buyerKp), network: net });
const h = (n: number) => n.toString(16).padStart(64, "0");
const coin = { txid: h(11), vout: 0, value: 546, scriptPk: sellerPay.output!.toString("hex") };
const lp = buildListingPsbt({ network: net, seller: sellerPay.address!, sellerPubkeyHex: pub(sellerKp).toString("hex"), utxo: coin, price: 20000 });
lp.signInput(1, tweak(sellerKp) as any, [SIGHASH_SINGLE_ACP]);
const lots0 = [{ id: "x", tick: "WORLDX", amt: "1000", price: 20000, seller: sellerPay.address, utxo: coin, psbt: lp.toBase64() },
  { id: "y", tick: "WORLDX", amt: "5000", price: 90000, seller: sellerPay.address, utxo: { ...coin, txid: h(12) }, psbt: lp.toBase64() }];
const lots = [0,1,2,3,4].map((i) => ({ id: "l" + i, tick: "WORLDX", amt: "1000", price: 20000, devFee: 1200, seller: sellerPay.address, utxo: { ...coin, txid: h(50 + i) }, psbt: lp.toBase64() }));
const MODE = process.env.MODE;
const buyerUtxos = [1000, 15000, 30000].map((v, i) => ({ txid: h(100 + i), vout: 0, satoshis: v, scriptPk: buyerPay.output!.toString("hex"), inscriptions: [] }));

const root = "/home/user/bpl20/site";
const srv = http.createServer((q, r) => {
  const p = q.url === "/" ? "/index.html" : q.url!.split("?")[0];
  if (p === "/lots.json") return r.end(JSON.stringify(lots));
  if (p === "/config.json") return r.end(JSON.stringify({ network: "testnet4", tick: "WORLDX", siteName: "WORLDX claim", disclosure: [], showPrice: true, maxClaimsPerWallet: 3, claimFeeRate: 1.5 }));
  const f = join(root, p);
  if (!existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader("content-type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" }[extname(f)] ?? "text/plain");
  r.end(readFileSync(f));
}).listen(8099);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const page = await b.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
let pushed = "";
await page.route("https://mempool.space/**", (rt) => {
  const u = rt.request().url();
  let nReq = ((globalThis as any).__n = ((globalThis as any).__n ?? 0) + 1);
  if (/\/address\/[^/]+\/txs/.test(u)) return rt.fulfill({ json: MODE === "limit" ? [0, 1, 2].map((k) => ({ txid: h(900 + k), vin: [{ txid: h(50 + k), vout: 0 }] })) : [] });
  if (rt.request().method() === "POST" && u.endsWith("/tx")) { pushed = rt.request().postData() ?? ""; return rt.fulfill({ body: "txid-from-explorer" }); }
  if (u.includes("/outspend/")) { (globalThis as any).__outspend = ((globalThis as any).__outspend ?? 0) + 1; return rt.fulfill({ json: { spent: false } }); }
 // lot y is sold
  if (u.endsWith("/fees/recommended")) return rt.fulfill({ json: { halfHourFee: 5 } });
  return rt.fulfill({ status: 404 });
});
await page.exposeFunction("nodeSign", (hex: string, idx: number[]) => {
  const p = bitcoin.Psbt.fromHex(hex, { network: net });
  for (const i of idx) p.signInput(i, { publicKey: pub(buyerKp), sign: (x: Buffer) => Buffer.from(buyerKp.sign(x)) } as any);
  return p.toHex();
});
await page.exposeFunction("nodePush", (raw: string) => { pushed = raw; return "ok"; });
await page.addInitScript("window.__name = (f) => f;");
await page.addInitScript(({ addr, pk, utxos }) => {
  (window as any).confirm = () => true;
  (window as any).unisat = {
    requestAccounts: async () => [addr], getPublicKey: async () => pk,
    getChain: async () => ({ enum: "BITCOIN_TESTNET4" }), switchChain: async () => {},
    getBitcoinUtxos: async () => utxos,
    signPsbt: async (hex: string, o: any) => (window as any).nodeSign(hex, o.toSignInputs.map((x: any) => x.index)),
    pushTx: async ({ rawtx }: any) => (window as any).nodePush(rawtx),
  };
}, { addr: buyerPay.address!, pk: pub(buyerKp).toString("hex"), utxos: buyerUtxos });

await page.goto("http://localhost:8099/");
await page.waitForSelector(".lot button");
await page.waitForTimeout(1200);
console.log("cards:", await page.locator(".lot").count(), "| card text:", (await page.locator(".lot").first().innerText()).replace(/\n/g," | "));
console.log("lots rendered:", await page.locator(".lot").count(), "| sold button:", await page.locator(".lot button").nth(1).textContent());
await page.click("#connect"); await page.waitForTimeout(500); console.log("after connect:", await page.textContent("#status"), await page.textContent("#connect")); await page.waitForFunction(() => document.getElementById("connect")!.textContent!.includes("..."));
await page.waitForTimeout(1500);
console.log("status after connect:", await page.textContent("#status"), "| button:", await page.locator(".lot button").first().textContent());
if (MODE === "limit") { console.log("outspend lookups so far:", (globalThis as any).__outspend ?? 0); await b.close(); srv.close(); process.exit(0); }
await page.locator(".lot button").nth(0).click();
await page.waitForFunction(() => /Done|\w/.test(document.getElementById("status")!.textContent!) && !/Approve|Broadcasting|Checking/.test(document.getElementById("status")!.textContent!), null, { timeout: 15000 });
console.log("outspend lookups:", (globalThis as any).__outspend ?? 0);
console.log("status:", await page.textContent("#status"));
const tx = bitcoin.Transaction.fromHex(pushed);
console.log("pushed tx: inputs", tx.ins.length, "outputs", tx.outs.map((o) => o.value), "| seller paid:", tx.outs[1].script.equals(sellerPay.output!));
console.log("page errors:", errors);
await b.close(); srv.close();
