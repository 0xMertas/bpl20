# BPL20

An experimental, open-source token protocol idea for Bitcoin.

> **Status: draft v0.1. Nothing is live.**
> There is no deployed token, no mint, no sale, and no official wallet or marketplace support.
> This is an independent project. It is not affiliated with Bitcoin Core, BRC-20, or UniSat.
> Nothing here is financial advice or an offer to sell anything.

## What this is

BPL20 tokens would be recorded as data on Bitcoin. An open-source **indexer** reads the chain, applies public rules, and keeps track of balances, so anyone can run it and verify the result.

Principles:
- **Open:** spec and code are public.
- **Fair:** no premine and no team allocation in the design.
- **Verifiable:** balances can be recomputed from the blockchain by anyone.

## What exists today

- `src/state.ts`: the data the indexer remembers.
- `src/deploy.ts`: deploy rules (first valid deploy wins).
- `src/mint.ts`: mint rules (per-mint limit, supply cap).

This is early code with **no automated tests yet**. It does not read the blockchain yet.

## What does not exist yet

- Reading blocks and inscriptions from a Bitcoin node
- Transfers and burns
- Reorg handling and same-block ordering
- Tests
- A website

See `SPEC.md` for the draft rules and open questions.

## Roadmap (no dates)

1. Core rules and tests
2. Chain reader and indexer
3. Signet (test network) trials
4. Website with wallet connection
5. Token-to-NFT conversion (research only)
6. Non-custodial trading (research only)

Mainnet only after the earlier steps work and have been reviewed.

## Contributing

Read the code, find mistakes, open an issue or pull request. Good first tasks: write tests for `applyDeploy` and `applyMint`, review the edge cases in `SPEC.md`, or suggest rule changes.

Founding testers are listed in `CONTRIBUTORS.md`.

## Safety

- Nobody working on this project will ask for your seed phrase or private keys.
- Nobody will DM you first asking for money or wallet details.
- Do not send funds to any address claiming to be BPL20. None exists.

## License

MIT
