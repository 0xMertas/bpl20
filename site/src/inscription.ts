// Reads an ordinals inscription's content straight from its reveal transaction (no indexer needed).
import * as bitcoin from "bitcoinjs-lib";

const OP_ENDIF = 104;
const OP_1 = 81;

// Parses the first "ord" envelope found in a taproot script.
export function parseEnvelope(script: Buffer): { contentType: string; body: Buffer } | null {
  const chunks = bitcoin.script.decompile(script);
  if (!chunks) return null;
  const at = chunks.findIndex((c) => Buffer.isBuffer(c) && c.toString() === "ord");
  if (at < 0) return null;
  let contentType = "";
  let body: Buffer[] = [];
  for (let i = at + 1; i < chunks.length; i++) {
    const c = chunks[i];
    if (c === OP_ENDIF) break;
    if (c === OP_1 || (Buffer.isBuffer(c) && c.length === 1 && c[0] === 1)) {
      const v = chunks[++i];
      if (Buffer.isBuffer(v)) contentType = v.toString();
    } else if (c === 0 || (Buffer.isBuffer(c) && c.length === 0)) {
      for (i++; i < chunks.length && chunks[i] !== OP_ENDIF; i++) {
        const b = chunks[i];
        if (Buffer.isBuffer(b)) body.push(b);
      }
      break;
    }
  }
  return { contentType, body: Buffer.concat(body) };
}

// id = "<txid>i<n>": reads the inscription from input n's tapscript witness of the reveal transaction.
export function contentFromRevealTx(rawHex: string, id: string): { contentType: string; body: string } | null {
  const m = /^[0-9a-f]{64}i(\d+)$/i.exec(id);
  if (!m) return null;
  const tx = bitcoin.Transaction.fromHex(rawHex);
  const w = tx.ins[Number(m[1])]?.witness;
  if (!w || w.length < 3) return null;
  const env = parseEnvelope(w[w.length - 2]);
  return env ? { contentType: env.contentType, body: env.body.toString("utf8") } : null;
}
